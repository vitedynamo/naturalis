"""Marasoft Pay payment gateway integration (Nigerian payment gateway).

Reference: https://developers.marasoftpay.live/

Marasoft does not use OAuth tokens — every request includes `public_key` and
`request_type` directly in the JSON body. The same base URL serves test/live
mode; the `request_type` flag and the key prefix (MSFT_Test_ vs MSFT_Live_)
choose the environment.

If `MARASOFT_PROXY_URL` env var is set, all Marasoft calls route through the
proxy so the gateway sees a stable, whitelisted IP (same Fixie pattern as
nomba.py).
"""
import os
import logging
import httpx

logger = logging.getLogger(__name__)

MARASOFT_CHECKOUT_BASE = "https://checkout.marasoftpay.live"
MARASOFT_API_BASE = "https://api.marasoftpay.live"


def _ms_client(timeout: int = 20) -> httpx.AsyncClient:
    proxy = os.environ.get("MARASOFT_PROXY_URL") or os.environ.get("NOMBA_PROXY_URL") or None
    if proxy:
        return httpx.AsyncClient(timeout=timeout, proxy=proxy)
    return httpx.AsyncClient(timeout=timeout)


def _request_type_from_key(public_key: str) -> str:
    pk = (public_key or "").lower()
    return "test" if "test" in pk else "live"


async def initiate_transaction(
    *, public_key: str, merchant_tx_ref: str, redirect_url: str,
    name: str, email_address: str, phone_number: str, amount_naira: float,
    description: str = "Wallet funding", preferred_payment_option: str | None = None,
    webhook_url: str | None = None, currency: str = "NGN",
) -> dict:
    """Create a Marasoft Pay checkout session. Returns the data dict containing `url`.

    Amount is converted to kobo (lowest unit) per Marasoft's spec.
    """
    payload = {
        "public_key": public_key,
        "request_type": _request_type_from_key(public_key),
        "merchant_tx_ref": merchant_tx_ref,
        "redirect_url": redirect_url,
        "name": name or "Customer",
        "email_address": email_address,
        "phone_number": phone_number,
        "amount": str(int(round(float(amount_naira) * 100))),  # kobo
        "currency": currency,
        "user_bear_charge": "no",
        "description": description,
    }
    if preferred_payment_option:
        payload["preferred_payment_option"] = preferred_payment_option
    if webhook_url:
        payload["webhook_url"] = webhook_url

    async with _ms_client(timeout=20) as client:
        resp = await client.post(
            f"{MARASOFT_CHECKOUT_BASE}/initiate_transaction",
            json={"data": payload},
            headers={"Content-Type": "application/json"},
        )
        try:
            data = resp.json()
        except Exception:
            data = {"raw": resp.text}
    if (data.get("status") or "").lower() != "success" or not data.get("url"):
        raise RuntimeError(
            data.get("message") or data.get("description") or f"Marasoft initiate failed (HTTP {resp.status_code})"
        )
    return {"authorization_url": data["url"], "raw": data}


async def verify_transaction(*, public_key: str, secret_key: str, merchant_tx_ref: str) -> dict:
    """Server-side verify a transaction status with Marasoft.

    Endpoint per docs: POST https://checkout.marasoftpay.live/verify_transaction
    Returns dict like {status: 'success'|'failed'|'pending', raw: ...}
    """
    payload = {
        "public_key": public_key,
        "secret_key": secret_key,
        "request_type": _request_type_from_key(public_key),
        "merchant_tx_ref": merchant_tx_ref,
    }
    async with _ms_client(timeout=20) as client:
        resp = await client.post(
            f"{MARASOFT_CHECKOUT_BASE}/verify_transaction",
            json={"data": payload},
            headers={"Content-Type": "application/json"},
        )
        try:
            data = resp.json()
        except Exception:
            data = {"raw": resp.text}
    raw_status = (data.get("data", {}).get("status") or data.get("status") or "").lower()
    if raw_status in ("success", "successful", "paid", "completed"):
        norm = "success"
    elif raw_status in ("failed", "failure", "reversed", "rejected", "cancelled"):
        norm = "failed"
    else:
        norm = "pending"
    return {"status": norm, "raw_status": raw_status, "raw": data}


async def check_transaction_status(*, enc_key: str, transaction_ref: str) -> dict:
    """Check status of a transaction made via a dynamic / reserved account.

    Endpoint per docs: POST https://api.marasoftpay.live/checktransaction
    Docs: https://developers.marasoftpay.live/tools/check-transaction-status.php

    Marasoft returns weird response shape:
      success -> {"status": "true", "transaction_ref": "Successful", ...}
      pending -> {"status": "false", "message": "Transaction not found" / similar}
      failed  -> rare; transaction_ref will be set to a failure word

    Returns normalised {status: 'success'|'failed'|'pending', amount_received, raw}.
    """
    payload = {"enc_key": enc_key, "transaction_ref": transaction_ref}
    async with _ms_client(timeout=20) as client:
        resp = await client.post(
            f"{MARASOFT_API_BASE}/checktransaction",
            data=payload,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        try:
            data = resp.json()
        except Exception:
            data = {"raw": resp.text}
    # Marasoft returns "status": "true"/"false" (strings) on this endpoint
    status_field = str(data.get("status") or "").lower()
    tx_ref_field = str(data.get("transaction_ref") or "").lower()
    ok = status_field in ("true", "1", "success", "successful") and (
        not tx_ref_field or "success" in tx_ref_field or "paid" in tx_ref_field or "completed" in tx_ref_field
    )
    if ok:
        norm = "success"
    elif tx_ref_field in ("failed", "failure", "reversed", "rejected", "cancelled"):
        norm = "failed"
    else:
        # status=false / pending / "transaction not found" → still pending
        norm = "pending"
    return {
        "status": norm,
        "raw_status": status_field,
        "amount_received": data.get("amount_received") or data.get("settled_amount"),
        "raw": data,
    }


async def create_dynamic_account(
    *, enc_key: str, amount_naira: float, transaction_ref: str,
) -> dict:
    """Create a Marasoft Pay dynamic (one-time) virtual account.

    Endpoint: POST https://api.marasoftpay.live/generate_dynamic_account/
    Docs: https://developers.marasoftpay.live/collections/dynamic-accounts.php

    Dynamic accounts are tied to a single amount and payment reference; once paid,
    they can no longer be used. No KYC fields are required — only the merchant's
    encryption key, the amount, and our reconciliation reference.

    Returns: {account_name, account_number, bank, amount_to_pay, raw}.
    """
    payload = {
        "enc_key": enc_key,
        "amount": str(int(round(float(amount_naira)))),  # whole naira per Marasoft sample
        "transaction_ref": transaction_ref,
    }
    async with _ms_client(timeout=30) as client:
        resp = await client.post(
            f"{MARASOFT_API_BASE}/generate_dynamic_account/",
            data=payload,  # FORM-DATA per Marasoft docs
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        try:
            data = resp.json()
        except Exception:
            data = {"raw": resp.text}
    # Marasoft signals success via {"status": true, ...} on this endpoint
    ok = bool(data.get("status")) and data.get("account_number")
    if not ok:
        raise RuntimeError(
            data.get("message") or data.get("description") or f"Dynamic account creation failed (HTTP {resp.status_code})"
        )
    return {
        "account_name": data.get("account_name"),
        "account_number": data.get("account_number"),
        "bank": data.get("bank_name"),
        "amount_to_pay": data.get("amount_to_pay"),
        "raw": data,
    }
