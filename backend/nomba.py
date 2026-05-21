"""Nomba payment gateway integration for Nigerian bank payouts."""
import os
import time
import logging
import httpx

logger = logging.getLogger(__name__)

NOMBA_BASE_PROD = "https://api.nomba.com"
NOMBA_BASE_SANDBOX = "https://sandbox.nomba.com"


def _base_url(client_id: str) -> str:
    # Nomba sandbox client IDs typically start with 'sand_' or contain 'sandbox' / 'test'.
    cid = (client_id or "").lower()
    if "sand" in cid or "test" in cid:
        return NOMBA_BASE_SANDBOX
    # Allow override via env (NOMBA_BASE_URL)
    return os.environ.get("NOMBA_BASE_URL") or NOMBA_BASE_PROD


_token_cache: dict = {"token": None, "expires_at": 0, "base": ""}


async def _get_token(client_id: str, client_secret: str, account_id: str) -> tuple[str, str]:
    """Fetch and cache a Nomba access token. Returns (token, base_url).

    Tries the heuristically-chosen base first, then auto-fallbacks to the other
    (e.g. sandbox tokens silently routed to production return 403 → retry on sandbox).
    """
    base_primary = _base_url(client_id)
    base_secondary = NOMBA_BASE_SANDBOX if base_primary == NOMBA_BASE_PROD else NOMBA_BASE_PROD
    now = time.time()
    if _token_cache["token"] and _token_cache["expires_at"] - now > 30:
        return _token_cache["token"], _token_cache["base"]

    last_err = None
    for base in (base_primary, base_secondary):
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
                _token_cache["expires_at"] = now + expires_in
                _token_cache["base"] = base
                return access, base
            last_err = data
        except Exception as e:
            last_err = str(e)
    raise RuntimeError(f"Nomba auth failed on both prod and sandbox: {last_err}")


async def transfer_to_bank(
    *, client_id: str, client_secret: str, account_id: str,
    amount_naira: float, account_number: str, account_name: str, bank_code: str,
    merchant_tx_ref: str, sender_name: str = "NaijaInvest", narration: str = "Withdrawal payout",
) -> dict:
    """Initiate a bank transfer via Nomba."""
    token, base = await _get_token(client_id, client_secret, account_id)
    async with httpx.AsyncClient(timeout=30) as client:
        async def _post(b):
            return await client.post(
                f"{b}/v2/transfers/bank",
                headers={
                    "Authorization": f"Bearer {token}",
                    "accountId": account_id,
                    "Content-Type": "application/json",
                },
                json={
                    "amount": float(amount_naira),
                    "accountNumber": account_number,
                    "accountName": account_name,
                    "bankCode": bank_code,
                    "merchantTxRef": merchant_tx_ref,
                    "senderName": sender_name,
                    "narration": narration,
                },
            )
        resp = await _post(base)
        try:
            data = resp.json()
        except Exception:
            data = {}
        if _is_sandbox_redirect(resp.status_code, data):
            other = NOMBA_BASE_SANDBOX if base == NOMBA_BASE_PROD else NOMBA_BASE_PROD
            _token_cache["base"] = other
            resp = await _post(other)
            data = resp.json()
        return data


def _is_sandbox_redirect(resp_status: int, resp_data: dict) -> bool:
    """Detect Nomba's sandbox-vs-production mismatch (can come as 403 OR as a 200/4xx with a sandbox hint message)."""
    if resp_status == 403:
        return True
    msg = (str(resp_data.get("description") or "") + " " + str(resp_data.get("message") or "")).lower()
    return "sandbox" in msg and "base url" in msg


async def list_banks(*, client_id: str, client_secret: str, account_id: str) -> list[dict]:
    """Fetch the bank list from Nomba. Returns [{name, code}, ...]."""
    token, base = await _get_token(client_id, client_secret, account_id)
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            f"{base}/v1/transfers/banks",
            headers={"Authorization": f"Bearer {token}", "accountId": account_id},
        )
        try:
            data = resp.json()
        except Exception:
            data = {}
        if _is_sandbox_redirect(resp.status_code, data):
            other = NOMBA_BASE_SANDBOX if base == NOMBA_BASE_PROD else NOMBA_BASE_PROD
            _token_cache["base"] = other
            resp = await client.get(
                f"{other}/v1/transfers/banks",
                headers={"Authorization": f"Bearer {token}", "accountId": account_id},
            )
            data = resp.json()
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
    account_number: str, bank_code: str,
) -> dict:
    """Resolve an NGN account number with Nomba. Returns {account_name, account_number}."""
    token, base = await _get_token(client_id, client_secret, account_id)
    async with httpx.AsyncClient(timeout=20) as client:
        async def _post(b):
            return await client.post(
                f"{b}/v1/transfers/bank/lookup",
                headers={
                    "Authorization": f"Bearer {token}",
                    "accountId": account_id,
                    "Content-Type": "application/json",
                },
                json={"accountNumber": account_number, "bankCode": bank_code},
            )
        resp = await _post(base)
        try:
            data = resp.json()
        except Exception:
            data = {}
        if _is_sandbox_redirect(resp.status_code, data):
            other = NOMBA_BASE_SANDBOX if base == NOMBA_BASE_PROD else NOMBA_BASE_PROD
            _token_cache["base"] = other
            resp = await _post(other)
            data = resp.json()
    d = data.get("data") or {}
    name = d.get("accountName") or d.get("account_name")
    num = d.get("accountNumber") or d.get("account_number") or account_number
    if not name:
        raise RuntimeError(data.get("description") or data.get("message") or "Nomba account lookup failed")
    return {"account_name": name, "account_number": num}
