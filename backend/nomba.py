"""Nomba payment gateway integration for Nigerian bank payouts."""
import os
import time
import logging
import httpx

logger = logging.getLogger(__name__)

NOMBA_BASE = "https://api.nomba.com"

_token_cache: dict = {"token": None, "expires_at": 0}


async def _get_token(client_id: str, client_secret: str, account_id: str) -> str:
    """Fetch and cache a Nomba access token."""
    now = time.time()
    if _token_cache["token"] and _token_cache["expires_at"] - now > 30:
        return _token_cache["token"]
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            f"{NOMBA_BASE}/v1/auth/token/issue",
            headers={"accountId": account_id, "Content-Type": "application/json"},
            json={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
            },
        )
        data = resp.json()
    if not data.get("code") in ("00", 0) and not data.get("data", {}).get("access_token"):
        # Some Nomba responses use status / accessToken keys; be lenient
        access = (data.get("data") or {}).get("access_token") or data.get("access_token")
        if not access:
            raise RuntimeError(f"Nomba auth failed: {data}")
    access = (data.get("data") or {}).get("access_token") or data.get("access_token")
    expires_in = int((data.get("data") or {}).get("expires_in") or 3600)
    _token_cache["token"] = access
    _token_cache["expires_at"] = now + expires_in
    return access


async def transfer_to_bank(
    *, client_id: str, client_secret: str, account_id: str,
    amount_naira: float, account_number: str, account_name: str, bank_code: str,
    merchant_tx_ref: str, sender_name: str = "NaijaInvest", narration: str = "Withdrawal payout",
) -> dict:
    """Initiate a bank transfer via Nomba."""
    token = await _get_token(client_id, client_secret, account_id)
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{NOMBA_BASE}/v2/transfers/bank",
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
        return resp.json()
