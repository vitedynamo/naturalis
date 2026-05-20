from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from auth import get_current_admin, gen_reference
from models import ProductCreate, CouponCreate, SettingsUpdate, AdminWithdrawalAction, PasswordResetActionRequest

router = APIRouter()


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


# ===== Dashboard stats =====
@router.get("/admin/stats")
async def admin_stats(request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    users_count = await db.users.count_documents({"is_admin": False})
    active_inv = await db.investments.count_documents({"status": "active"})
    total_deposits_agg = await db.deposits.aggregate([
        {"$match": {"status": "success"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    total_withdrawn_agg = await db.withdrawals.aggregate([
        {"$match": {"status": {"$in": ["approved", "paid"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    total_invested_agg = await db.investments.aggregate([
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    pending_withdrawals = await db.withdrawals.count_documents({"status": "pending"})
    pending_deposits = await db.deposits.count_documents({"status": "pending"})

    return {
        "users": users_count,
        "active_investments": active_inv,
        "total_deposits": (total_deposits_agg[0]["total"] if total_deposits_agg else 0),
        "total_withdrawn": (total_withdrawn_agg[0]["total"] if total_withdrawn_agg else 0),
        "total_invested": (total_invested_agg[0]["total"] if total_invested_agg else 0),
        "pending_withdrawals": pending_withdrawals,
        "pending_deposits": pending_deposits,
    }


# ===== Users =====
@router.get("/admin/users")
async def admin_users(request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(5000)
    return users


@router.post("/admin/users/{user_id}/block")
async def block_user(user_id: str, request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    await db.users.update_one({"id": user_id}, {"$set": {"is_blocked": True}})
    return {"status": "ok"}


@router.post("/admin/users/{user_id}/unblock")
async def unblock_user(user_id: str, request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    await db.users.update_one({"id": user_id}, {"$set": {"is_blocked": False}})
    return {"status": "ok"}


@router.post("/admin/users/{user_id}/adjust")
async def adjust_balance(user_id: str, payload: dict, request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    amount = float(payload.get("amount", 0))
    note = payload.get("note", "Admin adjustment")
    if amount == 0:
        raise HTTPException(400, "Amount cannot be zero")
    new_user = await db.users.find_one_and_update(
        {"id": user_id},
        {"$inc": {"wallet_balance": amount}},
        return_document=True,
        projection={"_id": 0},
    )
    if not new_user:
        raise HTTPException(404, "User not found")
    await db.transactions.insert_one({
        "id": gen_reference("tx"),
        "user_id": user_id,
        "type": "bonus" if amount > 0 else "refund",
        "amount": amount,
        "description": note,
        "balance_after": new_user["wallet_balance"],
        "meta": {"by_admin": True},
        "created_at": _now_iso(),
    })
    return {"status": "ok", "wallet_balance": new_user["wallet_balance"]}


# ===== Products =====
@router.get("/admin/products")
async def list_all_products(request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    items = await db.products.find({}, {"_id": 0}).sort("price", 1).to_list(500)
    return items


@router.post("/admin/products")
async def create_product(data: ProductCreate, request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    doc = {
        "id": gen_reference("prd"),
        "name": data.name,
        "description": data.description,
        "image_url": data.image_url,
        "price": float(data.price),
        "daily_profit_percent": float(data.daily_profit_percent),
        "duration_days": int(data.duration_days),
        "min_amount": float(data.min_amount),
        "max_amount": float(data.max_amount),
        "is_active": bool(data.is_active),
        "created_at": _now_iso(),
    }
    await db.products.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/admin/products/{product_id}")
async def update_product(product_id: str, data: ProductCreate, request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    update = {
        "name": data.name,
        "description": data.description,
        "image_url": data.image_url,
        "price": float(data.price),
        "daily_profit_percent": float(data.daily_profit_percent),
        "duration_days": int(data.duration_days),
        "min_amount": float(data.min_amount),
        "max_amount": float(data.max_amount),
        "is_active": bool(data.is_active),
    }
    res = await db.products.update_one({"id": product_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Product not found")
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    return doc


@router.delete("/admin/products/{product_id}")
async def delete_product(product_id: str, request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    await db.products.delete_one({"id": product_id})
    return {"status": "ok"}


# ===== Deposits =====
@router.get("/admin/deposits")
async def list_deposits(request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    items = await db.deposits.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    for it in items:
        u = await db.users.find_one({"id": it["user_id"]}, {"_id": 0, "name": 1, "phone": 1})
        it["user_name"] = u["name"] if u else "—"
        it["user_phone"] = u["phone"] if u else "—"
    return items


@router.post("/admin/deposits/{deposit_id}/approve")
async def approve_deposit(deposit_id: str, request: Request, _admin=Depends(get_current_admin)):
    """Admin can manually mark a pending deposit as success and credit wallet."""
    db = request.app.state.db
    deposit = await db.deposits.find_one({"id": deposit_id}, {"_id": 0})
    if not deposit:
        raise HTTPException(404, "Deposit not found")
    if deposit["status"] == "success":
        return {"status": "already_success"}
    await db.deposits.update_one({"id": deposit_id}, {"$set": {"status": "success", "updated_at": _now_iso()}})
    new_user = await db.users.find_one_and_update(
        {"id": deposit["user_id"]},
        {"$inc": {"wallet_balance": float(deposit["amount"])}},
        return_document=True,
        projection={"_id": 0},
    )
    await db.transactions.insert_one({
        "id": gen_reference("tx"),
        "user_id": deposit["user_id"],
        "type": "deposit",
        "amount": float(deposit["amount"]),
        "description": "Deposit approved by admin",
        "balance_after": new_user["wallet_balance"],
        "meta": {"reference": deposit["reference"], "by_admin": True},
        "created_at": _now_iso(),
    })
    return {"status": "ok"}


# ===== Withdrawals =====
@router.get("/admin/withdrawals")
async def list_withdrawals(request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    items = await db.withdrawals.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    for it in items:
        u = await db.users.find_one({"id": it["user_id"]}, {"_id": 0, "name": 1, "phone": 1})
        it["user_name"] = u["name"] if u else "—"
        it["user_phone"] = u["phone"] if u else "—"
    return items


@router.post("/admin/withdrawals/{wid}/approve")
async def approve_withdrawal(wid: str, payload: AdminWithdrawalAction, request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    w = await db.withdrawals.find_one({"id": wid}, {"_id": 0})
    if not w:
        raise HTTPException(404, "Withdrawal not found")
    if w["status"] != "pending":
        raise HTTPException(400, f"Already {w['status']}")
    await db.withdrawals.update_one(
        {"id": wid},
        {"$set": {"status": "paid", "admin_note": payload.note, "updated_at": _now_iso()}},
    )
    return {"status": "ok"}


@router.post("/admin/withdrawals/{wid}/reject")
async def reject_withdrawal(wid: str, payload: AdminWithdrawalAction, request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    w = await db.withdrawals.find_one({"id": wid}, {"_id": 0})
    if not w:
        raise HTTPException(404, "Withdrawal not found")
    if w["status"] != "pending":
        raise HTTPException(400, f"Already {w['status']}")
    # Refund wallet
    new_user = await db.users.find_one_and_update(
        {"id": w["user_id"]},
        {"$inc": {"wallet_balance": float(w["amount"])}},
        return_document=True,
        projection={"_id": 0},
    )
    await db.withdrawals.update_one(
        {"id": wid},
        {"$set": {"status": "rejected", "admin_note": payload.note, "updated_at": _now_iso()}},
    )
    await db.transactions.insert_one({
        "id": gen_reference("tx"),
        "user_id": w["user_id"],
        "type": "refund",
        "amount": float(w["amount"]),
        "description": f"Withdrawal rejected: {payload.note or 'no reason'}",
        "balance_after": new_user["wallet_balance"],
        "meta": {"withdrawal_id": wid},
        "created_at": _now_iso(),
    })
    return {"status": "ok"}


# ===== Investments =====
@router.get("/admin/investments")
async def list_all_investments(request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    items = await db.investments.find({}, {"_id": 0}).sort("started_at", -1).to_list(2000)
    for it in items:
        u = await db.users.find_one({"id": it["user_id"]}, {"_id": 0, "name": 1, "phone": 1})
        it["user_name"] = u["name"] if u else "—"
        it["user_phone"] = u["phone"] if u else "—"
    return items


# ===== Referrals =====
@router.get("/admin/referrals")
async def list_referrals(request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    items = await db.referrals.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    for it in items:
        r = await db.users.find_one({"id": it["referrer_id"]}, {"_id": 0, "name": 1, "phone": 1})
        d = await db.users.find_one({"id": it["referred_id"]}, {"_id": 0, "name": 1, "phone": 1})
        it["referrer_name"] = r["name"] if r else "—"
        it["referrer_phone"] = r["phone"] if r else "—"
        it["referred_name"] = d["name"] if d else "—"
        it["referred_phone"] = d["phone"] if d else "—"
    return items


# ===== Coupons =====
@router.get("/admin/coupons")
async def list_coupons(request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    return await db.coupons.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("/admin/coupons")
async def create_coupon(data: CouponCreate, request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    code = data.code.strip().upper()
    if await db.coupons.find_one({"code": code}):
        raise HTTPException(400, "Coupon code already exists")
    doc = {
        "id": gen_reference("cp"),
        "code": code,
        "amount": float(data.amount),
        "max_uses": int(data.max_uses),
        "used_count": 0,
        "is_active": bool(data.is_active),
        "created_at": _now_iso(),
    }
    await db.coupons.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/admin/coupons/{cid}")
async def update_coupon(cid: str, data: CouponCreate, request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    update = {
        "code": data.code.strip().upper(),
        "amount": float(data.amount),
        "max_uses": int(data.max_uses),
        "is_active": bool(data.is_active),
    }
    await db.coupons.update_one({"id": cid}, {"$set": update})
    return await db.coupons.find_one({"id": cid}, {"_id": 0})


@router.delete("/admin/coupons/{cid}")
async def delete_coupon(cid: str, request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    await db.coupons.delete_one({"id": cid})
    return {"status": "ok"}


# ===== Transactions =====
@router.get("/admin/transactions")
async def list_all_tx(request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    items = await db.transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    for it in items:
        u = await db.users.find_one({"id": it["user_id"]}, {"_id": 0, "name": 1, "phone": 1})
        it["user_name"] = u["name"] if u else "—"
        it["user_phone"] = u["phone"] if u else "—"
    return items


# ===== Password resets =====
@router.get("/admin/password-resets")
async def list_password_resets(request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    items = await db.password_resets.find({}, {"_id": 0, "new_password_hash": 0}).sort("created_at", -1).to_list(2000)
    return items


@router.post("/admin/password-resets/{rid}/approve")
async def approve_password_reset(rid: str, payload: PasswordResetActionRequest, request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    pr = await db.password_resets.find_one({"id": rid}, {"_id": 0})
    if not pr:
        raise HTTPException(404, "Request not found")
    if pr["status"] != "pending":
        raise HTTPException(400, f"Already {pr['status']}")
    await db.users.update_one({"id": pr["user_id"]}, {"$set": {"password_hash": pr["new_password_hash"]}})
    await db.password_resets.update_one(
        {"id": rid},
        {"$set": {"status": "approved", "admin_note": payload.note, "updated_at": _now_iso()}},
    )
    return {"status": "ok"}


@router.post("/admin/password-resets/{rid}/reject")
async def reject_password_reset(rid: str, payload: PasswordResetActionRequest, request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    pr = await db.password_resets.find_one({"id": rid}, {"_id": 0})
    if not pr:
        raise HTTPException(404, "Request not found")
    if pr["status"] != "pending":
        raise HTTPException(400, f"Already {pr['status']}")
    await db.password_resets.update_one(
        {"id": rid},
        {"$set": {"status": "rejected", "admin_note": payload.note, "updated_at": _now_iso()}},
    )
    return {"status": "ok"}


# ===== Settings =====
@router.get("/admin/settings")
async def get_settings(request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    s = await db.settings.find_one({"id": "global"}, {"_id": 0})
    return s


@router.put("/admin/settings")
async def update_settings(data: SettingsUpdate, request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    payload = {k: v for k, v in data.dict().items() if v is not None}
    if payload:
        await db.settings.update_one({"id": "global"}, {"$set": payload}, upsert=True)
    return await db.settings.find_one({"id": "global"}, {"_id": 0})
