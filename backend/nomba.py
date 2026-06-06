"""Nomba payment gateway integration for Nigerian bank payouts."""
import os
import time
import logging
import httpx

from fixie_counter import bump_async as _fixie_bump

logger = logging.getLogger(__name__)

NOMBA_BASE_PROD = "https://api.nomba.com"
NOMBA_BASE_SANDBOX = "https://sandbox.nomba.com"


async def _on_request_through_fixie(request):  # noqa: ARG001
    """httpx request event hook. Bumps the Fixie counter once per outbound
    request. Only attached when NOMBA_PROXY_URL is configured, so a missing
    proxy never triggers it."""
    _fixie_bump(1)


def _nomba_client(timeout: int = 20) -> httpx.AsyncClient:
    """Build an httpx client. If NOMBA_PROXY_URL is configured, route Nomba calls
    through it so Nomba sees a stable, whitelisted outbound IP instead of the
    app server's real (rotating) IP. Each outbound request through the proxy
    bumps the Fixie usage counter on the admin dashboard.
    """
    proxy = os.environ.get("NOMBA_PROXY_URL") or None
    if proxy:
        return httpx.AsyncClient(
            timeout=timeout,
            proxy=proxy,
            event_hooks={"request": [_on_request_through_fixie]},
        )
    return httpx.AsyncClient(timeout=timeout)


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
        async with _nomba_client(timeout=20) as client:
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
        async with _nomba_client(timeout=timeout) as client:
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
    merchant_tx_ref: str, sender_name: str = "Evoque-Nova", narration: str = "Withdrawal payout",
    environment: str | None = None,
) -> dict:
    """Initiate a bank transfer via Nomba. Raises RuntimeError if Nomba rejects the transfer.

    The returned dict mirrors Nomba's raw payload, with two convenience fields injected so
    the caller doesn't have to dig through the body shape:
        - `_nomba_transaction_id`: Nomba's own transactionId (e.g. ``API-TRANSFER-XXXX-XXXX``).
          This is the canonical key Nomba uses on its requery endpoint, so callers MUST
          persist it and pass it back when polling status (our `merchantTxRef` is not
          reliably indexed by Nomba's transactions endpoint).
        - `_nomba_status`: normalized transfer status as already reported by Nomba in the
          create-transfer response — one of ``SUCCESS|PENDING|FAILED``. If Nomba returns
          ``SUCCESS`` here we can skip the "processing" phase entirely.
    """
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
    # Nomba success criteria — be lenient with code variants.
    # Production Nomba returns various code formats ("00", "200", "S00", etc.) but a
    # `description` of "SUCCESS" / "SUCCESSFUL" is a reliable success indicator.
    inner = (data.get("data") or {}) if isinstance(data, dict) else {}
    raw_inner_status = (inner.get("status") or "").upper().strip()
    desc_upper = (data.get("description") or data.get("message") or "").upper().strip()
    code_str = str(data.get("code") or "").strip()
    http_ok = 200 <= status < 300

    code_indicates_success = code_str in ("", "00", "0", "200", "201")
    desc_indicates_success = "SUCCESS" in desc_upper or desc_upper in ("OK", "ACCEPTED", "")
    inner_indicates_non_failure = raw_inner_status in (
        "SUCCESS", "SUCCESSFUL", "COMPLETED", "PAID",
        "PENDING", "PROCESSING", "IN_PROGRESS", "",
    )

    success = http_ok and (code_indicates_success or desc_indicates_success or inner_indicates_non_failure)

    if not success:
        msg = data.get("description") or data.get("message") or f"HTTP {status}"
        raise RuntimeError(f"Nomba transfer rejected: {msg}")

    # Extract Nomba's transactionId — the canonical key for requery.
    # Try every common shape Nomba has used across docs/versions.
    def _find_nomba_id(blob, depth=0):
        """Recursively search the response for a value that looks like Nomba's transactionId
        (typically a string starting with 'API-TRANSFER' or matching common id field names)."""
        if depth > 4 or blob is None:
            return None
        if isinstance(blob, str):
            if blob.upper().startswith("API-TRANSFER") or blob.upper().startswith("API-NMB"):
                return blob
            return None
        if isinstance(blob, dict):
            # Preferred keys, then look at values
            for key in ("transactionId", "id", "transactionRef", "transaction_id",
                        "nombaTxnId", "nombaTransactionId", "providerTxnId"):
                v = blob.get(key)
                if isinstance(v, str) and v.strip():
                    return v
            for v in blob.values():
                found = _find_nomba_id(v, depth + 1)
                if found:
                    return found
        if isinstance(blob, list):
            for v in blob:
                found = _find_nomba_id(v, depth + 1)
                if found:
                    return found
        return None

    nomba_txn_id = _find_nomba_id(data)

    # Always log the raw Nomba transfer response so we can audit which fields are populated
    # in production (different Nomba environments have used slightly different response shapes).
    try:
        import json as _json
        import logging
        logging.getLogger("nomba").info(
            f"transfer_to_bank response: merchantTxRef={merchant_tx_ref} "
            f"extracted_txn_id={nomba_txn_id!r} inner_status={raw_inner_status!r} "
            f"inner_keys={list(inner.keys()) if isinstance(inner, dict) else 'non-dict'} "
            f"top_keys={list(data.keys()) if isinstance(data, dict) else 'non-dict'} "
            f"raw_truncated={_json.dumps(data)[:600]!r}"
        )
    except Exception:
        pass

    if raw_inner_status in ("SUCCESS", "SUCCESSFUL", "COMPLETED", "PAID"):
        norm_status = "SUCCESS"
    elif raw_inner_status in ("FAILED", "FAILURE", "DECLINED", "REVERSED", "REJECTED", "REFUND"):
        norm_status = "FAILED"
    elif not raw_inner_status and "SUCCESS" in desc_upper:
        # Inner payload didn't set a status field, but top-level description says SUCCESS.
        # Treat as confirmed success — production Nomba does this for some transfer types.
        norm_status = "SUCCESS"
    else:
        norm_status = "PENDING"

    out = dict(data) if isinstance(data, dict) else {"raw": data}
    out["_nomba_transaction_id"] = nomba_txn_id
    out["_nomba_status"] = norm_status
    return out


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
    nomba_transaction_id: str | None = None, environment: str | None = None,
) -> dict:
    """Query Nomba for the status of a previous transfer.

    Strategy (Nomba's requery is reliably keyed by their internal `transactionId`,
    NOT by our merchantTxRef):
      1. If `nomba_transaction_id` is provided, query with that. This is the canonical key.
      2. Else fall back to querying with our `merchantTxRef` — works on some Nomba envs but
         can return empty payloads on the production v1 endpoint.
      3. If the lookup returns no data, also try the v2 transfer endpoint as a last resort.

    Returns ``{status, raw_status, raw, description}`` where ``status`` is normalised to
    ``SUCCESS|FAILED|PENDING|REFUND``.
    """
    primary_ref = nomba_transaction_id or merchant_tx_ref

    async def _query_v1(ref):
        return await _call_with_fallback(
            client_id=client_id, client_secret=client_secret, account_id=account_id,
            environment=environment, method="GET", path="/v1/transactions/accounts/single",
            params={"transactionRef": ref},
        )

    _, data = await _query_v1(primary_ref)
    d = data.get("data") or {}
    if isinstance(d, list):
        d = d[0] if d else {}

    # Fallback 1: if we used Nomba's txn id but it returned empty, try our merchantTxRef
    if not d and nomba_transaction_id and merchant_tx_ref and merchant_tx_ref != primary_ref:
        _, data2 = await _query_v1(merchant_tx_ref)
        d2 = data2.get("data") or {}
        if isinstance(d2, list):
            d2 = d2[0] if d2 else {}
        if d2:
            data = data2
            d = d2

    # Fallback 2: try the v2 transfer-by-id endpoint
    if not d and primary_ref and primary_ref.upper().startswith("API-TRANSFER"):
        try:
            _, data3 = await _call_with_fallback(
                client_id=client_id, client_secret=client_secret, account_id=account_id,
                environment=environment, method="GET",
                path=f"/v2/transfers/bank/{primary_ref}",
            )
            d3 = data3.get("data") or {}
            if isinstance(d3, list):
                d3 = d3[0] if d3 else {}
            if d3:
                data = data3
                d = d3
        except Exception:
            pass

    # Fallback 3: scan the recent transaction list filtered by merchantTxRef
    # (some Nomba environments only index this endpoint, not the requery-single one).
    if not d and merchant_tx_ref:
        for query_path, param_name in (
            ("/v1/transactions/accounts", "merchantTxRef"),
            ("/v1/transactions/accounts", "transactionRef"),
            ("/v1/transfers/banks", "merchantTxRef"),
            ("/v1/transfers/banks", "transactionRef"),
        ):
            try:
                _, data4 = await _call_with_fallback(
                    client_id=client_id, client_secret=client_secret, account_id=account_id,
                    environment=environment, method="GET", path=query_path,
                    params={param_name: merchant_tx_ref, "limit": 1},
                )
                d4 = data4.get("data") or {}
                if isinstance(d4, list):
                    d4 = next((it for it in d4 if (it.get("merchantTxRef") or it.get("transactionRef") or it.get("merchant_tx_ref")) == merchant_tx_ref), d4[0] if d4 else {})
                if d4 and (d4.get("status") or d4.get("transactionStatus")):
                    data = data4
                    d = d4
                    break
            except Exception:
                continue

    # Always log the raw payload we'll act on — production debugging aid.
    try:
        import logging
        logging.getLogger("nomba").info(
            f"get_transfer_status: merchantTxRef={merchant_tx_ref} nomba_txn_id={nomba_transaction_id!r} "
            f"resolved_status={(d.get('status') or d.get('transactionStatus') or '')!r} "
            f"resolved_keys={list(d.keys()) if isinstance(d, dict) else 'non-dict'}"
        )
    except Exception:
        pass

    raw_status = (d.get("status") or d.get("transactionStatus") or "").upper().strip()
    if raw_status in ("SUCCESS", "SUCCESSFUL", "COMPLETED", "PAID"):
        norm = "SUCCESS"
    elif raw_status in ("FAILED", "FAILURE", "DECLINED", "REVERSED", "REJECTED"):
        norm = "FAILED"
    elif raw_status in ("REFUND", "REFUNDED"):
        # Nomba refunds the float when a transfer can't settle — treat as failed for our flow.
        norm = "FAILED"
    elif raw_status in ("PENDING", "PROCESSING", "IN_PROGRESS"):
        norm = "PENDING"
    elif not raw_status:
        # Not found yet (Nomba sometimes lags) — treat as PENDING so caller retries later
        norm = "PENDING"
    else:
        norm = raw_status
    return {"status": norm, "raw_status": raw_status, "raw": d, "description": data.get("description")}


async def list_transfers(
    *, client_id: str, client_secret: str, account_id: str,
    date_from: str | None = None, date_to: str | None = None,
    page: int = 1, limit: int = 100, environment: str | None = None,
) -> list[dict]:
    """Fetch the merchant's transfer transaction history from Nomba (paginated).

    Tries a handful of plausible endpoint+param shapes that Nomba has shipped across docs,
    and returns the first non-empty list found. Each item is the raw Nomba transaction
    object — callers should look for ``id`` / ``transactionId`` / ``merchantTxRef`` /
    ``status`` / ``amount`` / ``accountNumber`` / ``createdAt`` etc.
    """
    candidates = [
        ("/v1/transactions/accounts", {"limit": limit, "type": "transfer"}),
        ("/v1/transactions/accounts", {"limit": limit}),
        ("/v1/transactions", {"limit": limit, "type": "transfer"}),
        ("/v1/transactions", {"limit": limit}),
    ]
    for path, base_params in candidates:
        try:
            params = dict(base_params)
            # Nomba expects ISO datetime with seconds, not just YYYY-MM-DD.
            if date_from: params["dateFrom"] = date_from if "T" in date_from else f"{date_from}T00:00:00"
            if date_to: params["dateTo"] = date_to if "T" in date_to else f"{date_to}T23:59:59"
            status_code, data = await _call_with_fallback(
                client_id=client_id, client_secret=client_secret, account_id=account_id,
                environment=environment, method="GET", path=path, params=params, timeout=20,
            )
            # Dump the full response so we can see the shape Nomba is actually returning.
            try:
                import json as _json
                import logging
                logging.getLogger("nomba").info(
                    f"list_transfers RAW {path} · status={status_code} · "
                    f"top_keys={list(data.keys()) if isinstance(data, dict) else 'non-dict'} · "
                    f"body_truncated={_json.dumps(data)[:600]!r}"
                )
            except Exception:
                pass
            items = data.get("data") or data.get("items") or data.get("transactions") or []
            if isinstance(items, dict):
                # Real Nomba shape: {"data": {"results": [...]}} — try every nested key.
                items = (items.get("results") or items.get("items")
                         or items.get("data") or items.get("transactions") or [])
            if isinstance(items, list) and items:
                # Guard: ignore endpoints that obviously return non-transaction items
                # (e.g. the bank list, which has bankCode/bankName but no amount/transactionRef).
                sample = items[0] if items else {}
                if isinstance(sample, dict):
                    has_txn_shape = any(
                        sample.get(k) is not None for k in
                        ("amount", "transactionAmount", "merchantTxRef", "transactionRef",
                         "transactionId", "createdAt", "timeCreated", "accountNumber",
                         "customerBillerId", "id")
                    )
                    if not has_txn_shape:
                        try:
                            import logging
                            logging.getLogger("nomba").info(
                                f"list_transfers SKIP {path}: sample is not transaction-shaped: keys={list(sample.keys())[:8]}"
                            )
                        except Exception:
                            pass
                        continue
                try:
                    import json as _json
                    import logging
                    logging.getLogger("nomba").info(
                        f"list_transfers ok via {path} · page={page} · returned={len(items)} · "
                        f"sample_keys={list(items[0].keys())[:10] if isinstance(items[0], dict) else 'non-dict'} · "
                        f"sample_truncated={_json.dumps(items[0])[:400]!r}"
                    )
                except Exception:
                    pass
                return items
        except Exception as e:
            try:
                import logging
                logging.getLogger("nomba").info(f"list_transfers tried {path}: {e}")
            except Exception:
                pass
            continue
    return []

