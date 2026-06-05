"""User-side coupon redemption + transaction history listing.

Both endpoints are self-contained — depend only on `get_current_user`, the
shared `_settings`-less code path, and standard helpers. Extracted from
`routes_user.py` as part of the incremental modularisation.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request

from _routers import user_router as router
from auth import get_current_user, gen_reference
from models import CouponRedeemRequest


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# =========== COUPONS ===========
@router.post("/coupons/redeem")
async def redeem_coupon(
    data: CouponRedeemRequest,
    request: Request,
    user=Depends(get_current_user),
):
    db = request.app.state.db
    # Same gate as withdrawals — only users with at least one active investment
    # can redeem coupons. Stops referral-only / coupon-farming behaviour where a
    # user signs up, redeems a bonus, and walks away.
    invest_count = await db.investments.count_documents({
        "user_id": user["id"],
        "status": "active",
    })
    if invest_count == 0:
        raise HTTPException(
            403,
            "Coupon redemption requires at least one active investment. Buy a package on the Invest tab to unlock coupon rewards.",
        )

    code = data.code.strip().upper()
    coupon = await db.coupons.find_one({"code": code, "is_active": True}, {"_id": 0})
    if not coupon:
        raise HTTPException(404, "Invalid coupon code")
    if coupon["used_count"] >= coupon["max_uses"]:
        raise HTTPException(400, "Coupon usage limit reached")
    already = await db.coupon_redemptions.find_one(
        {"coupon_id": coupon["id"], "user_id": user["id"]}
    )
    if already:
        raise HTTPException(400, "You have already redeemed this coupon")

    new_user = await db.users.find_one_and_update(
        {"id": user["id"]},
        {"$inc": {"wallet_balance": float(coupon["amount"])}},
        return_document=True,
        projection={"_id": 0},
    )
    await db.coupons.update_one({"id": coupon["id"]}, {"$inc": {"used_count": 1}})
    await db.coupon_redemptions.insert_one({
        "id": gen_reference("crd"),
        "coupon_id": coupon["id"],
        "user_id": user["id"],
        "code": code,
        "amount": float(coupon["amount"]),
        "created_at": _now_iso(),
    })
    await db.transactions.insert_one({
        "id": gen_reference("tx"),
        "user_id": user["id"],
        "type": "coupon",
        "amount": float(coupon["amount"]),
        "description": f"Coupon {code} redeemed",
        "balance_after": new_user["wallet_balance"],
        "meta": {"coupon_id": coupon["id"]},
        "created_at": _now_iso(),
    })
    return {
        "status": "ok",
        "amount": coupon["amount"],
        "wallet_balance": new_user["wallet_balance"],
    }


# =========== TRANSACTIONS ===========
@router.get("/transactions")
async def my_transactions(
    request: Request,
    ttype: Optional[str] = None,
    user=Depends(get_current_user),
):
    db = request.app.state.db
    q = {"user_id": user["id"]}
    if ttype:
        q["type"] = ttype
    items = await db.transactions.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return items
