"""Gateway-aware Nigerian bank helpers.

Bank codes are provider-specific: the code Paystack expects for a bank can differ
from Nomba's code for the same bank. To avoid payout conflicts, we always fetch
the bank list / resolve accounts using the CONFIGURED payout gateway, and — as a
safety net at payout time — re-map a saved bank_code to the payout gateway's own
code by matching the bank NAME.
"""
import re
import logging

from payments_proxy import fixie_client

logger = logging.getLogger(__name__)


def _norm_bank(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def _has_nomba(s: dict) -> bool:
    return bool(s.get("nomba_client_id") and s.get("nomba_client_secret") and s.get("nomba_account_id"))


def gateway_order(s: dict) -> list[str]:
    """Providers to try, PRIMARY = configured payout_gateway, then the other.
    Only includes providers that actually have credentials configured."""
    primary = (s.get("payout_gateway") or "paystack").lower()
    ordered = [primary, "nomba" if primary == "paystack" else "paystack"]
    avail = []
    for g in ordered:
        if g == "paystack" and s.get("paystack_secret_key"):
            avail.append(g)
        elif g == "nomba" and _has_nomba(s):
            avail.append(g)
    return avail


async def _paystack_bank_list(secret: str) -> list[dict]:
    async with fixie_client(timeout=15) as c:
        resp = await c.get(
            "https://api.paystack.co/bank",
            params={"country": "nigeria", "perPage": "200"},
            headers={"Authorization": f"Bearer {secret}"},
        )
        data = resp.json()
    if data.get("status"):
        return [{"name": b["name"], "code": b["code"]} for b in data["data"]]
    return []


async def _nomba_bank_list(s: dict) -> list[dict]:
    from nomba import list_banks as nomba_list
    return await nomba_list(
        client_id=s["nomba_client_id"],
        client_secret=s["nomba_client_secret"],
        account_id=s["nomba_account_id"],
        environment=s.get("nomba_environment"),
    ) or []


async def bank_list_for(s: dict, gateway: str) -> list[dict]:
    if gateway == "paystack" and s.get("paystack_secret_key"):
        return await _paystack_bank_list(s["paystack_secret_key"])
    if gateway == "nomba" and _has_nomba(s):
        return await _nomba_bank_list(s)
    return []


async def resolve_for(s: dict, gateway: str, account_number: str, bank_code: str) -> dict | None:
    """Resolve an account name using a specific gateway. Returns dict or None."""
    if gateway == "paystack" and s.get("paystack_secret_key"):
        async with fixie_client(timeout=15) as c:
            resp = await c.get(
                "https://api.paystack.co/bank/resolve",
                params={"account_number": account_number, "bank_code": bank_code},
                headers={"Authorization": f"Bearer {s['paystack_secret_key']}"},
            )
            data = resp.json()
        if data.get("status") and data.get("data"):
            return {
                "account_name": data["data"]["account_name"],
                "account_number": data["data"]["account_number"],
                "mode": "live",
                "provider": "paystack",
            }
        return None
    if gateway == "nomba" and _has_nomba(s):
        from nomba import resolve_account as nomba_resolve
        res = await nomba_resolve(
            client_id=s["nomba_client_id"],
            client_secret=s["nomba_client_secret"],
            account_id=s["nomba_account_id"],
            account_number=account_number,
            bank_code=bank_code,
            environment=s.get("nomba_environment"),
        )
        return {**res, "mode": "live", "provider": "nomba"}
    return None


async def remap_bank_code(s: dict, gateway: str, bank_name: str, current_code: str) -> str:
    """Return the bank_code valid for `gateway`, matched by bank NAME.

    Falls back to `current_code` if the gateway's bank list is unavailable or no
    name match is found. This lets a payout succeed even when the saved code came
    from a different gateway.
    """
    try:
        banks = await bank_list_for(s, gateway)
    except Exception as e:
        logger.warning(f"remap_bank_code: could not fetch {gateway} bank list: {e}")
        return current_code
    if not banks or not bank_name:
        return current_code
    target = _norm_bank(bank_name)
    for b in banks:
        if _norm_bank(b["name"]) == target:
            return b["code"]
    for b in banks:  # looser contains match for fintechs (e.g. "Opay" vs "OPay Digital")
        n = _norm_bank(b["name"])
        if target and (target in n or n in target):
            return b["code"]
    return current_code
