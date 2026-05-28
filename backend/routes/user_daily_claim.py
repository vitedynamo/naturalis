"""User daily-claim flow — status check + claim endpoint.

Self-contained domain: depends only on `get_current_user`, a per-request
`db = request.app.state.db`, and platform-wide settings. Extracted from
`routes_user.py` as part of the incremental modularisation.
"""
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request

from _routers import user_router as router
from auth import get_current_user, gen_reference


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _settings(db) -> dict:
    return await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}


def _parse_last_claim(last) -> datetime | None:
    """Coerce a stored ISO/aware datetime into an aware UTC datetime."""
    if not last:
        return None
    try:
        last_dt = (
            datetime.fromisoformat(last.replace("Z", "+00:00"))
            if isinstance(last, str)
            else last
        )
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=timezone.utc)
        return last_dt
    except Exception:
        return None


@router.get("/daily-claim/status")
async def daily_claim_status(request: Request, user=Depends(get_current_user)):
    db = request.app.state.db
    settings = await _settings(db)
    enabled = bool(settings.get("daily_claim_enabled"))
    amount = float(settings.get("daily_claim_amount") or 0)
    last_dt = _parse_last_claim(user.get("last_daily_claim_at"))

    cooldown_remaining_sec = 0
    if last_dt is not None:
        elapsed = (datetime.now(timezone.utc) - last_dt).total_seconds()
        cooldown_remaining_sec = max(0, 24 * 3600 - int(elapsed))

    return {
        "enabled": enabled,
        "amount": amount,
        "can_claim": enabled and amount > 0 and cooldown_remaining_sec == 0,
        "cooldown_remaining_sec": cooldown_remaining_sec,
        "last_claim_at": user.get("last_daily_claim_at"),
    }


@router.post("/daily-claim/claim")
async def daily_claim_claim(request: Request, user=Depends(get_current_user)):
    db = request.app.state.db
    settings = await _settings(db)
    if not settings.get("daily_claim_enabled"):
        raise HTTPException(400, "Daily claim is disabled")
    amount = float(settings.get("daily_claim_amount") or 0)
    if amount <= 0:
        raise HTTPException(400, "Daily claim amount is zero")

    last_dt = _parse_last_claim(user.get("last_daily_claim_at"))
    if last_dt is not None:
        if (datetime.now(timezone.utc) - last_dt).total_seconds() < 24 * 3600:
            raise HTTPException(429, "You've already claimed today. Come back in 24 hours.")

    now = _now_iso()
    new_user = await db.users.find_one_and_update(
        {"id": user["id"]},
        {
            "$inc": {"wallet_balance": amount, "total_earnings": amount},
            "$set": {"last_daily_claim_at": now},
        },
        return_document=True,
        projection={"_id": 0, "wallet_balance": 1},
    )
    await db.transactions.insert_one({
        "id": gen_reference("tx"),
        "user_id": user["id"],
        "type": "daily_claim",
        "amount": amount,
        "description": "Daily sign-in bonus",
        "balance_after": new_user["wallet_balance"],
        "meta": {"source": "daily_claim"},
        "created_at": now,
    })
    return {"status": "ok", "amount": amount, "new_balance": new_user["wallet_balance"]}
