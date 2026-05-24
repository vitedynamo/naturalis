"""Nomba payment gateway integration for Nigerian bank payouts."""
import os
import time
import logging
import httpx

logger = logging.getLogger(__name__)

NOMBA_BASE_PROD = "https://api.nomba.com"
NOMBA_BASE_SANDBOX = "https://sandbox.nomba.com"


def _base_for_env(env: str | None, client_id: str = "") -> str:
    """Resolve the Nomba base URL from the explicit environment setting first,
    then a heuristic on the client_id, then the env var override, then production.
    """
    e = (env or "").strip().lower()
    if e == "sandbox":
        return NOMBA_BASE_SANDBOX
    if e == "production":
        return NOMBA_BASE_PROD
    # Heuristic on client_id
    cid = (client_id or "").lower()
    if "sand" in cid or "test" in cid:
        return NOMBA_BASE_SANDBOX
    return os.environ.get("NOMBA_BASE_URL") or NOMBA_BASE_PROD


# token cache key: (client_id, base) so that switching env auto-creates a new token
_token_cache: dict = {"token": None, "expires_at": 0, "base": "", "key": ""}


def _cache_key(client_id: str, base: str) -> str:
    return f"{client_id}::{base}"


def invalidate_token_cache():
    """Clear the cached token. Called from admin routes when settings change."""
    _token_cache["token"] = None
    _token_cache["expires_at"] = 0
    _token_cache["base"] = ""
    _token_cache["key"] = ""


async def _issue_token(client_id: str, client_secret: str, account_id: str, base: str) -> str | None:
    """Try to issue a token against a specific base. Returns access_token or None on failure."""
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{base}/v1/auth/token/issue",
                headers={"accountId": account_id, "Content-Type": "application/json"},
                json={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                },
            )
            data = resp.json()
        access = (data.get("data") or {}).get("access_token") or data.get("access_token")
        if access:
            expires_in = int((data.get("data") or {}).get("expires_in") or 3600)
            _token_cache["token"] = access
            _token_cache["expires_at"] = time.time() + expires_in
            _token_cache["base"] = base
            _token_cache["key"] = _cache_key(client_id, base)
            logger.info(f"Nomba token issued against {base}")
            return access
        logger.warning(f"Nomba auth at {base} returned no access_token: {data}")
    except Exception as e:
        logger.warning(f"Nomba auth at {base} errored: {e}")
    return None


async def _get_token(client_id: str, client_secret: str, account_id: str, environment: str | None = None) -> tuple[str, str]:
    """Get a valid token bound to the right base. Returns (token, base_url).

    Strategy:
    1. If cached token still valid AND its cache key matches the configured base → return it.
    2. Else try issuing against the configured base.
    3. If that fails AND environment is not explicitly set → try the other base.
    4. Else raise.
    """
    target_base = _base_for_env(environment, client_id)
    target_key = _cache_key(client_id, target_base)
    now = time.time()
    if (
        _token_cache["token"]
        and _token_cache["key"] == target_key
        and _token_cache["expires_at"] - now > 30
    ):
        return _token_cache["token"], _token_cache["base"]

    # Try configured base first
    token = await _issue_token(client_id, client_secret, account_id, target_base)
    if token:
        return token, target_base

    # If env was NOT explicitly chosen, try the other base as fallback
    if not (environment and environment.lower() in ("sandbox", "production")):
        other = NOMBA_BASE_SANDBOX if target_base == NOMBA_BASE_PROD else NOMBA_BASE_PROD
        token = await _issue_token(client_id, client_secret, account_id, other)
        if token:
            return token, other

    raise RuntimeError(f"Nomba auth failed. Check credentials and environment setting (current: {environment or 'auto'}).")


def _is_sandbox_redirect(resp_status: int, resp_data: dict) -> bool:
    """Detect Nomba's sandbox-vs-production mismatch (403 OR a hint message in the body)."""
    if resp_status == 403:
        return True
    msg = (str(resp_data.get("description") or "") + " " + str(resp_data.get("message") or "")).lower()
    return ("sandbox" in msg and "base url" in msg) or ("environment" in msg and "mismatch" in msg)


async def _call_with_fallback(
    *, client_id: str, client_secret: str, account_id: str, environment: str | None,
    method: str, path: str, params: dict | None = None, json_body: dict | None = None,
    timeout: int = 20,
) -> tuple[int, dict]:
    """Make a Nomba API call. If the response indicates a base-url mismatch AND `environment`
    was not explicitly chosen, re-issue the token against the other base and retry once.

    Returns (status_code, parsed_json).
    """
    token, base = await _get_token(client_id, client_secret, account_id, environment)

    async def _do(b, t):
        headers = {"Authorization": f"Bearer {t}", "accountId": account_id}
        if json_body is not None:
            headers["Content-Type"] = "application/json"
        async with httpx.AsyncClient(timeout=timeout) as client:
            if method.upper() == "GET":
                return await client.get(f"{b}{path}", params=params, headers=headers)
            else:
                return await client.post(f"{b}{path}", params=params, json=json_body, headers=headers)

    resp = await _do(base, token)
    try:
        data = resp.json()
    except Exception:
        data = {}

    if _is_sandbox_redirect(resp.status_code, data):
        # If env was explicitly chosen, don't silently switch — surface the error
        if environment and environment.lower() in ("sandbox", "production"):
            logger.warning(f"Nomba {path} returned {resp.status_code} on {base} but env is fixed to {environment}; not switching.")
            return resp.status_code, data
        # Otherwise: invalidate, switch base, RE-ISSUE TOKEN on the other base, retry
        other = NOMBA_BASE_SANDBOX if base == NOMBA_BASE_PROD else NOMBA_BASE_PROD
        logger.info(f"Nomba {path} returned {resp.status_code} on {base}; re-auth + retry on {other}")
        invalidate_token_cache()
        new_token = await _issue_token(client_id, client_secret, account_id, other)
        if new_token:
            resp = await _do(other, new_token)
            try:
                data = resp.json()
            except Exception:
                data = {}

    return resp.status_code, data


async def transfer_to_bank(
    *, client_id: str, client_secret: str, account_id: str,
    amount_naira: float, account_number: str, account_name: str, bank_code: str,
    merchant_tx_ref: str, sender_name: str = "NaijaInvest", narration: str = "Withdrawal payout",
    environment: str | None = None,
) -> dict:
    """Initiate a bank transfer via Nomba. Raises RuntimeError if Nomba rejects the transfer."""
    status, data = await _call_with_fallback(
        client_id=client_id, client_secret=client_secret, account_id=account_id,
        environment=environment, method="POST", path="/v2/transfers/bank",
        json_body={
            "amount": float(amount_naira),
            "accountNumber": account_number,
            "accountName": account_name,
            "bankCode": bank_code,
            "merchantTxRef": merchant_tx_ref,
            "senderName": sender_name,
            "narration": narration,
        },
        timeout=30,
    )
    # Nomba returns code "00" for success in `data["code"]`
    success = (data.get("code") == "00") or (200 <= status < 300 and (data.get("data") or {}).get("status", "").upper() in ("SUCCESS", "SUCCESSFUL", "PENDING", "PROCESSING", ""))
    if status >= 400 or data.get("code") not in (None, "00"):
        msg = data.get("description") or data.get("message") or f"HTTP {status}"
        raise RuntimeError(f"Nomba transfer rejected: {msg}")
    if not success:
        msg = data.get("description") or data.get("message") or "unknown error"
        raise RuntimeError(f"Nomba transfer rejected: {msg}")
    return data


async def list_banks(*, client_id: str, client_secret: str, account_id: str, environment: str | None = None) -> list[dict]:
    """Fetch the bank list from Nomba. Returns [{name, code}, ...]."""
    _, data = await _call_with_fallback(
        client_id=client_id, client_secret=client_secret, account_id=account_id,
        environment=environment, method="GET", path="/v1/transfers/banks",
    )
    items = (data.get("data") or [])
    out = []
    for b in items:
        name = b.get("bankName") or b.get("name")
        code = b.get("bankCode") or b.get("code")
        if name and code:
            out.append({"name": name, "code": str(code)})
    return out


async def resolve_account(
    *, client_id: str, client_secret: str, account_id: str,
    account_number: str, bank_code: str, environment: str | None = None,
) -> dict:
    """Resolve an NGN account number with Nomba. Returns {account_name, account_number}."""
    _, data = await _call_with_fallback(
        client_id=client_id, client_secret=client_secret, account_id=account_id,
        environment=environment, method="POST", path="/v1/transfers/bank/lookup",
        json_body={"accountNumber": account_number, "bankCode": bank_code},
    )
    d = data.get("data") or {}
    name = d.get("accountName") or d.get("account_name")
    num = d.get("accountNumber") or d.get("account_number") or account_number
    if not name:
        raise RuntimeError(data.get("description") or data.get("message") or "Nomba account lookup failed")
    return {"account_name": name, "account_number": num}


async def get_wallet_balance(*, client_id: str, client_secret: str, account_id: str, environment: str | None = None) -> float:
    """Fetch the merchant's parent-account NGN balance via Nomba.

    Endpoint: GET /v1/accounts/balance
    Returns balance in naira (float). Raises RuntimeError on failure.
    """
    _, data = await _call_with_fallback(
        client_id=client_id, client_secret=client_secret, account_id=account_id,
        environment=environment, method="GET", path="/v1/accounts/balance",
    )
    d = data.get("data") or {}
    amt = d.get("amount") or d.get("balance") or d.get("availableBalance")
    if amt is None:
        raise RuntimeError(data.get("description") or data.get("message") or "Nomba balance fetch failed")
    try:
        return float(amt)
    except Exception:
        raise RuntimeError(f"Nomba returned non-numeric balance: {amt}")


async def get_transfer_status(
    *, client_id: str, client_secret: str, account_id: str, merchant_tx_ref: str,
    environment: str | None = None,
) -> dict:
    """Query Nomba for the status of a previous transfer by merchantTxRef.

    Endpoint: GET /v1/transactions/accounts/single?transactionRef=<ref>
    Returns dict with at least {status: 'SUCCESS'|'FAILED'|'PENDING', raw: ...}.
    """
    _, data = await _call_with_fallback(
        client_id=client_id, client_secret=client_secret, account_id=account_id,
        environment=environment, method="GET", path="/v1/transactions/accounts/single",
        params={"transactionRef": merchant_tx_ref},
    )
    d = data.get("data") or {}
    if isinstance(d, list):
        d = d[0] if d else {}
    raw_status = (d.get("status") or d.get("transactionStatus") or "").upper().strip()
    if raw_status in ("SUCCESS", "SUCCESSFUL", "COMPLETED", "PAID"):
        norm = "SUCCESS"
    elif raw_status in ("FAILED", "FAILURE", "DECLINED", "REVERSED", "REJECTED"):
        norm = "FAILED"
    elif raw_status in ("PENDING", "PROCESSING", "IN_PROGRESS"):
        norm = "PENDING"
    elif not raw_status:
        # Not found yet (Nomba sometimes lags) — treat as PENDING so caller retries later
        norm = "PENDING"
    else:
        norm = raw_status
    return {"status": norm, "raw_status": raw_status, "raw": d, "description": data.get("description")}
