"""QorePay payment gateway integration (Nigerian payment gateway).

Reference: https://app.qorepay.com/docs/reference

Auth: Bearer token using the merchant secret key (qp_live_... or qp_test_...).
Base URL: https://api.qorepay.com
"""
import os
import logging
import httpx

logger = logging.getLogger(__name__)

QOREPAY_API_BASE = "https://api.qorepay.com"


def _qp_client(timeout: int = 20) -> httpx.AsyncClient:
    proxy = os.environ.get("QOREPAY_PROXY_URL") or os.environ.get("NOMBA_PROXY_URL") or None
    if proxy:
        return httpx.AsyncClient(timeout=timeout, proxy=proxy)
    return httpx.AsyncClient(timeout=timeout)


async def initialize_transaction(
    *, secret_key: str, reference: str, amount_naira: float, email: str,
    name: str | None, currency: str = "NGN", channel: str = "TRANSFER",
    redirect_url: str | None = None, brand_id: str | None = None,
):
    """POST /v1/purchases — returns checkout link / transfer account details.

    QorePay requires top-level `brand_id` and `customer_email` (validated by their
    API). The `brand_id` is set in your QorePay merchant dashboard under Brands.
    """
    payload: dict = {
        "reference": reference,
        # QorePay expects amounts in KOBO (smallest currency unit). NGN minimum is
        # ₦150 = 15 000 kobo per their API validation.
        "amount": int(round(amount_naira * 100)),
        "currency": currency,
        "channel": channel,
        "customer_email": email,
        "customer_name": name or email.split("@")[0],
    }
    if brand_id:
        payload["brand_id"] = brand_id
    if redirect_url:
        payload["redirect_url"] = redirect_url
    headers = {
        "Authorization": f"Bearer {secret_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    async with _qp_client() as client:
        resp = await client.post(
            f"{QOREPAY_API_BASE}/v1/purchases",
            json=payload, headers=headers,
        )
    try:
        data = resp.json()
    except Exception:
        data = {"status": False, "message": resp.text[:200]}
    if resp.status_code >= 400:
        logger.warning("QorePay init failed %s: %s", resp.status_code, data)
    return data


async def verify_transaction(*, secret_key: str, reference: str):
    """GET /v1/transactions/{reference} — returns transaction status payload."""
    headers = {
        "Authorization": f"Bearer {secret_key}",
        "Accept": "application/json",
    }
    async with _qp_client() as client:
        resp = await client.get(
            f"{QOREPAY_API_BASE}/v1/transactions/{reference}",
            headers=headers,
        )
    try:
        data = resp.json()
    except Exception:
        data = {"status": False, "message": resp.text[:200]}
    return data
