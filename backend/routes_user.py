import os
import hmac
import hashlib
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request

from auth import (
    hash_password,
    verify_password,
    create_token,
    gen_referral_code,
    gen_reference,
    get_current_user,
)
from models import (
    RegisterRequest,
    LoginRequest,
    ChangePasswordRequest,
    BankUpdateRequest,
    InvestRequest,
    DepositInitRequest,
    WithdrawRequest,
    CouponRedeemRequest,
)
from payouts import process_investment_payouts

router = APIRouter()


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


async def _settings(db):
    s = await db.settings.find_one({"id": "global"}, {"_id": 0})
    return s or {}


async def _public_user(db, user_id: str):
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return u


async def _log_tx(db, user_id, ttype, amount, description, meta=None):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    tx = {
        "id": gen_reference("tx"),
        "user_id": user_id,
        "type": ttype,
        "amount": amount,
        "description": description,
        "balance_after": user.get("wallet_balance", 0.0) if user else 0.0,
        "meta": meta or {},
        "created_at": _now_iso(),
    }
    await db.transactions.insert_one(tx)


# =========== AUTH ===========
@router.post("/auth/register")
async def register(data: RegisterRequest, request: Request):
    db = request.app.state.db
    phone = data.phone.strip()
    if not phone or len(phone) < 7:
        raise HTTPException(400, "Invalid phone number")
    if len(data.password) < 4:
        raise HTTPException(400, "Password too short")

    existing = await db.users.find_one({"phone": phone})
    if existing:
        raise HTTPException(400, "Phone number already registered")

    referrer = None
    if data.referral_code:
        referrer = await db.users.find_one(
            {"referral_code": data.referral_code.strip().upper()}, {"_id": 0}
        )
        if not referrer:
            raise HTTPException(400, "Invalid referral code")

    # Unique referral code
    code = gen_referral_code()
    while await db.users.find_one({"referral_code": code}):
        code = gen_referral_code()

    settings = await _settings(db)
    welcome = float(settings.get("welcome_bonus", 750.0))

    user = {
        "id": gen_reference("u"),
        "phone": phone,
        "name": data.name.strip(),
        "password_hash": hash_password(data.password),
        "wallet_balance": welcome,
        "total_earnings": 0.0,
        "referral_earnings": 0.0,
        "referral_code": code,
        "referred_by": referrer["id"] if referrer else None,
        "bank_name": None,
        "account_number": None,
        "account_name": None,
        "is_admin": False,
        "is_blocked": False,
        "created_at": _now_iso(),
    }
    await db.users.insert_one(user)

    # Welcome bonus transaction
    if welcome > 0:
        await _log_tx(
            db, user["id"], "bonus", welcome, f"Welcome bonus of ₦{welcome:,.2f}"
        )

    # Build 3-generation referral records
    if referrer:
        # Gen 1
        await db.referrals.insert_one({
            "id": gen_reference("ref"),
            "referrer_id": referrer["id"],
            "referred_id": user["id"],
            "generation": 1,
            "created_at": _now_iso(),
        })
        # Gen 2
        gen2 = await db.users.find_one({"id": referrer.get("referred_by")}, {"_id": 0}) if referrer.get("referred_by") else None
        if gen2:
            await db.referrals.insert_one({
                "id": gen_reference("ref"),
                "referrer_id": gen2["id"],
                "referred_id": user["id"],
                "generation": 2,
                "created_at": _now_iso(),
            })
            gen3 = await db.users.find_one({"id": gen2.get("referred_by")}, {"_id": 0}) if gen2.get("referred_by") else None
            if gen3:
                await db.referrals.insert_one({
                    "id": gen_reference("ref"),
                    "referrer_id": gen3["id"],
                    "referred_id": user["id"],
                    "generation": 3,
                    "created_at": _now_iso(),
                })

    token = create_token(user["id"], user["is_admin"])
    return {"token": token, "user": await _public_user(db, user["id"])}


@router.post("/auth/login")
async def login(data: LoginRequest, request: Request):
    db = request.app.state.db
    user = await db.users.find_one({"phone": data.phone.strip()}, {"_id": 0})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(401, "Invalid phone or password")
    if user.get("is_blocked"):
        raise HTTPException(403, "Account blocked")
    token = create_token(user["id"], user.get("is_admin", False))
    return {"token": token, "user": await _public_user(db, user["id"])}


@router.get("/auth/me")
async def me(request: Request, user=Depends(get_current_user)):
    db = request.app.state.db
    # Run payout processing on each "me" fetch (lightweight, only user's investments)
    await process_investment_payouts(db, user["id"])
    return await _public_user(db, user["id"])


@router.post("/auth/change-password")
async def change_password(data: ChangePasswordRequest, request: Request, user=Depends(get_current_user)):
    db = request.app.state.db
    if not verify_password(data.old_password, user["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    if len(data.new_password) < 4:
        raise HTTPException(400, "New password too short")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(data.new_password)}})
    return {"status": "ok"}


@router.put("/profile/bank")
async def update_bank(data: BankUpdateRequest, request: Request, user=Depends(get_current_user)):
    db = request.app.state.db
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "bank_name": data.bank_name.strip(),
            "account_number": data.account_number.strip(),
            "account_name": data.account_name.strip(),
        }},
    )
    return await _public_user(db, user["id"])


# =========== PRODUCTS ===========
@router.get("/products")
async def list_products(request: Request, user=Depends(get_current_user)):
    db = request.app.state.db
    products = await db.products.find({"is_active": True}, {"_id": 0}).sort("price", 1).to_list(500)
    return products


# =========== INVEST ===========
@router.post("/invest")
async def invest(data: InvestRequest, request: Request, user=Depends(get_current_user)):
    db = request.app.state.db
    await process_investment_payouts(db, user["id"])
    user = await db.users.find_one({"id": user["id"]}, {"_id": 0})

    product = await db.products.find_one({"id": data.product_id, "is_active": True}, {"_id": 0})
    if not product:
        raise HTTPException(404, "Product not found")

    amount = float(data.amount)
    if amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    if amount < product.get("min_amount", product["price"]) and amount != product["price"]:
        # allow exact-price purchase even if min_amount higher; otherwise enforce
        if amount < product.get("min_amount", 0):
            raise HTTPException(400, f"Minimum investment is ₦{product.get('min_amount', 0):,.2f}")
    if product.get("max_amount", 0) > 0 and amount > product["max_amount"]:
        raise HTTPException(400, f"Maximum investment is ₦{product['max_amount']:,.2f}")
    if user["wallet_balance"] < amount:
        raise HTTPException(400, "Insufficient wallet balance. Please deposit.")

    daily_profit_amount = round(amount * (product["daily_profit_percent"] / 100.0), 2)
    inv = {
        "id": gen_reference("inv"),
        "user_id": user["id"],
        "product_id": product["id"],
        "product_name": product["name"],
        "amount": amount,
        "daily_profit_percent": product["daily_profit_percent"],
        "daily_profit_amount": daily_profit_amount,
        "duration_days": product["duration_days"],
        "days_paid": 0,
        "total_profit_paid": 0.0,
        "status": "active",
        "last_payout_at": _now_iso(),
        "started_at": _now_iso(),
        "completed_at": None,
    }
    await db.investments.insert_one(inv)
    inv.pop("_id", None)
    new_user = await db.users.find_one_and_update(
        {"id": user["id"]},
        {"$inc": {"wallet_balance": -amount}},
        return_document=True,
        projection={"_id": 0},
    )
    tx = {
        "id": gen_reference("tx"),
        "user_id": user["id"],
        "type": "invest",
        "amount": -amount,
        "description": f"Invested in {product['name']}",
        "balance_after": new_user["wallet_balance"],
        "meta": {"investment_id": inv["id"], "product_id": product["id"]},
        "created_at": _now_iso(),
    }
    await db.transactions.insert_one(tx)
    return {"investment": inv, "wallet_balance": new_user["wallet_balance"]}


@router.get("/investments")
async def my_investments(request: Request, user=Depends(get_current_user)):
    db = request.app.state.db
    await process_investment_payouts(db, user["id"])
    items = await db.investments.find({"user_id": user["id"]}, {"_id": 0}).sort("started_at", -1).to_list(1000)
    return items


# =========== DEPOSIT ===========
@router.post("/deposit/initialize")
async def deposit_init(data: DepositInitRequest, request: Request, user=Depends(get_current_user)):
    db = request.app.state.db
    settings = await _settings(db)
    if data.amount < settings.get("min_deposit", 3000):
        raise HTTPException(400, f"Minimum deposit is ₦{settings.get('min_deposit', 3000):,.2f}")

    reference = gen_reference("dep")
    mode = settings.get("payment_mode", "mock")
    secret = settings.get("paystack_secret_key") or os.environ.get("PAYSTACK_SECRET_KEY", "")

    deposit_doc = {
        "id": gen_reference("d"),
        "user_id": user["id"],
        "amount": float(data.amount),
        "reference": reference,
        "method": "paystack" if mode == "live" else "mock",
        "status": "pending",
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    await db.deposits.insert_one(deposit_doc)

    if mode == "live" and secret:
        # Real Paystack call
        amount_kobo = int(float(data.amount) * 100)
        callback_url = data.callback_url or "https://example.com/deposit/callback"
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.post(
                    "https://api.paystack.co/transaction/initialize",
                    headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
                    json={
                        "email": f"{user['phone']}@naijainvest.local",
                        "amount": amount_kobo,
                        "reference": reference,
                        "callback_url": callback_url,
                        "metadata": {"user_id": user["id"]},
                    },
                )
                result = resp.json()
            if not result.get("status"):
                raise HTTPException(400, result.get("message", "Paystack error"))
            return {
                "mode": "live",
                "reference": reference,
                "authorization_url": result["data"]["authorization_url"],
            }
        except httpx.HTTPError as e:
            raise HTTPException(502, f"Paystack request failed: {e}")
    else:
        # Mock mode: front-end will call verify to credit
        return {"mode": "mock", "reference": reference, "amount": data.amount}


@router.get("/deposit/verify/{reference}")
async def deposit_verify(reference: str, request: Request, user=Depends(get_current_user)):
    db = request.app.state.db
    deposit = await db.deposits.find_one({"reference": reference, "user_id": user["id"]}, {"_id": 0})
    if not deposit:
        raise HTTPException(404, "Deposit not found")
    if deposit["status"] == "success":
        return {"status": "success", "deposit": deposit}

    settings = await _settings(db)
    mode = settings.get("payment_mode", "mock")
    secret = settings.get("paystack_secret_key") or os.environ.get("PAYSTACK_SECRET_KEY", "")

    success = False
    if mode == "live" and secret:
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.get(
                    f"https://api.paystack.co/transaction/verify/{reference}",
                    headers={"Authorization": f"Bearer {secret}"},
                )
                result = resp.json()
            if result.get("status") and result["data"]["status"] == "success":
                success = True
        except httpx.HTTPError:
            success = False
    else:
        # Mock auto-success
        success = True

    if success:
        await db.deposits.update_one(
            {"reference": reference},
            {"$set": {"status": "success", "updated_at": _now_iso()}},
        )
        new_user = await db.users.find_one_and_update(
            {"id": user["id"]},
            {"$inc": {"wallet_balance": deposit["amount"]}},
            return_document=True,
            projection={"_id": 0},
        )
        await db.transactions.insert_one({
            "id": gen_reference("tx"),
            "user_id": user["id"],
            "type": "deposit",
            "amount": deposit["amount"],
            "description": f"Deposit via {deposit['method']}",
            "balance_after": new_user["wallet_balance"],
            "meta": {"reference": reference},
            "created_at": _now_iso(),
        })
        deposit = await db.deposits.find_one({"reference": reference}, {"_id": 0})
        return {"status": "success", "deposit": deposit, "wallet_balance": new_user["wallet_balance"]}
    else:
        await db.deposits.update_one(
            {"reference": reference},
            {"$set": {"status": "failed", "updated_at": _now_iso()}},
        )
        return {"status": "failed"}


@router.post("/deposit/webhook")
async def paystack_webhook(request: Request):
    db = request.app.state.db
    settings = await _settings(db)
    secret = settings.get("paystack_secret_key") or os.environ.get("PAYSTACK_SECRET_KEY", "")
    signature = request.headers.get("x-paystack-signature", "")
    body = await request.body()
    if secret:
        computed = hmac.new(secret.encode("utf-8"), body, hashlib.sha512).hexdigest()
        if not hmac.compare_digest(computed, signature):
            raise HTTPException(401, "Invalid signature")
    event = await request.json()
    if event.get("event") == "charge.success":
        reference = event["data"]["reference"]
        deposit = await db.deposits.find_one({"reference": reference}, {"_id": 0})
        if deposit and deposit["status"] != "success":
            await db.deposits.update_one(
                {"reference": reference},
                {"$set": {"status": "success", "updated_at": _now_iso()}},
            )
            new_user = await db.users.find_one_and_update(
                {"id": deposit["user_id"]},
                {"$inc": {"wallet_balance": deposit["amount"]}},
                return_document=True,
                projection={"_id": 0},
            )
            await db.transactions.insert_one({
                "id": gen_reference("tx"),
                "user_id": deposit["user_id"],
                "type": "deposit",
                "amount": deposit["amount"],
                "description": "Deposit via paystack (webhook)",
                "balance_after": new_user["wallet_balance"],
                "meta": {"reference": reference},
                "created_at": _now_iso(),
            })
    return {"status": "ok"}


@router.get("/deposits")
async def my_deposits(request: Request, user=Depends(get_current_user)):
    db = request.app.state.db
    items = await db.deposits.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


# =========== WITHDRAWAL ===========
@router.post("/withdrawal/request")
async def request_withdrawal(data: WithdrawRequest, request: Request, user=Depends(get_current_user)):
    db = request.app.state.db
    settings = await _settings(db)
    min_w = settings.get("min_withdrawal", 1000)
    if data.amount < min_w:
        raise HTTPException(400, f"Minimum withdrawal is ₦{min_w:,.2f}")
    if user["wallet_balance"] < data.amount:
        raise HTTPException(400, "Insufficient wallet balance")
    if not (user.get("bank_name") and user.get("account_number") and user.get("account_name")):
        raise HTTPException(400, "Please add your bank account details on profile page first")

    # Debit wallet immediately, refund if rejected.
    new_user = await db.users.find_one_and_update(
        {"id": user["id"]},
        {"$inc": {"wallet_balance": -float(data.amount)}},
        return_document=True,
        projection={"_id": 0},
    )
    wid = gen_reference("w")
    doc = {
        "id": wid,
        "user_id": user["id"],
        "amount": float(data.amount),
        "bank_name": user["bank_name"],
        "account_number": user["account_number"],
        "account_name": user["account_name"],
        "method": data.method if data.method in ("manual", "auto") else "manual",
        "status": "pending",
        "admin_note": None,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    await db.withdrawals.insert_one(doc)
    doc.pop("_id", None)
    await db.transactions.insert_one({
        "id": gen_reference("tx"),
        "user_id": user["id"],
        "type": "withdrawal",
        "amount": -float(data.amount),
        "description": f"Withdrawal request ({doc['method']})",
        "balance_after": new_user["wallet_balance"],
        "meta": {"withdrawal_id": wid},
        "created_at": _now_iso(),
    })
    return doc


@router.get("/withdrawals")
async def my_withdrawals(request: Request, user=Depends(get_current_user)):
    db = request.app.state.db
    items = await db.withdrawals.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


# =========== REFERRALS ===========
@router.get("/referrals")
async def my_referrals(request: Request, user=Depends(get_current_user)):
    db = request.app.state.db
    refs = await db.referrals.find({"referrer_id": user["id"]}, {"_id": 0}).to_list(2000)
    # Group by generation and join user names
    out = {1: [], 2: [], 3: []}
    for r in refs:
        u = await db.users.find_one({"id": r["referred_id"]}, {"_id": 0, "password_hash": 0})
        if not u:
            continue
        out[r["generation"]].append({
            "id": u["id"],
            "name": u["name"],
            "phone": u["phone"],
            "joined_at": u["created_at"],
        })

    # Sum referral earnings per gen
    pipeline_earn = await db.transactions.aggregate([
        {"$match": {"user_id": user["id"], "type": "referral"}},
        {"$group": {"_id": "$meta.generation", "total": {"$sum": "$amount"}}},
    ]).to_list(10)
    earnings_by_gen = {1: 0.0, 2: 0.0, 3: 0.0}
    for row in pipeline_earn:
        if row.get("_id") in (1, 2, 3):
            earnings_by_gen[row["_id"]] = float(row.get("total", 0.0))

    settings = await _settings(db)
    return {
        "referral_code": user["referral_code"],
        "gen1": {"users": out[1], "count": len(out[1]), "earnings": earnings_by_gen[1], "percent": settings.get("gen1_percent", 10)},
        "gen2": {"users": out[2], "count": len(out[2]), "earnings": earnings_by_gen[2], "percent": settings.get("gen2_percent", 5)},
        "gen3": {"users": out[3], "count": len(out[3]), "earnings": earnings_by_gen[3], "percent": settings.get("gen3_percent", 2)},
        "total_referral_earnings": sum(earnings_by_gen.values()),
    }


# =========== COUPONS ===========
@router.post("/coupons/redeem")
async def redeem_coupon(data: CouponRedeemRequest, request: Request, user=Depends(get_current_user)):
    db = request.app.state.db
    code = data.code.strip().upper()
    coupon = await db.coupons.find_one({"code": code, "is_active": True}, {"_id": 0})
    if not coupon:
        raise HTTPException(404, "Invalid coupon code")
    if coupon["used_count"] >= coupon["max_uses"]:
        raise HTTPException(400, "Coupon usage limit reached")
    already = await db.coupon_redemptions.find_one({"coupon_id": coupon["id"], "user_id": user["id"]})
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
    return {"status": "ok", "amount": coupon["amount"], "wallet_balance": new_user["wallet_balance"]}


# =========== TRANSACTIONS ===========
@router.get("/transactions")
async def my_transactions(request: Request, ttype: Optional[str] = None, user=Depends(get_current_user)):
    db = request.app.state.db
    q = {"user_id": user["id"]}
    if ttype:
        q["type"] = ttype
    items = await db.transactions.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return items


# =========== SETTINGS (PUBLIC SUBSET) ===========
@router.get("/settings/public")
async def public_settings(request: Request):
    db = request.app.state.db
    s = await _settings(db)
    return {
        "min_deposit": s.get("min_deposit", 3000),
        "min_withdrawal": s.get("min_withdrawal", 1000),
        "welcome_bonus": s.get("welcome_bonus", 750),
        "payment_mode": s.get("payment_mode", "mock"),
        "paystack_public_key": s.get("paystack_public_key", ""),
        "gen1_percent": s.get("gen1_percent", 10),
        "gen2_percent": s.get("gen2_percent", 5),
        "gen3_percent": s.get("gen3_percent", 2),
    }
