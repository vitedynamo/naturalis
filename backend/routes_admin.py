import os
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import Response

from auth import get_current_admin, gen_reference
from models import ProductCreate, CouponCreate, SettingsUpdate, AdminWithdrawalAction, PasswordResetActionRequest, PaystackPayRequest
from storage import put_object, get_object
from nomba import transfer_to_bank as nomba_transfer

router = APIRouter()


ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
APP_NAME = os.environ.get("APP_NAME", "naija-invest")

# Banks cache (Paystack /bank)
_banks_cache: dict = {"at": 0, "items": []}


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


async def _get_secret_key(db) -> tuple[str, str]:
    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    return (
        s.get("paystack_secret_key") or os.environ.get("PAYSTACK_SECRET_KEY", ""),
        s.get("payment_mode", "mock"),
    )


# Static fallback list of major Nigerian banks (used when Paystack is in mock mode or unreachable)
_NG_BANKS_FALLBACK = [
    {"name": "Access Bank", "code": "044"},
    {"name": "Ecobank Nigeria", "code": "050"},
    {"name": "Fidelity Bank", "code": "070"},
    {"name": "First Bank of Nigeria", "code": "011"},
    {"name": "First City Monument Bank", "code": "214"},
    {"name": "Guaranty Trust Bank", "code": "058"},
    {"name": "Keystone Bank", "code": "082"},
    {"name": "Kuda Microfinance Bank", "code": "50211"},
    {"name": "Opay", "code": "999992"},
    {"name": "Palmpay", "code": "999991"},
    {"name": "Polaris Bank", "code": "076"},
    {"name": "Providus Bank", "code": "101"},
    {"name": "Stanbic IBTC Bank", "code": "221"},
    {"name": "Standard Chartered", "code": "068"},
    {"name": "Sterling Bank", "code": "232"},
    {"name": "Union Bank of Nigeria", "code": "032"},
    {"name": "United Bank For Africa", "code": "033"},
    {"name": "Unity Bank", "code": "215"},
    {"name": "Wema Bank", "code": "035"},
    {"name": "Zenith Bank", "code": "057"},
]


@router.get("/admin/banks")
async def list_banks(request: Request, _admin=Depends(get_current_admin)):
    """List Nigerian banks. Uses Paystack /bank when live mode has a key, else fallback list."""
    db = request.app.state.db
    now = time.time()
    if _banks_cache["items"] and (now - _banks_cache["at"]) < 3600:
        return _banks_cache["items"]
    secret, mode = await _get_secret_key(db)
    if mode == "live" and secret:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    "https://api.paystack.co/bank",
                    params={"country": "nigeria"},
                    headers={"Authorization": f"Bearer {secret}"},
                )
                data = resp.json()
            if data.get("status"):
                items = [{"name": b["name"], "code": b["code"]} for b in data["data"]]
                _banks_cache["items"] = items
                _banks_cache["at"] = now
                return items
        except httpx.HTTPError:
            pass
    return _NG_BANKS_FALLBACK


@router.post("/admin/withdrawals/{wid}/pay-paystack")
async def pay_withdrawal_via_paystack(wid: str, payload: PaystackPayRequest, request: Request, _admin=Depends(get_current_admin)):
    """Approve a pending withdrawal via Paystack transfer (or mock if no live key)."""
    db = request.app.state.db
    w = await db.withdrawals.find_one({"id": wid}, {"_id": 0})
    if not w:
        raise HTTPException(404, "Withdrawal not found")
    if w["status"] != "pending":
        raise HTTPException(400, f"Already {w['status']}")

    secret, mode = await _get_secret_key(db)
    transfer_ref = gen_reference("ptr")
    transfer_code = None

    if mode == "live" and secret:
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                # 1. Create transfer recipient
                rec_resp = await client.post(
                    "https://api.paystack.co/transferrecipient",
                    headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
                    json={
                        "type": "nuban",
                        "name": w["account_name"],
                        "account_number": w["account_number"],
                        "bank_code": payload.bank_code,
                        "currency": "NGN",
                    },
                )
                rec_data = rec_resp.json()
            if not rec_data.get("status"):
                raise HTTPException(502, f"Paystack recipient error: {rec_data.get('message')}")
            recipient_code = rec_data["data"]["recipient_code"]

            async with httpx.AsyncClient(timeout=20) as client:
                # 2. Initiate transfer
                tr_resp = await client.post(
                    "https://api.paystack.co/transfer",
                    headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
                    json={
                        "source": "balance",
                        "reason": payload.reason or f"Withdrawal {wid}",
                        "amount": int(float(w["amount"]) * 100),  # kobo
                        "recipient": recipient_code,
                        "reference": transfer_ref,
                    },
                )
                tr_data = tr_resp.json()
            if not tr_data.get("status"):
                raise HTTPException(502, f"Paystack transfer error: {tr_data.get('message')}")
            transfer_code = tr_data["data"].get("transfer_code")
        except httpx.HTTPError as e:
            raise HTTPException(502, f"Paystack request failed: {e}")

    await db.withdrawals.update_one(
        {"id": wid},
        {"$set": {
            "status": "paid",
            "method": "auto",
            "admin_note": f"Paystack transfer · ref {transfer_ref}" + (" · live" if mode == 'live' and secret else " · mock"),
            "paystack_transfer_ref": transfer_ref,
            "paystack_transfer_code": transfer_code,
            "bank_code": payload.bank_code,
            "updated_at": _now_iso(),
        }},
    )
    return {"status": "ok", "reference": transfer_ref, "mode": mode if (mode == "live" and secret) else "mock"}


@router.post("/admin/withdrawals/{wid}/pay-nomba")
async def pay_withdrawal_via_nomba(wid: str, payload: PaystackPayRequest, request: Request, _admin=Depends(get_current_admin)):
    """Approve a pending withdrawal via Nomba bank transfer (or mock if creds missing)."""
    db = request.app.state.db
    w = await db.withdrawals.find_one({"id": wid}, {"_id": 0})
    if not w:
        raise HTTPException(404, "Withdrawal not found")
    if w["status"] != "pending":
        raise HTTPException(400, f"Already {w['status']}")

    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    client_id = s.get("nomba_client_id") or ""
    client_secret = s.get("nomba_client_secret") or ""
    account_id = s.get("nomba_account_id") or ""
    mode = s.get("payment_mode", "mock")
    transfer_ref = gen_reference("ntr")
    transfer_resp = None

    if mode == "live" and client_id and client_secret and account_id:
        try:
            transfer_resp = await nomba_transfer(
                client_id=client_id, client_secret=client_secret, account_id=account_id,
                amount_naira=float(w["amount"]),
                account_number=w["account_number"], account_name=w["account_name"],
                bank_code=payload.bank_code, merchant_tx_ref=transfer_ref,
                narration=payload.reason or f"Withdrawal {wid}",
            )
        except Exception as e:
            raise HTTPException(502, f"Nomba transfer failed: {e}")

    await db.withdrawals.update_one(
        {"id": wid},
        {"$set": {
            "status": "paid",
            "method": "auto",
            "admin_note": f"Nomba transfer · ref {transfer_ref}" + (" · live" if transfer_resp else " · mock"),
            "nomba_transfer_ref": transfer_ref,
            "bank_code": payload.bank_code,
            "updated_at": _now_iso(),
        }},
    )
    return {"status": "ok", "reference": transfer_ref, "mode": "live" if transfer_resp else "mock"}


# ===== Image upload =====
@router.post("/admin/upload-image")
async def upload_image(request: Request, file: UploadFile = File(...), _admin=Depends(get_current_admin)):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(400, "Only JPG, PNG or WebP images are allowed")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "Image must be ≤ 5MB")
    ext = (file.filename or "image").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    path = f"{APP_NAME}/products/{uuid.uuid4().hex}.{ext}"
    try:
        result = put_object(path, data, file.content_type or "application/octet-stream")
    except Exception as e:
        raise HTTPException(502, f"Storage upload failed: {e}")
    db = request.app.state.db
    await db.files.insert_one({
        "id": gen_reference("f"),
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": file.content_type,
        "size": result.get("size", len(data)),
        "is_deleted": False,
        "created_at": _now_iso(),
    })
    # Build a relative URL that the frontend will resolve via REACT_APP_BACKEND_URL
    return {"path": result["path"], "url": f"/api/files/{result['path']}", "size": result.get("size", len(data))}


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
    raw = data.dict(exclude_unset=True)
    payload = {}
    for k, v in raw.items():
        # featured_product_id can be cleared with null or empty string
        if k == "featured_product_id":
            payload[k] = None if (v is None or v == "") else v
            continue
        if v is not None:
            payload[k] = v
    if payload:
        await db.settings.update_one({"id": "global"}, {"$set": payload}, upsert=True)
    return await db.settings.find_one({"id": "global"}, {"_id": 0})
