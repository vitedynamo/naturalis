import os
import hmac
import hashlib
import logging
from datetime import datetime, timezone, timedelta
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
    ForgotPasswordRequest,
    ResetWithQuestionsRequest,
    SetWithdrawalPinRequest,
    ChangeWithdrawalPinRequest,
    ResetWithdrawalPinRequest,
)
from payouts import process_investment_payouts

logger = logging.getLogger(__name__)

router = APIRouter()


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


async def _settings(db):
    s = await db.settings.find_one({"id": "global"}, {"_id": 0})
    return s or {}


async def _public_user(db, user_id: str):
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0, "withdrawal_pin_hash": 0, "security_answer_hash_1": 0, "security_answer_hash_2": 0})
    if u:
        # Expose only whether a PIN is set, never the hash itself
        fresh = await db.users.find_one({"id": user_id}, {"_id": 0, "withdrawal_pin_hash": 1})
        u["has_withdrawal_pin"] = bool((fresh or {}).get("withdrawal_pin_hash"))
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
def _validate_phone(phone: str) -> str:
    p = (phone or "").strip()
    if not p.isdigit() or len(p) != 11:
        raise HTTPException(400, "Phone number must be exactly 11 digits")
    return p


@router.post("/auth/register")
async def register(data: RegisterRequest, request: Request):
    db = request.app.state.db
    phone = _validate_phone(data.phone)
    if len(data.password) < 4:
        raise HTTPException(400, "Password too short")

    # Enforce all-or-none on the 4 security-question fields
    sec_fields = [data.security_question_1, data.security_answer_1, data.security_question_2, data.security_answer_2]
    sec_set = [bool(v and str(v).strip()) for v in sec_fields]
    if any(sec_set) and not all(sec_set):
        raise HTTPException(400, "Please provide both security questions and both answers")
    if all(sec_set) and data.security_question_1.strip() == data.security_question_2.strip():
        raise HTTPException(400, "Please choose two different security questions")

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
        "security_question_1": (data.security_question_1 or "").strip() or None,
        "security_answer_hash_1": hash_password(data.security_answer_1.strip().lower()) if data.security_answer_1 else None,
        "security_question_2": (data.security_question_2 or "").strip() or None,
        "security_answer_hash_2": hash_password(data.security_answer_2.strip().lower()) if data.security_answer_2 else None,
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

    token = create_token(user["id"], user["is_admin"])
    return {"token": token, "user": await _public_user(db, user["id"])}


@router.post("/auth/login")
async def login(data: LoginRequest, request: Request):
    db = request.app.state.db
    phone = _validate_phone(data.phone)
    user = await db.users.find_one({"phone": phone}, {"_id": 0})
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
            "bank_code": (data.bank_code or "").strip() if hasattr(data, "bank_code") else "",
            "account_number": data.account_number.strip(),
            "account_name": data.account_name.strip(),
        }},
    )
    return await _public_user(db, user["id"])


# =========== WITHDRAWAL PIN ===========
def _validate_pin(pin: str) -> str:
    p = (pin or "").strip()
    if not p.isdigit() or len(p) != 4:
        raise HTTPException(400, "PIN must be exactly 4 digits")
    return p


@router.get("/profile/withdrawal-pin/status")
async def withdrawal_pin_status(request: Request, user=Depends(get_current_user)):
    return {"has_pin": bool(user.get("withdrawal_pin_hash"))}


@router.post("/profile/withdrawal-pin/set")
async def set_withdrawal_pin(data: SetWithdrawalPinRequest, request: Request, user=Depends(get_current_user)):
    """Set the initial 4-digit withdrawal PIN. Re-authenticates with account password."""
    db = request.app.state.db
    if user.get("withdrawal_pin_hash"):
        raise HTTPException(400, "Withdrawal PIN already set. Use change-pin instead.")
    if not verify_password(data.password, user["password_hash"]):
        raise HTTPException(400, "Account password is incorrect")
    pin = _validate_pin(data.pin)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "withdrawal_pin_hash": hash_password(pin),
            "withdrawal_pin_failed": 0,
            "withdrawal_pin_locked_until": None,
        }},
    )
    return {"status": "ok", "message": "Withdrawal PIN set successfully"}


@router.post("/profile/withdrawal-pin/change")
async def change_withdrawal_pin(data: ChangeWithdrawalPinRequest, request: Request, user=Depends(get_current_user)):
    db = request.app.state.db
    if not user.get("withdrawal_pin_hash"):
        raise HTTPException(400, "No PIN set yet. Use set-pin instead.")
    if not verify_password(data.old_pin, user["withdrawal_pin_hash"]):
        raise HTTPException(400, "Current PIN is incorrect")
    new_pin = _validate_pin(data.new_pin)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "withdrawal_pin_hash": hash_password(new_pin),
            "withdrawal_pin_failed": 0,
            "withdrawal_pin_locked_until": None,
        }},
    )
    return {"status": "ok", "message": "Withdrawal PIN updated"}


@router.get("/profile/withdrawal-pin/recovery-questions")
async def withdrawal_pin_recovery_questions(request: Request, user=Depends(get_current_user)):
    """Return the logged-in user's security questions for PIN recovery.

    Returns 400 if the user never set security questions during registration —
    in that case the user must contact admin to clear the PIN.
    """
    q1 = user.get("security_question_1")
    q2 = user.get("security_question_2")
    if not q1 or not q2 or not user.get("security_answer_hash_1") or not user.get("security_answer_hash_2"):
        raise HTTPException(400, "This account has no security questions on file. Please contact admin to reset your PIN.")
    return {"question_1": q1, "question_2": q2}


@router.post("/profile/withdrawal-pin/reset")
async def reset_withdrawal_pin(data: ResetWithdrawalPinRequest, request: Request, user=Depends(get_current_user)):
    """Reset the withdrawal PIN using the security questions set at registration.

    Useful when the user has forgotten their PIN. Re-uses the same answer hashes
    that secure the password recovery flow.
    """
    db = request.app.state.db
    h1 = user.get("security_answer_hash_1")
    h2 = user.get("security_answer_hash_2")
    if not h1 or not h2:
        raise HTTPException(400, "This account has no security questions on file. Please contact admin to reset your PIN.")
    if not (
        verify_password(data.answer_1.strip().lower(), h1)
        and verify_password(data.answer_2.strip().lower(), h2)
    ):
        raise HTTPException(400, "One or more security answers are incorrect")
    new_pin = _validate_pin(data.new_pin)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "withdrawal_pin_hash": hash_password(new_pin),
            "withdrawal_pin_failed": 0,
            "withdrawal_pin_locked_until": None,
        }},
    )
    return {"status": "ok", "message": "Withdrawal PIN reset successfully. You can use it on your next withdrawal."}


# =========== BANKS (PUBLIC USER ENDPOINTS) ===========
@router.get("/banks")
async def banks_for_user(request: Request, user=Depends(get_current_user)):
    """List Nigerian banks. Tries Nomba → Paystack → static fallback."""
    db = request.app.state.db
    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    # Try Nomba
    if s.get("nomba_client_id") and s.get("nomba_client_secret") and s.get("nomba_account_id"):
        try:
            from nomba import list_banks as nomba_list
            items = await nomba_list(
                client_id=s["nomba_client_id"],
                client_secret=s["nomba_client_secret"],
                account_id=s["nomba_account_id"],
                environment=s.get("nomba_environment"),
            )
            if items:
                return items
        except Exception as e:
            logger.warning(f"Nomba bank list failed: {e}")
    # Try Paystack
    secret = s.get("paystack_secret_key") or ""
    if secret:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    "https://api.paystack.co/bank",
                    params={"country": "nigeria", "perPage": "200"},
                    headers={"Authorization": f"Bearer {secret}"},
                )
                data = resp.json()
            if data.get("status"):
                return [{"name": b["name"], "code": b["code"]} for b in data["data"]]
        except Exception:
            pass
    from routes_admin import _NG_BANKS_FALLBACK
    return _NG_BANKS_FALLBACK


@router.post("/banks/resolve")
async def resolve_bank_account(payload: dict, request: Request, user=Depends(get_current_user)):
    """Resolve account name. Tries Nomba → Paystack."""
    account_number = (payload.get("account_number") or "").strip()
    bank_code = (payload.get("bank_code") or "").strip()
    if not account_number or not bank_code:
        raise HTTPException(400, "account_number and bank_code required")
    if not account_number.isdigit() or len(account_number) != 10:
        raise HTTPException(400, "Account number must be 10 digits")

    db = request.app.state.db
    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}

    # Try Nomba
    if s.get("nomba_client_id") and s.get("nomba_client_secret") and s.get("nomba_account_id"):
        try:
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
        except Exception as e:
            logger.warning(f"Nomba resolve failed: {e}")
            # Fall through to Paystack

    # Try Paystack
    secret = s.get("paystack_secret_key") or ""
    if secret:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    "https://api.paystack.co/bank/resolve",
                    params={"account_number": account_number, "bank_code": bank_code},
                    headers={"Authorization": f"Bearer {secret}"},
                )
                data = resp.json()
            if data.get("status") and data.get("data"):
                return {
                    "account_name": data["data"]["account_name"],
                    "account_number": data["data"]["account_number"],
                    "mode": "live",
                    "provider": "paystack",
                }
            raise HTTPException(422, data.get("message") or "Could not resolve account")
        except httpx.HTTPError as e:
            raise HTTPException(502, f"Paystack lookup failed: {e}")

    raise HTTPException(503, "Bank account verification is unavailable. Please ask the admin to configure Nomba or Paystack credentials.")


# =========== FORGOT PASSWORD ===========
@router.get("/auth/security-questions/{phone}")
async def get_security_questions(phone: str, request: Request):
    db = request.app.state.db
    phone = _validate_phone(phone)
    user = await db.users.find_one({"phone": phone}, {"_id": 0, "security_question_1": 1, "security_question_2": 1})
    if not user:
        raise HTTPException(404, "No account found for that phone number")
    q1 = user.get("security_question_1")
    q2 = user.get("security_question_2")
    if not q1 or not q2:
        raise HTTPException(404, "This account does not have security questions set. Use admin recovery instead.")
    return {"phone": phone, "question_1": q1, "question_2": q2}


@router.post("/auth/reset-with-questions")
async def reset_with_questions(data: ResetWithQuestionsRequest, request: Request):
    db = request.app.state.db
    phone = _validate_phone(data.phone)
    if len(data.new_password) < 4:
        raise HTTPException(400, "New password too short")
    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    if not user:
        raise HTTPException(404, "No account found")
    h1 = user.get("security_answer_hash_1")
    h2 = user.get("security_answer_hash_2")
    if not h1 or not h2:
        raise HTTPException(400, "Security questions not set for this account")
    if not (verify_password(data.answer_1.strip().lower(), h1) and verify_password(data.answer_2.strip().lower(), h2)):
        raise HTTPException(400, "One or more answers are incorrect")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(data.new_password)}},
    )
    return {"status": "ok", "message": "Password reset successful. You can now log in."}


@router.post("/auth/forgot-password")
async def forgot_password(data: ForgotPasswordRequest, request: Request):
    """User submits phone + new password + reason. An admin must approve before it takes effect."""
    db = request.app.state.db
    phone = _validate_phone(data.phone)
    if len(data.new_password) < 4:
        raise HTTPException(400, "New password too short")
    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    if not user:
        # Don't leak which numbers exist — but app is small, ok to be honest
        raise HTTPException(404, "No account found for that phone number")

    existing = await db.password_resets.find_one({"user_id": user["id"], "status": "pending"})
    if existing:
        raise HTTPException(400, "You already have a pending password reset. Please contact support.")

    doc = {
        "id": gen_reference("pr"),
        "user_id": user["id"],
        "phone": phone,
        "user_name": user.get("name", ""),
        "new_password_hash": hash_password(data.new_password),
        "reason": (data.reason or "").strip()[:300],
        "status": "pending",
        "admin_note": None,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    await db.password_resets.insert_one(doc)
    return {"status": "pending", "message": "Request submitted. An admin will review shortly."}


# =========== PRODUCTS ===========
@router.get("/products")
async def list_products(request: Request, user=Depends(get_current_user)):
    db = request.app.state.db
    products = await db.products.find({"is_active": True}, {"_id": 0}).sort("price", 1).to_list(500)
    return products


# =========== INVEST ===========
async def _award_invest_commissions(db, investor_id: str, invest_amount: float, source_investment_id: str, product_name: str):
    """One-time commission paid to up to 2 generations based on the investment amount."""
    settings = await _settings(db)
    percents = [
        float(settings.get("gen1_percent", 10.0)),
        float(settings.get("gen2_percent", 5.0)),
    ]
    current = await db.users.find_one({"id": investor_id}, {"_id": 0})
    if not current:
        return
    investor_name = current.get("name", "a user")
    for gen in range(2):
        ref_id = current.get("referred_by")
        if not ref_id:
            break
        referrer = await db.users.find_one({"id": ref_id}, {"_id": 0})
        if not referrer:
            break
        commission = round(float(invest_amount) * (percents[gen] / 100.0), 2)
        if commission > 0:
            updated = await db.users.find_one_and_update(
                {"id": referrer["id"]},
                {"$inc": {
                    "wallet_balance": commission,
                    "total_earnings": commission,
                    "referral_earnings": commission,
                }},
                return_document=True,
                projection={"_id": 0},
            )
            await db.transactions.insert_one({
                "id": gen_reference("tx"),
                "user_id": referrer["id"],
                "type": "referral",
                "amount": commission,
                "description": f"Gen-{gen+1} referral bonus from {investor_name} ({product_name})",
                "balance_after": updated["wallet_balance"],
                "meta": {
                    "generation": gen + 1,
                    "from_user_id": investor_id,
                    "investment_id": source_investment_id,
                    "basis": "invest_amount",
                },
                "created_at": _now_iso(),
            })
        current = referrer


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

    # Award referral commissions immediately based on the investment amount (one-time per invest)
    await _award_invest_commissions(db, user["id"], amount, inv["id"], product["name"])

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
    gateway = settings.get("deposit_gateway", "paystack")

    # Decide which gateway to use based on settings
    use_marasoft = gateway == "marasoft" and bool(settings.get("marasoft_public_key"))
    use_paystack = gateway == "paystack" and mode == "live" and bool(settings.get("paystack_secret_key") or os.environ.get("PAYSTACK_SECRET_KEY", ""))

    method = "marasoft" if use_marasoft else ("paystack" if use_paystack else "mock")

    deposit_doc = {
        "id": gen_reference("d"),
        "user_id": user["id"],
        "amount": float(data.amount),
        "reference": reference,
        "method": method,
        "status": "pending",
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    await db.deposits.insert_one(deposit_doc)

    callback_url = data.callback_url or "https://example.com/deposit/callback"

    if use_marasoft:
        from marasoft import create_dynamic_account as ms_create_account
        # Dynamic accounts only need the encryption key — no merchant KYC required.
        if not settings.get("marasoft_encryption_key"):
            await db.deposits.update_one(
                {"reference": reference},
                {"$set": {"status": "failed", "admin_note": "Marasoft encryption key missing", "updated_at": _now_iso()}},
            )
            raise HTTPException(503, "Marasoft is not fully configured. Please contact support.")
        try:
            acct = await ms_create_account(
                enc_key=settings["marasoft_encryption_key"],
                amount_naira=float(data.amount),
                transaction_ref=reference,
            )
            # Persist account details on the deposit row so we can show them again
            await db.deposits.update_one(
                {"reference": reference},
                {"$set": {
                    "account_number": acct["account_number"],
                    "account_name": acct["account_name"],
                    "bank_name": acct["bank"],
                    "updated_at": _now_iso(),
                }},
            )
            return {
                "mode": "live",
                "gateway": "marasoft",
                "type": "bank_transfer",
                "reference": reference,
                "amount": float(data.amount),
                "account_number": acct["account_number"],
                "account_name": acct["account_name"],
                "bank_name": acct["bank"],
                "expires_in_minutes": 60,
            }
        except Exception as e:
            await db.deposits.update_one(
                {"reference": reference},
                {"$set": {"status": "failed", "admin_note": f"Marasoft init failed: {e}", "updated_at": _now_iso()}},
            )
            raise HTTPException(502, f"Marasoft request failed: {e}")

    if use_paystack:
        secret = settings.get("paystack_secret_key") or os.environ.get("PAYSTACK_SECRET_KEY", "")
        amount_kobo = int(float(data.amount) * 100)
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
                "gateway": "paystack",
                "reference": reference,
                "authorization_url": result["data"]["authorization_url"],
            }
        except httpx.HTTPError as e:
            raise HTTPException(502, f"Paystack request failed: {e}")

    # Mock mode: front-end will call verify to credit
    return {"mode": "mock", "gateway": "mock", "reference": reference, "amount": data.amount}


@router.get("/deposit/verify/{reference}")
async def deposit_verify(reference: str, request: Request, user=Depends(get_current_user)):
    db = request.app.state.db
    deposit = await db.deposits.find_one({"reference": reference, "user_id": user["id"]}, {"_id": 0})
    if not deposit:
        raise HTTPException(404, "Deposit not found")
    if deposit["status"] == "success":
        return {"status": "success", "deposit": deposit}

    # Auto-expire Marasoft pending deposits whose 60-minute window has elapsed.
    if (
        deposit.get("status") == "pending"
        and deposit.get("method") == "marasoft"
        and deposit.get("created_at")
    ):
        try:
            created_dt = datetime.fromisoformat(deposit["created_at"].replace("Z", "+00:00"))
            if datetime.now(timezone.utc) - created_dt > timedelta(minutes=60):
                await db.deposits.update_one(
                    {"reference": reference},
                    {"$set": {
                        "status": "failed",
                        "admin_note": "Auto-expired: 60-minute transfer window elapsed without payment",
                        "updated_at": _now_iso(),
                    }},
                )
                return {"status": "failed"}
        except Exception:
            pass

    settings = await _settings(db)
    mode = settings.get("payment_mode", "mock")
    secret = settings.get("paystack_secret_key") or os.environ.get("PAYSTACK_SECRET_KEY", "")
    gateway_used = deposit.get("method", "mock")

    # gateway_status: "success" | "failed" | "pending"
    gateway_status = None
    if gateway_used == "marasoft" and settings.get("marasoft_encryption_key"):
        try:
            from marasoft import check_transaction_status as ms_check
            res = await ms_check(
                enc_key=settings["marasoft_encryption_key"],
                transaction_ref=reference,
            )
            gateway_status = res["status"]  # success | failed | pending
        except Exception as e:
            logger.warning(f"Marasoft check failed for {reference}: {e}")
            gateway_status = "pending"  # treat transient errors as still-pending
    elif gateway_used == "paystack" and mode == "live" and secret:
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.get(
                    f"https://api.paystack.co/transaction/verify/{reference}",
                    headers={"Authorization": f"Bearer {secret}"},
                )
                result = resp.json()
            ps = ((result.get("data") or {}).get("status") or "").lower()
            if ps == "success":
                gateway_status = "success"
            elif ps in ("failed", "abandoned", "reversed"):
                gateway_status = "failed"
            else:
                gateway_status = "pending"
        except httpx.HTTPError:
            gateway_status = "pending"
    else:
        # Mock auto-success
        gateway_status = "success"

    if gateway_status == "success":
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
    elif gateway_status == "failed":
        await db.deposits.update_one(
            {"reference": reference},
            {"$set": {"status": "failed", "updated_at": _now_iso()}},
        )
        return {"status": "failed"}
    else:
        # pending — do NOT mutate deposit; let the user keep waiting / re-checking
        return {"status": "pending"}


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


@router.post("/deposit/webhook/marasoft")
async def marasoft_webhook(request: Request):
    """Inbound webhook from Marasoft Pay.

    Authentication:
      1. If admin has set a `marasoft_secret_hash`, we require it to match the
         secret_hash field in the JSON payload (Marasoft docs: Secret Hash).
      2. Even after the hash check, we re-verify the transaction server-side
         with Marasoft's checktransaction API before crediting the wallet —
         belt and braces.
    """
    db = request.app.state.db
    try:
        event = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON")
    data = event.get("data") if isinstance(event, dict) else None
    if not data:
        data = event

    settings = await _settings(db)

    # Step 1 — secret hash verification (if configured)
    expected_hash = (settings.get("marasoft_secret_hash") or "").strip()
    if expected_hash:
        received_hash = (
            (data or {}).get("secret_hash")
            or (event or {}).get("secret_hash")
            or request.headers.get("x-secret-hash", "")
            or request.headers.get("secret-hash", "")
        )
        if not received_hash or str(received_hash).strip() != expected_hash:
            logger.warning("Marasoft webhook rejected: secret_hash mismatch")
            raise HTTPException(401, "Invalid secret hash")

    # Marasoft webhook fields: merchant_ref is the value we passed as transaction_ref
    reference = (
        (data or {}).get("merchant_ref")
        or (data or {}).get("merchant_tx_ref")
        or (data or {}).get("transaction_ref")
        or (data or {}).get("reference")
        or (data or {}).get("tx_ref")
    )
    if not reference:
        raise HTTPException(400, "transaction reference missing")
    deposit = await db.deposits.find_one({"reference": reference}, {"_id": 0})
    if not deposit:
        # Unknown reference — silently 200 to avoid info leak
        return {"status": "ignored", "reason": "unknown_reference"}
    if deposit["status"] == "success":
        return {"status": "ok", "already": True}
    if not settings.get("marasoft_encryption_key"):
        raise HTTPException(503, "Marasoft not configured")

    # Step 2 — confirm success.
    # If `marasoft_secret_hash` is configured AND matched in step 1, we trust the
    # payload's reported status directly (Marasoft signed it). Otherwise, fall
    # back to an independent API re-verify with check_transaction_status.
    payload_status_raw = str((data or {}).get("status") or "").lower()
    payload_says_success = payload_status_raw in ("success", "successful", "paid", "completed", "true")
    payload_says_failed = payload_status_raw in ("failed", "failure", "reversed", "rejected", "cancelled")

    if expected_hash and payload_says_success:
        # Trusted payload — skip the re-verify call (Marasoft checktransaction is
        # often gated behind IP whitelist; the secret_hash IS the auth proof).
        confirmed_success = True
    elif expected_hash and payload_says_failed:
        return {"status": "ignored", "reason": "payload_status_failed"}
    else:
        # No secret hash configured (or payload status ambiguous) — re-verify.
        try:
            from marasoft import check_transaction_status as ms_check
            res = await ms_check(
                enc_key=settings["marasoft_encryption_key"],
                transaction_ref=reference,
            )
        except Exception as e:
            raise HTTPException(502, f"Marasoft re-verify failed: {e}")
        if res["status"] != "success":
            return {"status": "ignored", "reason": f"gateway_status_{res['status']}"}
        confirmed_success = True

    if not confirmed_success:
        return {"status": "ignored", "reason": "unconfirmed"}

    # Credit wallet (idempotent — checked status=success above)
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
        "description": "Deposit via marasoft (webhook)",
        "balance_after": new_user["wallet_balance"],
        "meta": {"reference": reference, "gateway": "marasoft"},
        "created_at": _now_iso(),
    })
    return {"status": "ok"}



@router.get("/deposits")
async def my_deposits(request: Request, user=Depends(get_current_user)):
    db = request.app.state.db
    items = await db.deposits.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@router.get("/deposits/{reference}")
async def deposit_by_reference(reference: str, request: Request, user=Depends(get_current_user)):
    """Return a single deposit (with bank-transfer details) by reference.

    Used by the Deposit Transfer page to load the active virtual account when
    the user lands there directly (e.g. after a page refresh).
    """
    db = request.app.state.db
    d = await db.deposits.find_one({"reference": reference, "user_id": user["id"]}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Deposit not found")
    return d


# =========== WITHDRAWAL ===========
def _lagos_now():
    from datetime import timedelta
    return datetime.now(timezone.utc) + timedelta(hours=1)


def _is_within_window(start_hhmm: str, end_hhmm: str) -> bool:
    try:
        sh, sm = [int(x) for x in start_hhmm.split(":", 1)]
        eh, em = [int(x) for x in end_hhmm.split(":", 1)]
    except Exception:
        return True
    now = _lagos_now()
    now_minutes = now.hour * 60 + now.minute
    start_minutes = sh * 60 + sm
    end_minutes = eh * 60 + em
    if start_minutes <= end_minutes:
        return start_minutes <= now_minutes <= end_minutes
    # Overnight window e.g. 22:00 → 04:00
    return now_minutes >= start_minutes or now_minutes <= end_minutes


@router.post("/withdrawal/request")
async def request_withdrawal(data: WithdrawRequest, request: Request, user=Depends(get_current_user)):
    db = request.app.state.db
    settings = await _settings(db)

    # Withdrawal PIN — REQUIRED for every withdrawal
    if not user.get("withdrawal_pin_hash"):
        raise HTTPException(400, "Please set your 4-digit withdrawal PIN on your Profile page before withdrawing.")
    # Brute-force protection: 5 fails → 15 min lock
    locked = user.get("withdrawal_pin_locked_until")
    if locked:
        try:
            locked_until = datetime.fromisoformat(locked.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) < locked_until:
                mins = max(1, int((locked_until - datetime.now(timezone.utc)).total_seconds() // 60) + 1)
                raise HTTPException(429, f"Too many wrong PIN attempts. Try again in {mins} min.")
        except HTTPException:
            raise
        except Exception:
            pass
    if not data.pin or not verify_password(data.pin.strip(), user["withdrawal_pin_hash"]):
        # increment fail counter
        new_fail = int(user.get("withdrawal_pin_failed", 0)) + 1
        update = {"withdrawal_pin_failed": new_fail}
        from datetime import timedelta as _td
        if new_fail >= 5:
            update["withdrawal_pin_locked_until"] = (datetime.now(timezone.utc) + _td(minutes=15)).isoformat()
            update["withdrawal_pin_failed"] = 0
            await db.users.update_one({"id": user["id"]}, {"$set": update})
            raise HTTPException(429, "Too many wrong PIN attempts. PIN locked for 15 minutes.")
        await db.users.update_one({"id": user["id"]}, {"$set": update})
        remaining = 5 - new_fail
        raise HTTPException(400, f"Invalid PIN. {remaining} attempt{'s' if remaining != 1 else ''} remaining.")
    # PIN ok — reset fail counter
    if user.get("withdrawal_pin_failed"):
        await db.users.update_one({"id": user["id"]}, {"$set": {"withdrawal_pin_failed": 0, "withdrawal_pin_locked_until": None}})

    # Master kill-switch
    if not settings.get("withdrawals_open", True):
        raise HTTPException(400, "Withdrawals are temporarily closed. Please try again later.")
    # Daily window
    start = settings.get("withdrawal_start_time") or "00:00"
    end = settings.get("withdrawal_end_time") or "23:59"
    if not _is_within_window(start, end):
        raise HTTPException(400, f"Withdrawals are open between {start} and {end} (Lagos time).")

    min_w = settings.get("min_withdrawal", 1000)
    if data.amount < min_w:
        raise HTTPException(400, f"Minimum withdrawal is ₦{min_w:,.2f}")
    if user["wallet_balance"] < data.amount:
        raise HTTPException(400, "Insufficient wallet balance")
    if not (user.get("bank_name") and user.get("account_number") and user.get("account_name")):
        raise HTTPException(400, "Please add your bank account details on profile page first")

    new_user = await db.users.find_one_and_update(
        {"id": user["id"]},
        {"$inc": {"wallet_balance": -float(data.amount)}},
        return_document=True,
        projection={"_id": 0},
    )
    wid = gen_reference("w")
    method = data.method if data.method in ("manual", "auto") else "manual"
    doc = {
        "id": wid,
        "user_id": user["id"],
        "amount": float(data.amount),
        "bank_name": user["bank_name"],
        "bank_code": user.get("bank_code", ""),
        "account_number": user["account_number"],
        "account_name": user["account_name"],
        "method": method,
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
        "description": f"Withdrawal request ({method})",
        "balance_after": new_user["wallet_balance"],
        "meta": {"withdrawal_id": wid},
        "created_at": _now_iso(),
    })

    # Try auto-payout if enabled and we have a bank_code
    auto = bool(settings.get("auto_payout_enabled", False))
    if auto and user.get("bank_code"):
        payout_gateway = settings.get("payout_gateway", "paystack")
        mode = settings.get("payment_mode", "mock")
        try:
            if payout_gateway == "nomba" and mode == "live" and settings.get("nomba_client_id"):
                from nomba import transfer_to_bank as nomba_transfer, get_wallet_balance as nomba_balance
                # PRE-FLIGHT: check Nomba float balance
                try:
                    available = await nomba_balance(
                        client_id=settings["nomba_client_id"],
                        client_secret=settings["nomba_client_secret"],
                        account_id=settings.get("nomba_account_id", ""),
                        environment=settings.get("nomba_environment"),
                    )
                except Exception as be:
                    logger.warning(f"Nomba balance check failed: {be}")
                    available = None
                if available is not None and available < float(data.amount):
                    # Insufficient float — hold the withdrawal for admin attention
                    await db.withdrawals.update_one(
                        {"id": wid},
                        {"$set": {
                            "status": "pending",
                            "needs_attention": True,
                            "insufficient_float": True,
                            "float_balance_at_request": available,
                            "admin_note": f"Insufficient Nomba float (₦{available:,.2f} available). Awaiting admin top-up or manual payout.",
                            "updated_at": _now_iso(),
                        }},
                    )
                    doc["status"] = "pending"
                    doc["needs_attention"] = True
                    return doc
                # Sufficient (or balance check unavailable) — proceed
                ref = gen_reference("ntr")
                await nomba_transfer(
                    client_id=settings["nomba_client_id"], client_secret=settings["nomba_client_secret"],
                    account_id=settings.get("nomba_account_id", ""),
                    amount_naira=float(data.amount), account_number=user["account_number"],
                    account_name=user["account_name"], bank_code=user["bank_code"],
                    merchant_tx_ref=ref, narration=f"Auto payout {wid}",
                    environment=settings.get("nomba_environment"),
                )
                # Mark as initiated (NOT paid) — final status confirmed by status poll
                await db.withdrawals.update_one({"id": wid}, {"$set": {"status": "processing", "method": "auto", "admin_note": f"Auto Nomba · {ref} (status pending confirmation)", "nomba_transfer_ref": ref, "updated_at": _now_iso()}})
                doc["status"] = "processing"; doc["method"] = "auto"
            elif payout_gateway == "paystack" and mode == "live" and settings.get("paystack_secret_key"):
                # Paystack: recipient + transfer
                async with httpx.AsyncClient(timeout=20) as client:
                    r1 = await client.post(
                        "https://api.paystack.co/transferrecipient",
                        headers={"Authorization": f"Bearer {settings['paystack_secret_key']}", "Content-Type": "application/json"},
                        json={"type": "nuban", "name": user["account_name"], "account_number": user["account_number"], "bank_code": user["bank_code"], "currency": "NGN"},
                    )
                    rec = r1.json()
                    if not rec.get("status"):
                        raise Exception(rec.get("message", "recipient failed"))
                    recipient_code = rec["data"]["recipient_code"]
                    ref = gen_reference("ptr")
                    r2 = await client.post(
                        "https://api.paystack.co/transfer",
                        headers={"Authorization": f"Bearer {settings['paystack_secret_key']}", "Content-Type": "application/json"},
                        json={"source": "balance", "amount": int(float(data.amount) * 100), "recipient": recipient_code, "reason": f"Auto payout {wid}", "reference": ref},
                    )
                    tr = r2.json()
                    if not tr.get("status"):
                        raise Exception(tr.get("message", "transfer failed"))
                await db.withdrawals.update_one({"id": wid}, {"$set": {"status": "paid", "method": "auto", "admin_note": f"Auto Paystack · {ref}", "paystack_transfer_ref": ref, "updated_at": _now_iso()}})
                doc["status"] = "paid"; doc["method"] = "auto"
            else:
                # Mock auto-payout — simulate instant success
                ref = gen_reference("mock")
                await db.withdrawals.update_one({"id": wid}, {"$set": {"status": "paid", "method": "auto", "admin_note": f"Auto mock · {ref}", "updated_at": _now_iso()}})
                doc["status"] = "paid"; doc["method"] = "auto"
        except Exception as e:
            # Auto-payout failed — leave pending for admin manual processing
            await db.withdrawals.update_one({"id": wid}, {"$set": {"admin_note": f"Auto-payout failed: {e}", "updated_at": _now_iso()}})

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
    out = {1: [], 2: []}
    for r in refs:
        if r.get("generation") not in (1, 2):
            continue
        u = await db.users.find_one({"id": r["referred_id"]}, {"_id": 0, "password_hash": 0})
        if not u:
            continue
        # Pull this referred user's investments for the team detail (amount + date)
        invs = await db.investments.find({"user_id": u["id"]}, {"_id": 0}).sort("started_at", -1).to_list(50)
        total_invested = sum(float(i.get("amount", 0)) for i in invs)
        out[r["generation"]].append({
            "id": u["id"],
            "name": u["name"],
            "phone": u["phone"],
            "joined_at": u["created_at"],
            "total_invested": total_invested,
            "investments": [
                {"id": i["id"], "product_name": i["product_name"], "amount": i["amount"], "started_at": i["started_at"]}
                for i in invs
            ],
        })

    # Sum referral earnings per gen
    pipeline_earn = await db.transactions.aggregate([
        {"$match": {"user_id": user["id"], "type": "referral"}},
        {"$group": {"_id": "$meta.generation", "total": {"$sum": "$amount"}}},
    ]).to_list(10)
    earnings_by_gen = {1: 0.0, 2: 0.0}
    for row in pipeline_earn:
        if row.get("_id") in (1, 2):
            earnings_by_gen[row["_id"]] = float(row.get("total", 0.0))

    settings = await _settings(db)
    return {
        "referral_code": user["referral_code"],
        "gen1": {"users": out[1], "count": len(out[1]), "earnings": earnings_by_gen[1], "percent": settings.get("gen1_percent", 10)},
        "gen2": {"users": out[2], "count": len(out[2]), "earnings": earnings_by_gen[2], "percent": settings.get("gen2_percent", 5)},
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


# =========== TEAM DETAIL ===========
@router.get("/referrals/{generation}/details")
async def gen_details(generation: int, request: Request, user=Depends(get_current_user)):
    """Per-generation member detail: who they are + how much they have invested + when they invested."""
    if generation not in (1, 2):
        raise HTTPException(400, "Generation must be 1 or 2")
    db = request.app.state.db
    refs = await db.referrals.find({"referrer_id": user["id"], "generation": generation}, {"_id": 0}).to_list(2000)
    out = []
    for r in refs:
        u = await db.users.find_one({"id": r["referred_id"]}, {"_id": 0})
        if not u:
            continue
        invs = await db.investments.find({"user_id": u["id"]}, {"_id": 0}).sort("started_at", -1).to_list(50)
        total_invested = sum(float(i.get("amount", 0)) for i in invs)
        first = invs[-1] if invs else None  # earliest because sort desc
        out.append({
            "id": u["id"],
            "name": u["name"],
            "phone": u["phone"],
            "joined_at": u["created_at"],
            "total_invested": total_invested,
            "investments": [
                {"id": i["id"], "product_name": i["product_name"], "amount": i["amount"], "started_at": i["started_at"]}
                for i in invs
            ],
            "first_invested_at": (first or {}).get("started_at") if first else None,
        })
    return {"generation": generation, "users": out}


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
        "deposit_gateway": s.get("deposit_gateway", "paystack"),
        "payout_gateway": s.get("payout_gateway", "paystack"),
        "gen1_percent": s.get("gen1_percent", 10),
        "gen2_percent": s.get("gen2_percent", 5),
        "featured_product_id": s.get("featured_product_id"),
        "home_announcement": s.get("home_announcement", ""),
        "home_announcement_active": s.get("home_announcement_active", False),
        "home_announcement_image_url": s.get("home_announcement_image_url", ""),
        "telegram_url": s.get("telegram_url", ""),
        "welcome_message": s.get("welcome_message", ""),
        "welcome_modal_title": s.get("welcome_modal_title", ""),
        "welcome_modal_active": s.get("welcome_modal_active", True),
        "withdrawals_open": s.get("withdrawals_open", True),
        "withdrawal_start_time": s.get("withdrawal_start_time", "00:00"),
        "withdrawal_end_time": s.get("withdrawal_end_time", "23:59"),
        "auto_payout_enabled": s.get("auto_payout_enabled", False),
    }
