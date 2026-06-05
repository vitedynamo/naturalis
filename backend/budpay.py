"""BudPay payment gateway integration (Nigerian payment gateway).

Reference: https://developer.budpay.com/

Auth: Bearer token using the merchant secret key (sk_live_... or sk_test_...).
Base URL: https://api.budpay.com
"""
import os
import logging
import httpx

logger = logging.getLogger(__name__)

BUDPAY_API_BASE = "https://api.budpay.com"


def _bud_client(timeout: int = 20) -> httpx.AsyncClient:
    # Allow routing through the same Fixie proxy used for other gateways so
    # webhook IPs match if BudPay restricts on outbound IP.
    proxy = os.environ.get("BUDPAY_PROXY_URL") or os.environ.get("NOMBA_PROXY_URL") or None
    if proxy:
        return httpx.AsyncClient(timeout=timeout, proxy=proxy)
    return httpx.AsyncClient(timeout=timeout)


async def initialize_transaction(
    *, secret_key: str, email: str, amount_naira: float, reference: str,
    callback_url: str, currency: str = "NGN", name: str | None = None,
):
    """Start a hosted-card transaction. Returns BudPay's response payload which
    includes `data.authorization_url`, `data.access_code`, `data.reference`.
    """
    payload = {
        "email": email,
        "amount": str(int(round(amount_naira))),  # BudPay accepts whole-NGN string
        "currency": currency,
        "callback": callback_url,
        "reference": reference,
    }
    if name:
        payload["name"] = name
    headers = {
        "Authorization": f"Bearer {secret_key}",
        "Content-Type": "application/json",
    }
    async with _bud_client() as client:
        resp = await client.post(
            f"{BUDPAY_API_BASE}/api/v2/transaction/initialize",
            json=payload, headers=headers,
        )
    try:
        data = resp.json()
    except Exception:
        data = {"status": False, "message": resp.text[:200]}
    if resp.status_code >= 400 or not data.get("status"):
        logger.warning("BudPay init failed %s: %s", resp.status_code, data)
    return data


async def initialize_bank_transfer(
    *, secret_key: str, email: str, amount_naira: float, reference: str,
    currency: str = "NGN", name: str | None = None,
):
    """Create a one-time virtual account for bank-transfer-only deposits.

    Endpoint: POST /api/v2/payment/bank-transfer
    Returns: { status, data: { account_number, account_name, bank_name, ... } }
    """
    payload = {
        "email": email,
        "amount": str(int(round(amount_naira))),
        "currency": currency,
        "reference": reference,
    }
    if name:
        payload["name"] = name
    headers = {
        "Authorization": f"Bearer {secret_key}",
        "Content-Type": "application/json",
    }
    async with _bud_client() as client:
        resp = await client.post(
            f"{BUDPAY_API_BASE}/api/v2/payment/bank-transfer",
            json=payload, headers=headers,
        )
    try:
        data = resp.json()
    except Exception:
        data = {"status": False, "message": resp.text[:200]}
    if resp.status_code >= 400 or not data.get("status"):
        logger.warning("BudPay bank-transfer init failed %s: %s", resp.status_code, data)
    return data


async def verify_transaction(*, secret_key: str, reference: str):
    """Returns BudPay verification payload with `data.status` and amount."""
    headers = {"Authorization": f"Bearer {secret_key}"}
    async with _bud_client() as client:
        resp = await client.get(
            f"{BUDPAY_API_BASE}/api/v2/transaction/verify/{reference}",
            headers=headers,
        )
    try:
        data = resp.json()
    except Exception:
        data = {"status": False, "message": resp.text[:200]}
    return data
