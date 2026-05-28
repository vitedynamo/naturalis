import os
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from fastapi.responses import Response

from auth import get_current_admin, gen_reference
from models import ProductCreate, CouponCreate, SettingsUpdate, AdminWithdrawalAction, PasswordResetActionRequest, PaystackPayRequest, AnnouncementCreate
from pydantic import BaseModel, Field
from storage import put_object, get_object
from nomba import transfer_to_bank as nomba_transfer, get_wallet_balance as nomba_balance, get_transfer_status as nomba_status, list_transfers as nomba_list_transfers, invalidate_token_cache as nomba_invalidate_token

router = APIRouter()


ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
APP_NAME = os.environ.get("APP_NAME", "naija-invest")

# Banks cache (Paystack /bank)
_banks_cache: dict = {"at": 0, "items": []}


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _extract_marasoft_gateway_id(raw: dict | None) -> str | None:
    """Pull the gateway-side reference (not our merchant_tx_ref) from a Marasoft
    checktransaction / verify_transaction response. Marasoft is inconsistent about
    field names — try several candidates and return the first that doesn't equal
    our own merchant ref.
    """
    if not isinstance(raw, dict):
        return None
    candidates = (
        "transaction_id", "transactionId", "txn_id", "txnId",
        "payment_ref", "paymentRef", "gateway_ref", "gatewayRef",
        "session_id", "sessionId", "reference_id", "referenceId",
        "marasoft_ref", "ms_ref",
    )
    for k in candidates:
        v = raw.get(k)
        if isinstance(v, (str, int)) and str(v).strip():
            return str(v).strip()
    # Some responses nest under "data"
    inner = raw.get("data")
    if isinstance(inner, dict):
        for k in candidates:
            v = inner.get(k)
            if isinstance(v, (str, int)) and str(v).strip():
                return str(v).strip()
    return None


def _extract_paystack_gateway_id(ddata: dict | None) -> str | None:
    """Paystack's verify response has `id` (numeric) which is the gateway-side ID.
    `reference` is the one WE sent. Return id only.
    """
    if not isinstance(ddata, dict):
        return None
    v = ddata.get("id")
    if isinstance(v, (str, int)) and str(v).strip():
        return str(v).strip()
    return None


async def _expire_stale_pending_deposits(db) -> int:
    """Mark Marasoft pending deposits older than 60 minutes as failed (timer expired).

    Returns number of deposits expired. Idempotent — safe to call on every list/poll.
    """
    cutoff_iso = (datetime.now(timezone.utc) - timedelta(minutes=60)).isoformat()
    res = await db.deposits.update_many(
        {
            "status": "pending",
            "method": "marasoft",
            "created_at": {"$lt": cutoff_iso},
        },
        {"$set": {
            "status": "failed",
            "admin_note": "Auto-expired: 60-minute transfer window elapsed without payment",
            "updated_at": _now_iso(),
        }},
    )
    return res.modified_count or 0


async def _log_admin_activity(db, admin: dict, action: str, *, target_type: str = None, target_id: str = None, description: str = "", meta: dict = None):
    """Append a row to the admin activity log. Best-effort — failures swallowed so they
    never break the actual admin action being audited.
    """
    try:
        doc = {
            "id": gen_reference("act"),
            "admin_id": admin.get("id", ""),
            "admin_phone": admin.get("phone", ""),
            "admin_name": admin.get("name", ""),
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "description": description or "",
            "meta": meta or {},
            "created_at": _now_iso(),
        }
        await db.admin_activity.insert_one(doc)
    except Exception:
        pass


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
    """List Nigerian banks. Nomba → Paystack → static fallback."""
    db = request.app.state.db
    now = time.time()
    if _banks_cache["items"] and (now - _banks_cache["at"]) < 3600:
        return _banks_cache["items"]
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
                _banks_cache["items"] = items
                _banks_cache["at"] = now
                return items
        except Exception:
            pass
    # Try Paystack
    secret, _ = await _get_secret_key(db)
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
    await _log_admin_activity(
        db, _admin, "withdrawal.paid_paystack",
        target_type="withdrawal", target_id=wid,
        description=f"Paid ₦{float(w['amount']):,.2f} via Paystack ({mode if mode == 'live' and secret else 'mock'})",
        meta={"amount": w["amount"], "user_id": w["user_id"], "reference": transfer_ref},
    )
    return {"status": "ok", "reference": transfer_ref, "mode": mode if (mode == "live" and secret) else "mock"}


@router.post("/admin/withdrawals/{wid}/pay-nomba")
async def pay_withdrawal_via_nomba(wid: str, payload: PaystackPayRequest, request: Request, _admin=Depends(get_current_admin)):
    """Approve a pending withdrawal via Nomba bank transfer (or mock if creds missing).

    Pre-flight: checks Nomba float balance. If insufficient, rejects the request and flags
    the withdrawal for admin attention without touching the user wallet.
    """
    db = request.app.state.db
    w = await db.withdrawals.find_one({"id": wid}, {"_id": 0})
    if not w:
        raise HTTPException(404, "Withdrawal not found")
    if w["status"] not in ("pending",):
        raise HTTPException(400, f"Already {w['status']}")

    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    client_id = s.get("nomba_client_id") or ""
    client_secret = s.get("nomba_client_secret") or ""
    account_id = s.get("nomba_account_id") or ""
    mode = s.get("payment_mode", "mock")
    transfer_ref = gen_reference("ntr")
    transfer_resp = None

    if mode == "live" and client_id and client_secret and account_id:
        # PRE-FLIGHT balance check — reject if Nomba float is insufficient
        try:
            available = await nomba_balance(
                client_id=client_id, client_secret=client_secret, account_id=account_id,
                environment=s.get("nomba_environment"),
            )
        except Exception as e:
            available = None
            balance_err = str(e)
        else:
            balance_err = None
        if available is not None and available < float(w["amount"]):
            await db.withdrawals.update_one(
                {"id": wid},
                {"$set": {
                    "needs_attention": True,
                    "insufficient_float": True,
                    "float_balance_at_request": available,
                    "admin_note": f"Insufficient Nomba float: ₦{available:,.2f} available, ₦{float(w['amount']):,.2f} requested. Top up Nomba then retry.",
                    "updated_at": _now_iso(),
                }},
            )
            raise HTTPException(402, f"Insufficient Nomba float (₦{available:,.2f} available). Top up your Nomba wallet then retry.")
        try:
            transfer_resp = await nomba_transfer(
                client_id=client_id, client_secret=client_secret, account_id=account_id,
                amount_naira=float(w["amount"]),
                account_number=w["account_number"], account_name=w["account_name"],
                bank_code=payload.bank_code, merchant_tx_ref=transfer_ref,
                narration=payload.reason or f"Withdrawal {wid}",
                environment=s.get("nomba_environment"),
            )
        except Exception as e:
            raise HTTPException(502, f"Nomba transfer failed: {e}")

        nomba_txn_id = transfer_resp.get("_nomba_transaction_id")
        nomba_initial_status = transfer_resp.get("_nomba_status", "PENDING")

        # If Nomba already reports SUCCESS on the create response, skip "processing".
        if nomba_initial_status == "SUCCESS":
            await db.withdrawals.update_one(
                {"id": wid},
                {"$set": {
                    "status": "paid",
                    "method": "auto",
                    "admin_note": f"Nomba transfer · ref {transfer_ref}"
                                  + (f" · txn {nomba_txn_id}" if nomba_txn_id else "")
                                  + " · live · SUCCESS at create",
                    "nomba_transfer_ref": transfer_ref,
                    "nomba_transaction_id": nomba_txn_id,
                    "bank_code": payload.bank_code,
                    "needs_attention": False,
                    "insufficient_float": False,
                    "updated_at": _now_iso(),
                }},
            )
            await _log_admin_activity(
                db, _admin, "withdrawal.paid_nomba",
                target_type="withdrawal", target_id=wid,
                description=f"Paid ₦{float(w['amount']):,.2f} via Nomba (SUCCESS at create)",
                meta={"amount": w["amount"], "user_id": w["user_id"], "reference": transfer_ref, "nomba_transaction_id": nomba_txn_id},
            )
            return {"status": "ok", "reference": transfer_ref, "nomba_transaction_id": nomba_txn_id, "mode": "live"}

        # Live transfer initiated — mark as "processing" so the status-poll confirms final state
        await db.withdrawals.update_one(
            {"id": wid},
            {"$set": {
                "status": "processing",
                "method": "auto",
                "admin_note": f"Nomba transfer · ref {transfer_ref}"
                              + (f" · txn {nomba_txn_id}" if nomba_txn_id else "")
                              + " · awaiting status confirmation",
                "nomba_transfer_ref": transfer_ref,
                "nomba_transaction_id": nomba_txn_id,
                "bank_code": payload.bank_code,
                "needs_attention": False,
                "insufficient_float": False,
                "updated_at": _now_iso(),
            }},
        )
        await _log_admin_activity(
            db, _admin, "withdrawal.paid_nomba",
            target_type="withdrawal", target_id=wid,
            description=f"Initiated Nomba payout ₦{float(w['amount']):,.2f} (processing)",
            meta={"amount": w["amount"], "user_id": w["user_id"], "reference": transfer_ref, "nomba_transaction_id": nomba_txn_id},
        )
        return {"status": "processing", "reference": transfer_ref, "nomba_transaction_id": nomba_txn_id, "mode": "live"}

    # Mock mode — no real transfer, mark as paid immediately
    await db.withdrawals.update_one(
        {"id": wid},
        {"$set": {
            "status": "paid",
            "method": "auto",
            "admin_note": f"Nomba transfer · ref {transfer_ref} · mock",
            "nomba_transfer_ref": transfer_ref,
            "bank_code": payload.bank_code,
            "updated_at": _now_iso(),
        }},
    )
    return {"status": "ok", "reference": transfer_ref, "mode": "mock"}


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


def _lagos_today_bounds():
    """Return ISO start/end of today in Africa/Lagos (UTC+1, no DST)."""
    from datetime import timedelta
    now_utc = datetime.now(timezone.utc)
    lagos = now_utc + timedelta(hours=1)
    start_lagos = lagos.replace(hour=0, minute=0, second=0, microsecond=0)
    start_utc = start_lagos - timedelta(hours=1)
    end_utc = start_utc + timedelta(days=1)
    return start_utc.isoformat(), end_utc.isoformat()


@router.get("/admin/stats/extended")
async def admin_stats_extended(request: Request, _admin=Depends(get_current_admin)):
    """Comprehensive dashboard stats — platform profit, today (Lagos), 24h payout projection, all-time."""
    db = request.app.state.db
    start_iso, end_iso = _lagos_today_bounds()

    # --- ALL TIME ---
    users_count = await db.users.count_documents({"is_admin": False})
    active_inv = await db.investments.count_documents({"status": "active"})
    total_inv = await db.investments.aggregate([
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    total_inv_amount = total_inv[0]["total"] if total_inv else 0

    deps_success = await db.deposits.aggregate([
        {"$match": {"status": "success"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]).to_list(1)
    total_deposits = deps_success[0]["total"] if deps_success else 0

    paid_wds = await db.withdrawals.aggregate([
        {"$match": {"status": {"$in": ["approved", "paid"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]).to_list(1)
    total_paid_out = paid_wds[0]["total"] if paid_wds else 0
    paid_wd_count = paid_wds[0]["count"] if paid_wds else 0

    pending_wds = await db.withdrawals.count_documents({"status": "pending"})

    # Welcome bonus + referral + profit credits (cost to platform)
    cost_aggs = await db.transactions.aggregate([
        {"$match": {"type": {"$in": ["bonus", "referral", "profit", "coupon"]}, "amount": {"$gt": 0}}},
        {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}},
    ]).to_list(20)
    cost_map = {row["_id"]: float(row["total"]) for row in cost_aggs}
    total_bonuses = cost_map.get("bonus", 0) + cost_map.get("coupon", 0)
    total_referral_paid = cost_map.get("referral", 0)
    total_profit_paid = cost_map.get("profit", 0)

    # Platform profit ~= deposits - withdrawals - bonuses - referral - profits
    platform_profit = round(
        float(total_deposits) - float(total_paid_out) - total_bonuses - total_referral_paid - total_profit_paid, 2
    )

    # --- 24H PAYOUT PROJECTION ---
    active_invs = await db.investments.find({"status": "active"}, {"_id": 0, "daily_profit_amount": 1}).to_list(10000)
    next_24h_payout = round(sum(float(i.get("daily_profit_amount", 0)) for i in active_invs), 2)

    # --- TODAY (Lagos) ---
    today_deps = await db.deposits.aggregate([
        {"$match": {"status": "success", "updated_at": {"$gte": start_iso, "$lt": end_iso}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]).to_list(1)
    deposits_today = today_deps[0]["total"] if today_deps else 0
    deposits_today_count = today_deps[0]["count"] if today_deps else 0

    today_paid = await db.withdrawals.aggregate([
        {"$match": {"status": {"$in": ["paid", "approved"]}, "updated_at": {"$gte": start_iso, "$lt": end_iso}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]).to_list(1)
    paid_today = today_paid[0]["total"] if today_paid else 0
    paid_today_count = today_paid[0]["count"] if today_paid else 0

    net_inflow_today = round(float(deposits_today) - float(paid_today), 2)
    pending_now = pending_wds  # snapshot

    # --- FEES (none currently tracked — placeholder 0) ---
    total_fees = 0
    awaiting_verification = await db.deposits.count_documents({"status": "pending"})

    # Online (last seen) — approximate as users updated in last 5 min if you tracked it; we use admin count
    online_count = 1  # admin viewing

    return {
        "platform_profit": platform_profit,
        "next_24h_payout": next_24h_payout,
        "users": users_count,
        "online": online_count,
        "total_deposits": total_deposits,
        "active_investments": active_inv,
        "pending_withdrawals": pending_wds,
        "today": {
            "deposits": deposits_today,
            "deposits_count": deposits_today_count,
            "paid_out": paid_today,
            "paid_out_count": paid_today_count,
            "net_inflow": net_inflow_today,
            "pending_now": pending_now,
        },
        "all_time": {
            "total_paid_out": total_paid_out,
            "paid_withdrawals_count": paid_wd_count,
            "total_fees": total_fees,
            "awaiting_verification": awaiting_verification,
            "total_investments": active_inv,
            "total_invested_amount": total_inv_amount,
            "total_bonuses": total_bonuses,
            "total_referral_paid": total_referral_paid,
            "total_profit_paid": total_profit_paid,
        },
        "system_health": {
            "fraud_attempts": 0,
            "amount_mismatches": 0,
        },
    }


@router.get("/admin/deposits/by-day")
async def admin_deposits_by_day(date: str, request: Request, _admin=Depends(get_current_admin)):
    """Return all successful deposits for a given calendar day (UTC-bounded, frontend already labels with Lagos date)."""
    from datetime import timedelta
    db = request.app.state.db
    try:
        day = datetime.fromisoformat(date).replace(tzinfo=timezone.utc)
    except Exception:
        raise HTTPException(400, "Invalid date — expected YYYY-MM-DD")
    start = day.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)

    deposits = await db.deposits.find(
        {"status": "success", "updated_at": {"$gte": start.isoformat(), "$lt": end.isoformat()}},
        {"_id": 0},
    ).sort("updated_at", -1).to_list(2000)

    # Attach user info
    user_ids = list({d["user_id"] for d in deposits})
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(2000)
    umap = {u["id"]: u for u in users}
    for d in deposits:
        u = umap.get(d["user_id"], {})
        d["user_name"] = u.get("name", "—")
        d["user_phone"] = u.get("phone", "")

    total = sum(float(d["amount"]) for d in deposits)
    return {"date": date, "total": round(total, 2), "count": len(deposits), "deposits": deposits}


@router.get("/admin/stats/inflow")
async def admin_stats_inflow(request: Request, frm: Optional[str] = None, to: Optional[str] = None, _admin=Depends(get_current_admin)):
    """Inflow breakdown for the dashboard chart between two ISO date strings (yyyy-mm-dd)."""
    from datetime import timedelta
    db = request.app.state.db
    now_utc = datetime.now(timezone.utc)
    if not frm:
        frm_dt = (now_utc - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        frm_dt = datetime.fromisoformat(frm).replace(tzinfo=timezone.utc)
    if not to:
        to_dt = now_utc.replace(hour=23, minute=59, second=59, microsecond=0)
    else:
        to_dt = datetime.fromisoformat(to).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

    items = await db.deposits.find(
        {"status": "success", "updated_at": {"$gte": frm_dt.isoformat(), "$lte": to_dt.isoformat()}},
        {"_id": 0},
    ).to_list(20000)

    total = sum(float(i["amount"]) for i in items)
    count = len(items)
    avg = round(total / count, 2) if count else 0

    # By day
    by_day = {}
    by_gateway = {}
    for d in items:
        day = (d.get("updated_at") or "")[:10]
        by_day[day] = by_day.get(day, 0) + float(d["amount"])
        gw = (d.get("method") or "paystack").lower()
        by_gateway[gw] = by_gateway.get(gw, {"total": 0, "count": 0})
        by_gateway[gw]["total"] += float(d["amount"])
        by_gateway[gw]["count"] += 1

    # Zero-fill every day in the range so the bar chart shows a continuous x-axis
    series = []
    cursor = frm_dt.date()
    end_date = to_dt.date()
    while cursor <= end_date:
        key = cursor.isoformat()
        series.append({"date": key, "total": round(by_day.get(key, 0), 2)})
        cursor = cursor + timedelta(days=1)
    peak = max(series, key=lambda x: x["total"], default={"date": "—", "total": 0})
    gateways = [{"name": k, "total": round(v["total"], 2), "count": v["count"]} for k, v in by_gateway.items()]

    return {
        "from": frm_dt.date().isoformat(),
        "to": to_dt.date().isoformat(),
        "total": round(total, 2),
        "count": count,
        "avg": avg,
        "peak": peak,
        "series": series,
        "gateways": gateways,
    }


# ===== Users =====
@router.get("/admin/users")
async def admin_users(
    request: Request,
    q: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort: str = Query("created_at"),
    order: str = Query("desc"),
    _admin=Depends(get_current_admin),
):
    """List users with search, pagination, and sorting. Returns {items, total, page, page_size, stats}."""
    db = request.app.state.db
    base_filter = {}
    if q:
        rx = {"$regex": q.strip(), "$options": "i"}
        base_filter = {"$or": [
            {"name": rx}, {"phone": rx}, {"email": rx}, {"referral_code": rx},
        ]}
    direction = -1 if (order or "desc").lower() == "desc" else 1
    sort_field = sort if sort in ("created_at", "wallet_balance", "name", "phone") else "created_at"
    total = await db.users.count_documents(base_filter)
    skip = (page - 1) * page_size
    users = await db.users.find(
        base_filter,
        {"_id": 0, "password_hash": 0, "security_answer_hash_1": 0, "security_answer_hash_2": 0},
    ).sort(sort_field, direction).skip(skip).limit(page_size).to_list(page_size)
    for u in users:
        u["has_withdrawal_pin"] = bool(u.pop("withdrawal_pin_hash", None))
        u["withdrawal_pin_locked"] = bool(u.get("withdrawal_pin_locked_until"))

    # Header stats (always include — independent of pagination/search)
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    five_min_ago = (now - timedelta(minutes=5)).isoformat()
    total_users = await db.users.count_documents({})
    online_now = await db.users.count_documents({"last_seen_at": {"$gte": five_min_ago}})
    new_today = await db.users.count_documents({"created_at": {"$gte": today_start}})
    # "verified" = at least one successful deposit (proxy for KYC-confirmed)
    pipeline = [
        {"$match": {"status": "success"}},
        {"$group": {"_id": "$user_id"}},
        {"$count": "n"},
    ]
    verified_rows = await db.deposits.aggregate(pipeline).to_list(1)
    verified = int(verified_rows[0]["n"]) if verified_rows else 0

    return {
        "items": users,
        "total": total,
        "page": page,
        "page_size": page_size,
        "stats": {
            "total_users": total_users,
            "online_now": online_now,
            "verified": verified,
            "new_today": new_today,
        },
    }


@router.get("/admin/users/export")
async def admin_users_export(request: Request, q: Optional[str] = Query(None), _admin=Depends(get_current_admin)):
    """CSV export of users (filtered by `q` if provided)."""
    import csv, io
    db = request.app.state.db
    base_filter = {}
    if q:
        rx = {"$regex": q.strip(), "$options": "i"}
        base_filter = {"$or": [{"name": rx}, {"phone": rx}, {"email": rx}, {"referral_code": rx}]}
    users = await db.users.find(base_filter, {"_id": 0, "password_hash": 0, "security_answer_hash_1": 0, "security_answer_hash_2": 0, "withdrawal_pin_hash": 0}).sort("created_at", -1).to_list(20000)
    buf = io.StringIO()
    cols = ["id", "name", "phone", "email", "wallet_balance", "referral_code", "referred_by_code", "is_blocked", "is_admin", "created_at"]
    w = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore")
    w.writeheader()
    for u in users:
        w.writerow(u)
    await _log_admin_activity(db, _admin, "users.exported", description=f"Exported {len(users)} users to CSV", meta={"filter_q": q or ""})
    return Response(content=buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=users-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.csv"})


@router.get("/admin/users/{user_id}/activity")
async def admin_user_activity(
    user_id: str, request: Request, limit: int = Query(200, ge=1, le=1000),
    _admin=Depends(get_current_admin),
):
    """Audit feed for a specific user — every admin action that targeted this user.

    Pulls from the `admin_activity` collection where target_type='user' and target_id=user_id.
    """
    db = request.app.state.db
    items = await db.admin_activity.find(
        {"target_type": "user", "target_id": user_id},
        {"_id": 0},
    ).sort("created_at", -1).to_list(limit)
    return {"items": items, "count": len(items)}


@router.get("/admin/users/{user_id}/details")
async def admin_user_details(user_id: str, request: Request, _admin=Depends(get_current_admin)):
    """Full user detail page: profile + aggregated stats + referrer info."""
    db = request.app.state.db
    u = await db.users.find_one(
        {"id": user_id},
        {"_id": 0, "password_hash": 0, "security_answer_hash_1": 0, "security_answer_hash_2": 0},
    )
    if not u:
        raise HTTPException(404, "User not found")
    u["has_withdrawal_pin"] = bool(u.pop("withdrawal_pin_hash", None))
    u["withdrawal_pin_locked"] = bool(u.get("withdrawal_pin_locked_until"))

    # Aggregate stats
    dep = await db.deposits.aggregate([
        {"$match": {"user_id": user_id, "status": "success"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]).to_list(1)
    total_deposited = float(dep[0]["total"]) if dep else 0.0
    deposits_count = int(dep[0]["count"]) if dep else 0

    inv = await db.investments.aggregate([
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": "$status", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]).to_list(20)
    total_invested = sum(float(r["total"]) for r in inv)
    active_plans = next((r for r in inv if r["_id"] == "active"), None)
    active_plans_count = int(active_plans["count"]) if active_plans else 0
    total_invested_count = sum(int(r["count"]) for r in inv)

    profit_earned = await db.transactions.aggregate([
        {"$match": {"user_id": user_id, "type": "profit", "amount": {"$gt": 0}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    profit_total = float(profit_earned[0]["total"]) if profit_earned else 0.0

    wdr = await db.withdrawals.aggregate([
        {"$match": {"user_id": user_id, "status": {"$in": ["paid", "approved"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]).to_list(1)
    total_withdrawn = float(wdr[0]["total"]) if wdr else 0.0
    withdrawals_count = int(wdr[0]["count"]) if wdr else 0

    # Referrals
    referred_users_count = await db.users.count_documents({"referred_by_code": u.get("referral_code")})
    invested_referrals = await db.users.count_documents({
        "referred_by_code": u.get("referral_code"),
        "wallet_balance": {"$gt": 0},  # cheap proxy
    })
    referral_bonus = await db.transactions.aggregate([
        {"$match": {"user_id": user_id, "type": "referral", "amount": {"$gt": 0}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    referral_bonus_total = float(referral_bonus[0]["total"]) if referral_bonus else 0.0

    # Referrer info
    referrer = None
    if u.get("referred_by_code"):
        r = await db.users.find_one(
            {"referral_code": u["referred_by_code"]},
            {"_id": 0, "id": 1, "name": 1, "phone": 1, "referral_code": 1},
        )
        if r:
            referrer = r

    # Counts for the tab badges (cheap)
    tx_count = await db.transactions.count_documents({"user_id": user_id})

    return {
        "user": u,
        "referrer": referrer,
        "stats": {
            "balance": float(u.get("wallet_balance", 0)),
            "total_deposited": total_deposited,
            "deposits_count": deposits_count,
            "total_invested": total_invested,
            "total_invested_count": total_invested_count,
            "active_plans": active_plans_count,
            "profit_earned": profit_total,
            "total_withdrawn": total_withdrawn,
            "withdrawals_count": withdrawals_count,
            "referrals": referred_users_count,
            "referrals_invested": invested_referrals,
            "referral_bonus": referral_bonus_total,
            "transactions_count": tx_count,
            "bank_set": bool(u.get("bank_name") and u.get("account_number")),
        },
    }


@router.get("/admin/users/{user_id}/timeline")
async def admin_user_timeline(
    user_id: str,
    request: Request,
    tab: str = Query("transactions"),
    limit: int = Query(100, ge=1, le=500),
    _admin=Depends(get_current_admin),
):
    """Return one paginated tab of the user's detail page.

    tab ∈ {investments, deposits, withdrawals, referrals, transactions, bank}
    """
    db = request.app.state.db
    if tab == "investments":
        items = await db.investments.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    elif tab == "deposits":
        await _expire_stale_pending_deposits(db)
        items = await db.deposits.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    elif tab == "withdrawals":
        items = await db.withdrawals.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    elif tab == "transactions":
        items = await db.transactions.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    elif tab == "referrals":
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "referral_code": 1})
        code = (user or {}).get("referral_code")
        items = []
        if code:
            items = await db.users.find(
                {"referred_by_code": code},
                {"_id": 0, "id": 1, "name": 1, "phone": 1, "created_at": 1, "wallet_balance": 1},
            ).sort("created_at", -1).to_list(limit)
    elif tab == "bank":
        u = await db.users.find_one(
            {"id": user_id},
            {"_id": 0, "bank_name": 1, "account_number": 1, "account_name": 1, "bank_code": 1},
        )
        items = [u] if u and u.get("bank_name") else []
    else:
        raise HTTPException(400, f"Unknown tab '{tab}'")
    return {"tab": tab, "items": items, "count": len(items)}


@router.post("/admin/users/{user_id}/reset-password")
async def admin_reset_password(user_id: str, payload: dict, request: Request, _admin=Depends(get_current_admin)):
    """Set a new account password for a user. Body: {new_password: str}.
    Returns the new password so the admin can hand it over (logged in audit trail without the plaintext)."""
    from auth import hash_password
    db = request.app.state.db
    new_pwd = (payload or {}).get("new_password", "").strip()
    if len(new_pwd) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    res = await db.users.update_one(
        {"id": user_id, "is_admin": {"$ne": True}},
        {"$set": {"password_hash": hash_password(new_pwd)}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "User not found (or target is an admin)")
    await _log_admin_activity(
        db, _admin, "user.password_reset",
        target_type="user", target_id=user_id,
        description="Reset user account password",
    )
    return {"status": "ok", "message": "Password updated"}


@router.post("/admin/users/{user_id}/change-phone")
async def admin_change_phone(user_id: str, payload: dict, request: Request, _admin=Depends(get_current_admin)):
    """Update a user's phone number. Body: {new_phone: str (11 digits)}."""
    db = request.app.state.db
    new_phone = (payload or {}).get("new_phone", "").strip()
    if not new_phone.isdigit() or len(new_phone) != 11:
        raise HTTPException(400, "Phone must be exactly 11 digits")
    exists = await db.users.find_one({"phone": new_phone, "id": {"$ne": user_id}}, {"_id": 0, "id": 1})
    if exists:
        raise HTTPException(409, "Another user already has that phone number")
    res = await db.users.update_one(
        {"id": user_id, "is_admin": {"$ne": True}},
        {"$set": {"phone": new_phone}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "User not found (or target is an admin)")
    await _log_admin_activity(
        db, _admin, "user.phone_changed",
        target_type="user", target_id=user_id,
        description=f"Changed phone to {new_phone}",
    )
    return {"status": "ok", "phone": new_phone}


@router.post("/admin/users/{user_id}/login-as")
async def admin_login_as(user_id: str, request: Request, _admin=Depends(get_current_admin)):
    """Issue a short-lived JWT for the target user so the admin can troubleshoot from their POV.
    All actions performed under this token are audited as the user — admin attribution is in the log row.
    """
    from auth import create_token
    db = request.app.state.db
    u = await db.users.find_one({"id": user_id, "is_admin": {"$ne": True}}, {"_id": 0, "id": 1, "phone": 1, "name": 1})
    if not u:
        raise HTTPException(404, "User not found (or target is an admin)")
    token = create_token(u["id"], is_admin=False)
    await _log_admin_activity(
        db, _admin, "user.impersonated",
        target_type="user", target_id=user_id,
        description=f"Issued login-as token for {u.get('name','—')} ({u.get('phone','—')})",
    )
    return {"token": token, "user_id": u["id"], "phone": u["phone"], "name": u["name"]}


@router.post("/admin/users/{user_id}/block")
async def block_user(user_id: str, request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    await db.users.update_one({"id": user_id}, {"$set": {"is_blocked": True}})
    await _log_admin_activity(db, _admin, "user.blocked", target_type="user", target_id=user_id, description="Blocked user account")
    return {"status": "ok"}


@router.post("/admin/users/{user_id}/unblock")
async def unblock_user(user_id: str, request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    await db.users.update_one({"id": user_id}, {"$set": {"is_blocked": False}})
    await _log_admin_activity(db, _admin, "user.unblocked", target_type="user", target_id=user_id, description="Unblocked user account")
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
    await _log_admin_activity(
        db, _admin, "user.balance_adjusted",
        target_type="user", target_id=user_id,
        description=f"{'Credited' if amount > 0 else 'Debited'} ₦{abs(amount):,.2f} — {note}",
        meta={"amount": amount, "note": note, "new_balance": new_user["wallet_balance"]},
    )
    return {"status": "ok", "wallet_balance": new_user["wallet_balance"]}


@router.post("/admin/users/{user_id}/clear-pin")
async def admin_clear_withdrawal_pin(user_id: str, request: Request, _admin=Depends(get_current_admin)):
    """Emergency admin action: clear a user's withdrawal PIN + any lockout."""
    db = request.app.state.db
    res = await db.users.update_one(
        {"id": user_id, "is_admin": {"$ne": True}},
        {"$set": {
            "withdrawal_pin_hash": None,
            "withdrawal_pin_failed": 0,
            "withdrawal_pin_locked_until": None,
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "User not found (or target is an admin)")
    await _log_admin_activity(
        db, _admin, "pin.cleared",
        target_type="user", target_id=user_id,
        description="Cleared user withdrawal PIN",
    )
    return {"status": "ok", "message": "Withdrawal PIN cleared. User must set a new one on their Profile."}


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
    await _expire_stale_pending_deposits(db)
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
    await _log_admin_activity(
        db, _admin, "deposit.approved",
        target_type="deposit", target_id=deposit_id,
        description=f"Approved deposit ₦{float(deposit['amount']):,.2f}",
        meta={"amount": deposit["amount"], "reference": deposit["reference"], "user_id": deposit["user_id"]},
    )
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
    if w["status"] not in ("pending", "processing"):
        raise HTTPException(400, f"Already {w['status']}")
    await db.withdrawals.update_one(
        {"id": wid},
        {"$set": {"status": "paid", "admin_note": payload.note, "updated_at": _now_iso()}},
    )
    await _log_admin_activity(
        db, _admin, "withdrawal.approved",
        target_type="withdrawal", target_id=wid,
        description=f"Manually marked ₦{float(w['amount']):,.2f} as paid",
        meta={"amount": w["amount"], "user_id": w["user_id"], "note": payload.note},
    )
    return {"status": "ok"}


@router.post("/admin/withdrawals/{wid}/reject")
async def reject_withdrawal(wid: str, payload: AdminWithdrawalAction, request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    w = await db.withdrawals.find_one({"id": wid}, {"_id": 0})
    if not w:
        raise HTTPException(404, "Withdrawal not found")
    if w["status"] not in ("pending", "processing"):
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
    await _log_admin_activity(
        db, _admin, "withdrawal.rejected",
        target_type="withdrawal", target_id=wid,
        description=f"Rejected ₦{float(w['amount']):,.2f} and refunded user",
        meta={"amount": w["amount"], "user_id": w["user_id"], "note": payload.note},
    )
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


class CancelInvestmentPayload(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)
    refund_capital: bool = False


@router.post("/admin/investments/{inv_id}/cancel")
async def admin_cancel_investment(
    inv_id: str,
    payload: CancelInvestmentPayload,
    request: Request,
    _admin=Depends(get_current_admin),
):
    """Cancel an active investment. Optionally refund the original capital to the
    user's wallet. Already-paid daily profits are NOT clawed back.
    """
    db = request.app.state.db
    inv = await db.investments.find_one({"id": inv_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Investment not found")
    if inv.get("status") != "active":
        raise HTTPException(400, f"Cannot cancel a {inv.get('status')} investment")

    now = _now_iso()
    update = {
        "status": "cancelled",
        "cancelled_at": now,
        "cancel_reason": payload.reason,
        "cancelled_by_admin_id": _admin["id"],
        "refund_capital": bool(payload.refund_capital),
        "updated_at": now,
    }
    refund_amt = 0.0
    new_balance = None
    if payload.refund_capital:
        refund_amt = float(inv.get("amount") or 0)
        if refund_amt > 0:
            new_user = await db.users.find_one_and_update(
                {"id": inv["user_id"]},
                {"$inc": {"wallet_balance": refund_amt}},
                return_document=True,
                projection={"_id": 0, "wallet_balance": 1},
            )
            new_balance = new_user["wallet_balance"] if new_user else None
            await db.transactions.insert_one({
                "id": gen_reference("tx"),
                "user_id": inv["user_id"],
                "type": "refund",
                "amount": refund_amt,
                "description": f"Capital refund · investment {inv_id} cancelled · {payload.reason}",
                "balance_after": new_balance,
                "meta": {"investment_id": inv_id, "by_admin": True, "reason": payload.reason},
                "created_at": now,
            })

    await db.investments.update_one({"id": inv_id}, {"$set": update})

    await _log_admin_activity(
        db, _admin, "investment.cancelled",
        target_type="investment", target_id=inv_id,
        description=(
            f"Cancelled investment of ₦{float(inv.get('amount') or 0):,.2f} "
            f"({inv.get('product_name')}) · {payload.reason}"
            + (f" · refunded ₦{refund_amt:,.2f}" if payload.refund_capital else " · no refund")
        ),
        meta={
            "investment_id": inv_id,
            "user_id": inv["user_id"],
            "amount": float(inv.get("amount") or 0),
            "refund_capital": payload.refund_capital,
            "refund_amount": refund_amt,
            "new_wallet_balance": new_balance,
            "reason": payload.reason,
        },
    )

    return {
        "status": "ok",
        "investment_id": inv_id,
        "cancelled_at": now,
        "refund_capital": payload.refund_capital,
        "refund_amount": refund_amt,
        "new_wallet_balance": new_balance,
    }


class PauseInvestmentPayload(BaseModel):
    reason: Optional[str] = Field(None, max_length=500)
    auto_resume_at: Optional[str] = Field(None, description="ISO-8601 timestamp at which a background sweep will auto-resume this investment.")


class ResumeInvestmentPayload(BaseModel):
    note: Optional[str] = Field(None, max_length=500)


class BulkInvestmentPayload(BaseModel):
    investment_ids: list[str] = Field(..., min_length=1, max_length=500)
    reason: Optional[str] = Field(None, max_length=500)
    auto_resume_at: Optional[str] = None


class AutoResumePayload(BaseModel):
    auto_resume_at: Optional[str] = Field(None, description="ISO-8601 timestamp or null to clear.")


def _validate_auto_resume_at(raw: Optional[str]) -> Optional[str]:
    """Returns a normalised ISO string (UTC) or raises 400. None passes through."""
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(400, "auto_resume_at must be ISO-8601 (e.g. 2026-06-01T09:00:00Z)")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    if dt <= datetime.now(timezone.utc):
        raise HTTPException(400, "auto_resume_at must be in the future")
    return dt.astimezone(timezone.utc).isoformat()


async def _pause_investment(db, inv_id: str, admin: dict, reason: Optional[str], auto_resume_at: Optional[str] = None) -> dict:
    """Returns one of: paused, not_found, not_active."""
    inv = await db.investments.find_one({"id": inv_id}, {"_id": 0})
    if not inv:
        return {"investment_id": inv_id, "result": "not_found"}
    if inv.get("status") != "active":
        return {"investment_id": inv_id, "result": "not_active", "status": inv.get("status")}
    now = _now_iso()
    update = {
        "status": "paused",
        "paused_at": now,
        "pause_reason": reason,
        "paused_by_admin_id": admin["id"],
        "auto_resume_at": auto_resume_at,
        "updated_at": now,
    }
    await db.investments.update_one({"id": inv_id}, {"$set": update})
    await _log_admin_activity(
        db, admin, "investment.paused",
        target_type="investment", target_id=inv_id,
        description=(
            f"Paused investment of ₦{float(inv.get('amount') or 0):,.2f} "
            f"({inv.get('product_name')})"
            + (f" · {reason}" if reason else "")
            + (f" · auto-resume {auto_resume_at}" if auto_resume_at else "")
        ),
        meta={"investment_id": inv_id, "user_id": inv["user_id"], "reason": reason, "auto_resume_at": auto_resume_at},
    )
    return {"investment_id": inv_id, "result": "paused", "paused_at": now, "auto_resume_at": auto_resume_at}


async def _resume_investment(db, inv_id: str, admin: Optional[dict], note: Optional[str], *, automated: bool = False) -> dict:
    """Returns one of: resumed, not_found, not_paused. When resuming, advance
    `last_payout_at` to now so the user doesn't get a backlog of "missed" drops
    during the pause window — payouts continue on a fresh 24h cycle from resume.
    Also clears `auto_resume_at` so the same row isn't picked up again by the sweep.
    """
    inv = await db.investments.find_one({"id": inv_id}, {"_id": 0})
    if not inv:
        return {"investment_id": inv_id, "result": "not_found"}
    if inv.get("status") != "paused":
        return {"investment_id": inv_id, "result": "not_paused", "status": inv.get("status")}
    now = _now_iso()
    await db.investments.update_one(
        {"id": inv_id},
        {"$set": {
            "status": "active",
            "resumed_at": now,
            "resume_note": note,
            "resumed_by_admin_id": (admin or {}).get("id") if admin else None,
            "auto_resumed": automated,
            "auto_resume_at": None,
            # Reset the 24h cycle so payouts schedule fresh from resume.
            "last_payout_at": now,
            "updated_at": now,
        }},
    )
    if admin is not None:
        await _log_admin_activity(
            db, admin, "investment.resumed" if not automated else "investment.auto_resumed",
            target_type="investment", target_id=inv_id,
            description=(
                f"{'Auto-resumed' if automated else 'Resumed'} investment of ₦{float(inv.get('amount') or 0):,.2f} "
                f"({inv.get('product_name')})"
                + (f" · {note}" if note else "")
            ),
            meta={"investment_id": inv_id, "user_id": inv["user_id"], "note": note, "automated": automated},
        )
    return {"investment_id": inv_id, "result": "resumed", "resumed_at": now, "automated": automated}


async def _sweep_due_auto_resumes(db) -> int:
    """Background sweep: resume any paused investments whose `auto_resume_at`
    is in the past. Returns the count resumed. Each resumed row gets an
    `investment.auto_resumed` activity entry attributed to a SYSTEM sentinel.
    """
    now_iso = _now_iso()
    due = await db.investments.find(
        {"status": "paused", "auto_resume_at": {"$ne": None, "$lte": now_iso}},
        {"_id": 0, "id": 1},
    ).to_list(500)
    if not due:
        return 0
    system_admin = {"id": "system_auto_resume", "name": "Auto-resume sweep", "phone": "system"}
    resumed = 0
    for d in due:
        r = await _resume_investment(db, d["id"], system_admin, "Scheduled auto-resume", automated=True)
        if r.get("result") == "resumed":
            resumed += 1
    return resumed




@router.post("/admin/investments/{inv_id}/pause")
async def admin_pause_investment(
    inv_id: str,
    payload: PauseInvestmentPayload,
    request: Request,
    _admin=Depends(get_current_admin),
):
    auto_iso = _validate_auto_resume_at(payload.auto_resume_at)
    res = await _pause_investment(request.app.state.db, inv_id, _admin, payload.reason, auto_iso)
    if res["result"] == "not_found":
        raise HTTPException(404, "Investment not found")
    if res["result"] == "not_active":
        raise HTTPException(400, f"Cannot pause a {res.get('status')} investment")
    return {"status": "ok", **res}


@router.post("/admin/investments/{inv_id}/resume")
async def admin_resume_investment(
    inv_id: str,
    payload: ResumeInvestmentPayload,
    request: Request,
    _admin=Depends(get_current_admin),
):
    res = await _resume_investment(request.app.state.db, inv_id, _admin, payload.note)
    if res["result"] == "not_found":
        raise HTTPException(404, "Investment not found")
    if res["result"] == "not_paused":
        raise HTTPException(400, f"Cannot resume a {res.get('status')} investment")
    return {"status": "ok", **res}


@router.patch("/admin/investments/{inv_id}/auto-resume")
async def admin_set_auto_resume(
    inv_id: str,
    payload: AutoResumePayload,
    request: Request,
    _admin=Depends(get_current_admin),
):
    """Set or clear the scheduled auto-resume timestamp on an already-paused investment.
    Pass `auto_resume_at: null` to cancel a previously scheduled auto-resume.
    """
    db = request.app.state.db
    inv = await db.investments.find_one({"id": inv_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Investment not found")
    if inv.get("status") != "paused":
        raise HTTPException(400, f"Cannot schedule auto-resume on a {inv.get('status')} investment")
    auto_iso = _validate_auto_resume_at(payload.auto_resume_at)
    await db.investments.update_one(
        {"id": inv_id},
        {"$set": {"auto_resume_at": auto_iso, "updated_at": _now_iso()}},
    )
    await _log_admin_activity(
        db, _admin, "investment.auto_resume_set" if auto_iso else "investment.auto_resume_cleared",
        target_type="investment", target_id=inv_id,
        description=(
            f"Set auto-resume to {auto_iso}" if auto_iso else "Cleared scheduled auto-resume"
        ),
        meta={"investment_id": inv_id, "auto_resume_at": auto_iso},
    )
    return {"status": "ok", "investment_id": inv_id, "auto_resume_at": auto_iso}


@router.post("/admin/investments/bulk-pause")
async def admin_bulk_pause_investments(
    payload: BulkInvestmentPayload,
    request: Request,
    _admin=Depends(get_current_admin),
):
    db = request.app.state.db
    auto_iso = _validate_auto_resume_at(payload.auto_resume_at)
    results = []
    counts = {"paused": 0, "not_active": 0, "not_found": 0}
    for inv_id in payload.investment_ids:
        r = await _pause_investment(db, inv_id, _admin, payload.reason, auto_iso)
        results.append(r)
        counts[r["result"]] = counts.get(r["result"], 0) + 1
    return {"status": "ok", "counts": counts, "results": results, "auto_resume_at": auto_iso}


@router.post("/admin/investments/bulk-resume")
async def admin_bulk_resume_investments(
    payload: BulkInvestmentPayload,
    request: Request,
    _admin=Depends(get_current_admin),
):
    db = request.app.state.db
    results = []
    counts = {"resumed": 0, "not_paused": 0, "not_found": 0}
    for inv_id in payload.investment_ids:
        r = await _resume_investment(db, inv_id, _admin, payload.reason)
        results.append(r)
        counts[r["result"]] = counts.get(r["result"], 0) + 1
    return {"status": "ok", "counts": counts, "results": results}




# ===== Referrals =====
@router.get("/admin/referrals")
async def list_referrals(request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    items = await db.referrals.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)

    # Hydrate per-row computations in batch to keep this O(N) round-trips, not O(N²).
    referrer_ids = {it["referrer_id"] for it in items}
    referred_ids = {it["referred_id"] for it in items}
    user_ids = list(referrer_ids | referred_ids)
    users = await db.users.find(
        {"id": {"$in": user_ids}},
        {"_id": 0, "id": 1, "name": 1, "phone": 1},
    ).to_list(len(user_ids) or 1)
    user_map = {u["id"]: u for u in users}

    # Aggregate referral bonuses by (referrer_id, from_user_id).
    bonus_rows = await db.transactions.aggregate([
        {"$match": {"type": "referral"}},
        {"$group": {
            "_id": {"referrer": "$user_id", "from": "$meta.from_user_id"},
            "total": {"$sum": "$amount"},
        }},
    ]).to_list(20000)
    bonus_map = {(r["_id"]["referrer"], r["_id"]["from"]): float(r["total"]) for r in bonus_rows if r["_id"].get("from")}

    # Aggregate referred-user invested totals.
    inv_rows = await db.investments.aggregate([
        {"$match": {"user_id": {"$in": list(referred_ids)}}},
        {"$group": {"_id": "$user_id", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]).to_list(20000)
    inv_map = {r["_id"]: {"total": float(r["total"]), "count": int(r["count"])} for r in inv_rows}

    for it in items:
        rr = user_map.get(it["referrer_id"])
        rd = user_map.get(it["referred_id"])
        it["referrer_name"] = rr["name"] if rr else "—"
        it["referrer_phone"] = rr["phone"] if rr else "—"
        it["referred_name"] = rd["name"] if rd else "—"
        it["referred_phone"] = rd["phone"] if rd else "—"
        it["bonus_paid"] = bonus_map.get((it["referrer_id"], it["referred_id"]), 0.0)
        inv = inv_map.get(it["referred_id"], {"total": 0.0, "count": 0})
        it["referred_invested"] = inv["total"]
        it["referred_investment_count"] = inv["count"]
        it["status"] = "earned" if (it["bonus_paid"] > 0 or it["referred_invested"] > 0) else "pending"
    return items


class PayMissingBonusesPayload(BaseModel):
    dry_run: bool = False


@router.post("/admin/referrals/pay-missing-bonuses")
async def admin_pay_missing_referral_bonuses(
    payload: PayMissingBonusesPayload,
    request: Request,
    _admin=Depends(get_current_admin),
):
    """For every (referrer, referred_user) pair where the referred user has invested
    but the referrer's recorded `referral` bonus is below what they should have earned,
    credit the delta to the referrer's wallet and write a `referral` transaction
    flagged `meta.backfill: true`.

    Set `dry_run: true` to preview the operation without crediting anything.
    """
    db = request.app.state.db
    settings = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    percents = {
        1: float(settings.get("gen1_percent", 10.0)),
        2: float(settings.get("gen2_percent", 5.0)),
    }

    referrals = await db.referrals.find({}, {"_id": 0}).to_list(20000)

    # Group all referred-user investments by user_id.
    referred_ids = list({r["referred_id"] for r in referrals})
    inv_docs = await db.investments.find(
        {"user_id": {"$in": referred_ids}},
        {"_id": 0, "id": 1, "user_id": 1, "amount": 1, "product_name": 1, "started_at": 1},
    ).to_list(50000)
    inv_by_user: dict[str, list[dict]] = {}
    for inv in inv_docs:
        inv_by_user.setdefault(inv["user_id"], []).append(inv)

    # Existing referral payouts keyed by (referrer_id, source_investment_id) — never double-pay.
    paid_rows = await db.transactions.find(
        {"type": "referral", "meta.investment_id": {"$exists": True}},
        {"_id": 0, "user_id": 1, "meta": 1},
    ).to_list(50000)
    already_paid_set = {
        (t["user_id"], (t.get("meta") or {}).get("investment_id"))
        for t in paid_rows
        if (t.get("meta") or {}).get("investment_id")
    }

    summary = {
        "scanned_referrals": len(referrals),
        "credited_users": 0,
        "credited_transactions": 0,
        "total_amount": 0.0,
        "dry_run": payload.dry_run,
    }
    per_referrer_totals: dict[str, float] = {}
    per_referrer_count: dict[str, int] = {}

    now = _now_iso()
    for r in referrals:
        gen = int(r.get("generation") or 0)
        pct = percents.get(gen)
        if not pct or pct <= 0:
            continue
        invs = inv_by_user.get(r["referred_id"], [])
        if not invs:
            continue
        for inv in invs:
            key = (r["referrer_id"], inv["id"])
            if key in already_paid_set:
                continue
            amount = round(float(inv.get("amount") or 0) * (pct / 100.0), 2)
            if amount <= 0:
                continue
            per_referrer_totals[r["referrer_id"]] = per_referrer_totals.get(r["referrer_id"], 0.0) + amount
            per_referrer_count[r["referrer_id"]] = per_referrer_count.get(r["referrer_id"], 0) + 1
            summary["total_amount"] += amount
            summary["credited_transactions"] += 1
            if payload.dry_run:
                already_paid_set.add(key)  # ensure same pair isn't counted twice across multi-gen
                continue
            referrer = await db.users.find_one_and_update(
                {"id": r["referrer_id"]},
                {"$inc": {
                    "wallet_balance": amount,
                    "total_earnings": amount,
                    "referral_earnings": amount,
                }},
                return_document=True,
                projection={"_id": 0, "wallet_balance": 1, "name": 1},
            )
            if not referrer:
                continue
            await db.transactions.insert_one({
                "id": gen_reference("tx"),
                "user_id": r["referrer_id"],
                "type": "referral",
                "amount": amount,
                "description": f"Gen-{gen} bonus backfill from {inv.get('product_name','an investment')}",
                "balance_after": referrer["wallet_balance"],
                "meta": {
                    "generation": gen,
                    "from_user_id": r["referred_id"],
                    "investment_id": inv["id"],
                    "basis": "invest_amount",
                    "backfill": True,
                },
                "created_at": now,
            })
            already_paid_set.add(key)

    summary["credited_users"] = len(per_referrer_totals)

    if not payload.dry_run and summary["credited_transactions"] > 0:
        await _log_admin_activity(
            db, _admin, "referral.backfill",
            target_type="referrals", target_id=None,
            description=(
                f"Paid missing referral bonuses · ₦{summary['total_amount']:,.2f} "
                f"across {summary['credited_transactions']} record(s) to {summary['credited_users']} user(s)"
            ),
            meta={
                "total_amount": summary["total_amount"],
                "credited_transactions": summary["credited_transactions"],
                "credited_users": summary["credited_users"],
                "per_referrer_totals": per_referrer_totals,
            },
        )

    return summary




# ===== Coupons =====
def _parse_optional_iso(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(400, "expires_at must be ISO-8601")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


@router.get("/admin/coupons")
async def list_coupons(request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    items = await db.coupons.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Enrich with redemption totals (used_count is also tracked on the coupon doc,
    # but this gives us a canonical sum and the *credit* delivered).
    if items:
        redemp_rows = await db.coupon_redemptions.aggregate([
            {"$group": {"_id": "$coupon_id", "count": {"$sum": 1}, "total": {"$sum": "$amount"}}},
        ]).to_list(1000)
        rmap = {r["_id"]: {"count": int(r["count"]), "total": float(r["total"])} for r in redemp_rows}
        for c in items:
            r = rmap.get(c["id"], {"count": 0, "total": 0.0})
            c["redemption_count"] = r["count"]
            c["total_credited"] = r["total"]
    return items


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
        "expires_at": _parse_optional_iso(data.expires_at),
        "note": (data.note or "").strip() or None,
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
        "expires_at": _parse_optional_iso(data.expires_at),
        "note": (data.note or "").strip() or None,
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


async def _refresh_pending_deposit(db, d: dict) -> dict:
    """Query the deposit's gateway for actual status and credit wallet if confirmed.

    Returns the deposit dict with a `_refresh` field describing the action taken.
    Currently supports Marasoft and Paystack.
    """
    if d.get("status") == "success":
        return {**d, "_refresh": "already_final"}
    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    gateway = d.get("method", "")
    reference = d.get("reference", "")
    action = "no_op"
    note_extra = None
    new_status = d.get("status")
    new_gateway_id: str | None = None

    if gateway == "marasoft" and s.get("marasoft_encryption_key"):
        try:
            from marasoft import check_transaction_status as ms_check
            res = await ms_check(
                enc_key=s["marasoft_encryption_key"],
                transaction_ref=reference,
            )
            new_gateway_id = _extract_marasoft_gateway_id(res.get("raw"))
            if res["status"] == "success":
                new_status = "success"
                action = "credited"
                note_extra = f"Confirmed via Marasoft poll · {res.get('raw_status') or 'success'}"
            elif res["status"] == "failed":
                new_status = "failed"
                action = "marked_failed"
                note_extra = f"Marasoft reports {res.get('raw_status') or 'failed'}"
            else:
                action = "still_pending"
                note_extra = f"Marasoft status: {res.get('raw_status') or 'pending'}"
        except Exception as e:
            action = "error"
            note_extra = f"Poll error: {e}"
    elif gateway == "paystack" and s.get("paystack_secret_key"):
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.get(
                    f"https://api.paystack.co/transaction/verify/{reference}",
                    headers={"Authorization": f"Bearer {s['paystack_secret_key']}"},
                )
                data = resp.json()
            ddata = data.get("data") or {}
            new_gateway_id = _extract_paystack_gateway_id(ddata)
            ps_status = (ddata.get("status") or "").lower()
            if ps_status == "success":
                new_status = "success"
                action = "credited"
                note_extra = "Confirmed via Paystack verify"
            elif ps_status in ("failed", "abandoned"):
                new_status = "failed"
                action = "marked_failed"
                note_extra = f"Paystack reports {ps_status}"
            else:
                action = "still_pending"
                note_extra = f"Paystack status: {ps_status or 'unknown'}"
        except Exception as e:
            action = "error"
            note_extra = f"Poll error: {e}"
    else:
        action = "no_provider"

    # Apply mutations
    update = {"updated_at": _now_iso()}
    if new_status != d.get("status"):
        update["status"] = new_status
        if note_extra:
            update["admin_note"] = note_extra
    # Persist gateway-side ID once captured (don't overwrite a previously stored one with None).
    if new_gateway_id and new_gateway_id != d.get("gateway_id"):
        update["gateway_id"] = new_gateway_id
    if new_status == "success" and d.get("status") != "success":
        # Credit user wallet idempotently
        new_user = await db.users.find_one_and_update(
            {"id": d["user_id"]},
            {"$inc": {"wallet_balance": float(d["amount"])}},
            return_document=True,
            projection={"_id": 0},
        )
        if new_user:
            await db.transactions.insert_one({
                "id": gen_reference("tx"),
                "user_id": d["user_id"],
                "type": "deposit",
                "amount": float(d["amount"]),
                "description": f"Deposit credited via {gateway} status poll",
                "balance_after": new_user["wallet_balance"],
                "meta": {"reference": reference, "gateway": gateway, "by": "poll"},
                "created_at": _now_iso(),
            })
    await db.deposits.update_one({"id": d["id"]}, {"$set": update})
    fresh = await db.deposits.find_one({"id": d["id"]}, {"_id": 0})
    fresh["_refresh"] = action
    return fresh


@router.post("/admin/deposits/{deposit_id}/refresh-status")
async def admin_refresh_deposit(deposit_id: str, request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    d = await db.deposits.find_one({"id": deposit_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Deposit not found")
    return await _refresh_pending_deposit(db, d)


@router.post("/admin/deposits/poll-pending")
async def admin_poll_pending_deposits(request: Request, _admin=Depends(get_current_admin)):
    """Admin trigger: re-verify every non-final deposit (pending OR failed) with its
    gateway. Failed-but-actually-paid deposits get credited automatically if the
    gateway now confirms them.
    """
    db = request.app.state.db
    expired = await _expire_stale_pending_deposits(db)
    items = await db.deposits.find({"status": {"$in": ["pending", "failed"]}}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    results = {"refreshed": 0, "credited": 0, "marked_failed": 0, "still_pending": 0, "no_provider": 0, "errors": 0, "scanned": len(items), "auto_expired": expired}
    for d in items:
        try:
            r = await _refresh_pending_deposit(db, d)
            results["refreshed"] += 1
            act = r.get("_refresh")
            if act == "credited":
                results["credited"] += 1
            elif act == "marked_failed":
                results["marked_failed"] += 1
            elif act == "still_pending":
                results["still_pending"] += 1
            elif act == "no_provider":
                results["no_provider"] += 1
            elif act == "error":
                results["errors"] += 1
        except Exception:
            results["errors"] += 1
    return results


@router.post("/admin/deposits/bulk-backfill-gateway-ids")
async def admin_bulk_backfill_deposit_gateway_ids(request: Request, _admin=Depends(get_current_admin)):
    """Scan every `success` deposit that is missing `gateway_id` and try to fetch
    the gateway-side ID (Marasoft transaction_id / Paystack id) from each provider's
    verify endpoint. Does NOT change status or credit anything — only writes the
    `gateway_id` field so the admin table shows the canonical reference.

    Returns counts of how many were scanned / updated / failed / skipped.
    """
    db = request.app.state.db
    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    has_marasoft = bool(s.get("marasoft_encryption_key"))
    has_paystack = bool(s.get("paystack_secret_key"))

    cursor = db.deposits.find(
        {
            "status": "success",
            "method": {"$in": ["marasoft", "paystack"]},
            "$or": [{"gateway_id": None}, {"gateway_id": ""}, {"gateway_id": {"$exists": False}}],
        },
        {"_id": 0, "id": 1, "method": 1, "reference": 1},
    ).sort("created_at", -1)
    candidates = await cursor.to_list(1000)

    results = {
        "scanned": len(candidates),
        "updated": 0,
        "not_found": 0,
        "errors": 0,
        "skipped_provider": 0,
    }

    for d in candidates:
        method = d.get("method")
        ref = d.get("reference") or ""
        if not ref:
            results["skipped_provider"] += 1
            continue
        gw_id: str | None = None
        try:
            if method == "marasoft" and has_marasoft:
                from marasoft import check_transaction_status as ms_check
                res = await ms_check(enc_key=s["marasoft_encryption_key"], transaction_ref=ref)
                gw_id = _extract_marasoft_gateway_id(res.get("raw"))
            elif method == "paystack" and has_paystack:
                async with httpx.AsyncClient(timeout=20) as client:
                    resp = await client.get(
                        f"https://api.paystack.co/transaction/verify/{ref}",
                        headers={"Authorization": f"Bearer {s['paystack_secret_key']}"},
                    )
                    data = resp.json()
                gw_id = _extract_paystack_gateway_id(data.get("data") or {})
            else:
                results["skipped_provider"] += 1
                continue
        except Exception:
            results["errors"] += 1
            continue
        if not gw_id:
            results["not_found"] += 1
            continue
        await db.deposits.update_one(
            {"id": d["id"]},
            {"$set": {"gateway_id": gw_id, "updated_at": _now_iso()}},
        )
        results["updated"] += 1

    return results




# ===== Nomba float balance + transfer status =====
@router.get("/admin/nomba/balance")
async def admin_nomba_balance(request: Request, _admin=Depends(get_current_admin)):
    """Return current Nomba parent-account float balance. Returns null balance if creds missing or live mode off."""
    db = request.app.state.db
    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    if s.get("payment_mode") != "live" or not (s.get("nomba_client_id") and s.get("nomba_client_secret") and s.get("nomba_account_id")):
        return {"balance": None, "currency": "NGN", "live": False, "message": "Nomba live credentials not configured."}
    try:
        bal = await nomba_balance(
            client_id=s["nomba_client_id"], client_secret=s["nomba_client_secret"],
            account_id=s["nomba_account_id"],
            environment=s.get("nomba_environment"),
        )
        return {"balance": round(float(bal), 2), "currency": "NGN", "live": True, "environment": s.get("nomba_environment", "auto")}
    except Exception as e:
        return {"balance": None, "currency": "NGN", "live": True, "environment": s.get("nomba_environment", "auto"), "error": str(e)}


async def _refresh_one_withdrawal(db, w: dict) -> dict:
    """Query the payment provider for the actual status of a single withdrawal and apply it.

    Returns the updated withdrawal dict (with `_refresh` field describing the action taken).
    """
    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    mode = s.get("payment_mode", "mock")
    ref = w.get("nomba_transfer_ref") or ""
    nomba_txn_id = w.get("nomba_transaction_id") or ""
    paystack_ref = w.get("paystack_transfer_ref") or ""
    action = "no_op"
    new_status = w.get("status")
    note_extra = None

    # Only refresh statuses that are not yet final
    if w.get("status") in ("paid", "rejected"):
        return {**w, "_refresh": "already_final"}

    # Poll Nomba when we have EITHER our merchantTxRef OR Nomba's own transactionId.
    if (ref or nomba_txn_id) and mode == "live" and s.get("nomba_client_id"):
        try:
            res = await nomba_status(
                client_id=s["nomba_client_id"], client_secret=s["nomba_client_secret"],
                account_id=s.get("nomba_account_id", ""), merchant_tx_ref=ref or nomba_txn_id,
                nomba_transaction_id=nomba_txn_id or None,
                environment=s.get("nomba_environment"),
            )
            st = res.get("status", "PENDING")
            if st == "SUCCESS":
                new_status = "paid"
                action = "marked_paid"
                note_extra = f"Confirmed via Nomba status poll · {res.get('raw_status') or 'SUCCESS'}"
            elif st == "FAILED":
                # Refund the user and mark withdrawal as rejected
                refund_amount = float(w["amount"])
                user_after = await db.users.find_one_and_update(
                    {"id": w["user_id"]},
                    {"$inc": {"wallet_balance": refund_amount}},
                    return_document=True, projection={"_id": 0},
                )
                if user_after:
                    await db.transactions.insert_one({
                        "id": gen_reference("tx"),
                        "user_id": w["user_id"], "type": "refund", "amount": refund_amount,
                        "description": f"Auto-refund: Nomba transfer failed ({ref})",
                        "balance_after": user_after["wallet_balance"],
                        "meta": {"withdrawal_id": w["id"], "by": "nomba_status_poll"},
                        "created_at": _now_iso(),
                    })
                new_status = "rejected"
                action = "marked_rejected_refunded"
                note_extra = f"Nomba reports {res.get('raw_status') or 'FAILED'} — user refunded ₦{refund_amount:,.2f}"
            else:
                action = "still_pending"
                note_extra = f"Nomba status: {res.get('raw_status') or 'PENDING'}"
        except Exception as e:
            action = "error"
            note_extra = f"Status poll error: {e}"

    elif paystack_ref and mode == "live" and s.get("paystack_secret_key"):
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.get(
                    f"https://api.paystack.co/transfer/verify/{paystack_ref}",
                    headers={"Authorization": f"Bearer {s['paystack_secret_key']}"},
                )
                data = resp.json()
            d = data.get("data") or {}
            st = (d.get("status") or "").lower()
            if st in ("success", "successful"):
                new_status = "paid"
                action = "marked_paid"
                note_extra = f"Confirmed via Paystack transfer/verify · {st}"
            elif st in ("failed", "reversed"):
                refund_amount = float(w["amount"])
                user_after = await db.users.find_one_and_update(
                    {"id": w["user_id"]},
                    {"$inc": {"wallet_balance": refund_amount}},
                    return_document=True, projection={"_id": 0},
                )
                if user_after:
                    await db.transactions.insert_one({
                        "id": gen_reference("tx"),
                        "user_id": w["user_id"], "type": "refund", "amount": refund_amount,
                        "description": f"Auto-refund: Paystack transfer {st} ({paystack_ref})",
                        "balance_after": user_after["wallet_balance"],
                        "meta": {"withdrawal_id": w["id"], "by": "paystack_status_poll"},
                        "created_at": _now_iso(),
                    })
                new_status = "rejected"
                action = "marked_rejected_refunded"
                note_extra = f"Paystack reports {st} — user refunded ₦{refund_amount:,.2f}"
            else:
                action = "still_pending"
                note_extra = f"Paystack status: {st or 'unknown'}"
        except Exception as e:
            action = "error"
            note_extra = f"Status poll error: {e}"
    else:
        action = "no_provider_ref"

    update = {"updated_at": _now_iso()}
    if new_status != w.get("status"):
        update["status"] = new_status
    if note_extra:
        # Strip any prior trailing "status poll" / "Nomba status" / "Paystack status" / "Confirmed via …" suffixes
        # so the admin_note doesn't accumulate identical lines on every refresh.
        prev = (w.get("admin_note") or "").strip()
        if prev:
            for prefix in (
                "Nomba status:", "Paystack status:", "Status poll error:",
                "Confirmed via Nomba", "Confirmed via Paystack",
                "Nomba reports", "Paystack reports",
            ):
                while True:
                    idx = prev.rfind(f"· {prefix}")
                    if idx < 0:
                        break
                    prev = prev[:idx].rstrip()
        update["admin_note"] = f"{prev} · {note_extra}" if prev else note_extra
    await db.withdrawals.update_one({"id": w["id"]}, {"$set": update})

    fresh = await db.withdrawals.find_one({"id": w["id"]}, {"_id": 0})
    fresh["_refresh"] = action
    return fresh


@router.post("/admin/withdrawals/backfill-all-stuck")
async def admin_backfill_all_stuck(request: Request, _admin=Depends(get_current_admin)):
    """Bulk: for every non-final withdrawal missing `nomba_transaction_id`, scan Nomba's
    transaction history and link the match. Returns per-record outcomes."""
    db = request.app.state.db
    items = await db.withdrawals.find(
        {"status": {"$in": ["pending", "processing"]}, "nomba_transaction_id": {"$in": [None, ""]}},
        {"_id": 0},
    ).sort("created_at", 1).to_list(500)

    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    if not s.get("nomba_client_id"):
        raise HTTPException(400, "Nomba credentials not configured")

    results = {"scanned": len(items), "matched": 0, "marked_paid": 0, "no_match": 0, "errors": 0, "details": []}

    # Pre-fetch every Nomba ID already linked elsewhere so we don't double-link the same
    # Nomba transaction to two different withdrawals.
    used_nomba_ids = set()
    async for u in db.withdrawals.find(
        {"nomba_transaction_id": {"$nin": [None, ""]}},
        {"_id": 0, "nomba_transaction_id": 1},
    ):
        if u.get("nomba_transaction_id"):
            used_nomba_ids.add(u["nomba_transaction_id"])

    for w in items:
        wid = w["id"]
        try:
            # Reuse the single-record backfill flow
            try:
                created_dt = datetime.fromisoformat((w.get("created_at") or "").replace("Z", "+00:00"))
            except Exception:
                created_dt = datetime.now(timezone.utc)
            date_from = (created_dt - timedelta(days=1)).strftime("%Y-%m-%d")
            date_to = (created_dt + timedelta(days=1)).strftime("%Y-%m-%d")

            candidates = []
            for page in (1, 2, 3):
                page_items = await nomba_list_transfers(
                    client_id=s["nomba_client_id"], client_secret=s["nomba_client_secret"],
                    account_id=s.get("nomba_account_id", ""),
                    date_from=date_from, date_to=date_to, page=page, limit=100,
                    environment=s.get("nomba_environment"),
                )
                if not page_items:
                    break
                candidates.extend(page_items)

            if not candidates:
                results["no_match"] += 1
                results["details"].append({"id": wid, "outcome": "no_candidates"})
                continue

            target_amount = float(w.get("amount") or 0)
            target_account = (w.get("account_number") or "").strip()
            target_merchant_ref = (w.get("nomba_transfer_ref") or "").strip()

            def _amt(t):
                for k in ("amount", "transactionAmount", "value"):
                    v = t.get(k)
                    if v is not None:
                        try: return float(v)
                        except Exception: continue
                return None

            def _acct(t):
                for k in ("accountNumber", "account_number", "recipientAccountNumber",
                          "destinationAccountNumber", "customerBillerId", "billerId"):
                    v = t.get(k)
                    if isinstance(v, str) and v.strip():
                        return v.strip()
                return ""

            def _mref(t):
                for k in ("merchantTxRef", "merchant_tx_ref", "transactionRef", "merchantReference"):
                    v = t.get(k)
                    if isinstance(v, str) and v.strip():
                        return v.strip()
                return ""

            def _id(t):
                for k in ("id", "transactionId", "nombaTxnId"):
                    v = t.get(k)
                    if isinstance(v, str) and v.strip():
                        return v.strip()
                return ""

            match = None
            if target_merchant_ref:
                match = next(
                    (t for t in candidates
                     if _mref(t) == target_merchant_ref and _id(t) not in used_nomba_ids),
                    None,
                )
            if not match and target_account:
                match = next(
                    (t for t in candidates
                     if _amt(t) == target_amount
                     and _acct(t).endswith(target_account[-10:])
                     and _id(t) not in used_nomba_ids),
                    None,
                )
            if not match:
                results["no_match"] += 1
                results["details"].append({"id": wid, "outcome": "no_match"})
                continue

            nomba_id = _id(match)
            if not nomba_id:
                results["no_match"] += 1
                results["details"].append({"id": wid, "outcome": "matched_but_no_id"})
                continue

            # Reserve this Nomba ID so subsequent records in the same batch don't reuse it.
            used_nomba_ids.add(nomba_id)

            await db.withdrawals.update_one(
                {"id": wid},
                {"$set": {"nomba_transaction_id": nomba_id, "updated_at": _now_iso()}},
            )
            w2 = await db.withdrawals.find_one({"id": wid}, {"_id": 0})
            refreshed = await _refresh_one_withdrawal(db, w2)
            results["matched"] += 1
            if refreshed.get("_refresh") == "marked_paid":
                results["marked_paid"] += 1
            results["details"].append({
                "id": wid, "nomba_id": nomba_id,
                "outcome": refreshed.get("_refresh"),
                "status": refreshed.get("status"),
            })
        except Exception as e:
            results["errors"] += 1
            results["details"].append({"id": wid, "outcome": "error", "error": str(e)})

    await _log_admin_activity(
        db, _admin, "withdrawal.bulk_backfill",
        target_type="withdrawal", target_id="bulk",
        description=f"Bulk-backfill: matched {results['matched']}/{results['scanned']}, paid {results['marked_paid']}",
        meta={k: v for k, v in results.items() if k != "details"},
    )
    return results


@router.post("/admin/withdrawals/{wid}/refresh-status")
async def admin_refresh_status(wid: str, request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    w = await db.withdrawals.find_one({"id": wid}, {"_id": 0})
    if not w:
        raise HTTPException(404, "Withdrawal not found")
    return await _refresh_one_withdrawal(db, w)


class _ResolveBody(BaseModel):
    nomba_transaction_id: str


@router.post("/admin/withdrawals/{wid}/resolve-from-nomba")
async def admin_resolve_from_nomba(
    wid: str, body: _ResolveBody, request: Request, _admin=Depends(get_current_admin),
):
    """Manual resolve: admin pastes Nomba's `transactionId` (visible in Nomba dashboard),
    we store it on the withdrawal and immediately re-poll to flip status."""
    db = request.app.state.db
    w = await db.withdrawals.find_one({"id": wid}, {"_id": 0})
    if not w:
        raise HTTPException(404, "Withdrawal not found")
    txn_id = (body.nomba_transaction_id or "").strip()
    if not txn_id:
        raise HTTPException(400, "nomba_transaction_id is required")
    await db.withdrawals.update_one(
        {"id": wid},
        {"$set": {"nomba_transaction_id": txn_id, "updated_at": _now_iso()}},
    )
    # Re-read & refresh
    w = await db.withdrawals.find_one({"id": wid}, {"_id": 0})
    refreshed = await _refresh_one_withdrawal(db, w)
    await _log_admin_activity(
        db, _admin, "withdrawal.resolve_from_nomba",
        target_type="withdrawal", target_id=wid,
        description=f"Admin attached Nomba transactionId {txn_id} and re-polled",
        meta={"nomba_transaction_id": txn_id, "result": refreshed.get("_refresh")},
    )
    return refreshed


@router.post("/admin/withdrawals/{wid}/backfill-nomba-id")
async def admin_backfill_nomba_id(wid: str, request: Request, _admin=Depends(get_current_admin)):
    """Auto-backfill Nomba's transactionId for a legacy withdrawal that's missing it.

    Strategy: pull Nomba's transfer history for a window around the withdrawal's
    `created_at` and find the entry whose amount + accountNumber match — then store
    its `id` as our `nomba_transaction_id` and re-poll.
    """
    db = request.app.state.db
    w = await db.withdrawals.find_one({"id": wid}, {"_id": 0})
    if not w:
        raise HTTPException(404, "Withdrawal not found")
    if w.get("nomba_transaction_id"):
        return {"status": "skip", "reason": "already has nomba_transaction_id", "value": w["nomba_transaction_id"]}

    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    if not s.get("nomba_client_id"):
        raise HTTPException(400, "Nomba credentials not configured")

    # Window: created_at ± 1 day to be generous
    try:
        created_dt = datetime.fromisoformat((w.get("created_at") or "").replace("Z", "+00:00"))
    except Exception:
        created_dt = datetime.now(timezone.utc)
    date_from = (created_dt - timedelta(days=1)).strftime("%Y-%m-%d")
    date_to = (created_dt + timedelta(days=1)).strftime("%Y-%m-%d")

    candidates = []
    for page in (1, 2, 3):
        items = await nomba_list_transfers(
            client_id=s["nomba_client_id"], client_secret=s["nomba_client_secret"],
            account_id=s.get("nomba_account_id", ""),
            date_from=date_from, date_to=date_to, page=page, limit=100,
            environment=s.get("nomba_environment"),
        )
        if not items:
            break
        candidates.extend(items)

    if not candidates:
        return {"status": "no_match", "reason": "Nomba returned no transactions in this window", "scanned": 0}

    target_amount = float(w.get("amount") or 0)
    target_account = (w.get("account_number") or "").strip()
    target_merchant_ref = (w.get("nomba_transfer_ref") or "").strip()

    def _amt(t):
        for k in ("amount", "transactionAmount", "value"):
            v = t.get(k)
            if v is not None:
                try: return float(v)
                except Exception: continue
        return None

    def _acct(t):
        for k in ("accountNumber", "account_number", "recipientAccountNumber",
                  "destinationAccountNumber", "customerBillerId", "billerId",
                  "recipientAccount", "destinationAccount"):
            v = t.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
        return ""

    def _mref(t):
        for k in ("merchantTxRef", "merchant_tx_ref", "transactionRef",
                  "merchantTransactionRef", "merchantReference"):
            v = t.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
        return ""

    def _id(t):
        for k in ("id", "transactionId", "nombaTxnId"):
            v = t.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
        return ""

    def _ts(t):
        for k in ("timeCreated", "createdAt", "created_at"):
            v = t.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
        return ""

    # Match priority: merchantTxRef > amount+account > amount+time-proximity (legacy).
    # Also skip Nomba IDs already linked to other withdrawals (avoid double-linking).
    used_nomba_ids = set()
    async for u in db.withdrawals.find(
        {"id": {"$ne": wid}, "nomba_transaction_id": {"$nin": [None, ""]}},
        {"_id": 0, "nomba_transaction_id": 1},
    ):
        if u.get("nomba_transaction_id"):
            used_nomba_ids.add(u["nomba_transaction_id"])

    match = None
    if target_merchant_ref:
        match = next(
            (t for t in candidates
             if _mref(t) == target_merchant_ref and _id(t) not in used_nomba_ids),
            None,
        )
    if not match and target_account:
        match = next(
            (t for t in candidates
             if _amt(t) == target_amount
             and _acct(t).endswith(target_account[-10:])
             and _id(t) not in used_nomba_ids),
            None,
        )
    # Last resort: same amount within ±5 minutes of the withdrawal create time
    if not match and target_amount:
        try:
            target_dt = datetime.fromisoformat((w.get("created_at") or "").replace("Z", "+00:00"))
        except Exception:
            target_dt = None
        if target_dt:
            for t in candidates:
                ts = _ts(t)
                if not ts or _amt(t) != target_amount: continue
                if _id(t) in used_nomba_ids: continue
                try:
                    tdt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except Exception:
                    continue
                if abs((tdt - target_dt).total_seconds()) <= 300:
                    match = t
                    break

    if not match:
        return {
            "status": "no_match",
            "reason": "No Nomba transaction matched merchantTxRef or amount+account",
            "scanned": len(candidates),
        }

    nomba_id = _id(match)
    if not nomba_id:
        return {"status": "no_id", "reason": "Matched transaction has no usable id field", "raw": match}

    await db.withdrawals.update_one(
        {"id": wid},
        {"$set": {"nomba_transaction_id": nomba_id, "updated_at": _now_iso()}},
    )
    w = await db.withdrawals.find_one({"id": wid}, {"_id": 0})
    refreshed = await _refresh_one_withdrawal(db, w)
    await _log_admin_activity(
        db, _admin, "withdrawal.backfill_nomba_id",
        target_type="withdrawal", target_id=wid,
        description=f"Auto-backfilled Nomba transactionId {nomba_id}",
        meta={"nomba_transaction_id": nomba_id, "scanned": len(candidates), "result": refreshed.get("_refresh")},
    )
    return {
        "status": "ok",
        "nomba_transaction_id": nomba_id,
        "scanned": len(candidates),
        "refresh_result": refreshed.get("_refresh"),
        "withdrawal_status": refreshed.get("status"),
    }


@router.post("/admin/withdrawals/poll-pending")
async def admin_poll_pending(request: Request, _admin=Depends(get_current_admin)):
    """Admin trigger: poll provider status for every non-final withdrawal."""
    db = request.app.state.db
    items = await db.withdrawals.find({"status": {"$in": ["pending", "processing"]}}, {"_id": 0}).to_list(500)
    results = {"refreshed": 0, "marked_paid": 0, "marked_rejected": 0, "still_pending": 0, "no_provider_ref": 0, "errors": 0}
    for w in items:
        try:
            r = await _refresh_one_withdrawal(db, w)
            results["refreshed"] += 1
            act = r.get("_refresh")
            if act == "marked_paid":
                results["marked_paid"] += 1
            elif act == "marked_rejected_refunded":
                results["marked_rejected"] += 1
            elif act == "still_pending":
                results["still_pending"] += 1
            elif act == "no_provider_ref":
                results["no_provider_ref"] += 1
            elif act == "error":
                results["errors"] += 1
        except Exception:
            results["errors"] += 1
    return results


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
        # Log settings change (redact sensitive fields)
        SENSITIVE = {"paystack_secret_key", "nomba_client_secret"}
        redacted = {k: ("•••" if k in SENSITIVE else v) for k, v in payload.items()}
        await _log_admin_activity(
            db, _admin, "settings.updated",
            target_type="settings", target_id="global",
            description=f"Updated {len(payload)} setting(s): {', '.join(payload.keys())}",
            meta={"changed_keys": list(payload.keys()), "values": redacted},
        )
    # If Paystack/Nomba/Marasoft creds were changed, bust the banks cache + Nomba token so the next call uses fresh creds
    if "paystack_secret_key" in payload or "nomba_client_id" in payload or "nomba_client_secret" in payload or "nomba_account_id" in payload or "nomba_environment" in payload or "marasoft_public_key" in payload or "marasoft_secret_key" in payload or "marasoft_secret_hash" in payload:
        _banks_cache["items"] = []
        _banks_cache["at"] = 0
        try:
            nomba_invalidate_token()
        except Exception:
            pass
    return await db.settings.find_one({"id": "global"}, {"_id": 0})



@router.get("/admin/stats/profit-breakdown")
async def admin_profit_breakdown(
    request: Request,
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    _admin=Depends(get_current_admin),
):
    """Detailed line-by-line breakdown of platform profit.

    Accepts optional ISO datetime range filters `from` and `to`. Without filters
    the response covers all-time. The filter is applied on `created_at` for
    deposits / transactions, and on `updated_at` for withdrawals (status change time).
    """
    db = request.app.state.db

    def _range_clause(field: str):
        if not from_ and not to:
            return {}
        clause = {}
        if from_:
            clause["$gte"] = from_
        if to:
            clause["$lte"] = to
        return {field: clause}

    dep_match = {"status": "success", **_range_clause("created_at")}
    deps = await db.deposits.aggregate([
        {"$match": dep_match},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]).to_list(1)
    total_deposits = float(deps[0]["total"]) if deps else 0.0
    deposits_count = int(deps[0]["count"]) if deps else 0

    paid_match = {"status": {"$in": ["approved", "paid"]}, **_range_clause("updated_at")}
    paid = await db.withdrawals.aggregate([
        {"$match": paid_match},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]).to_list(1)
    total_paid = float(paid[0]["total"]) if paid else 0.0
    paid_count = int(paid[0]["count"]) if paid else 0

    tx_match = {"type": {"$in": ["bonus", "coupon", "referral", "profit"]}, "amount": {"$gt": 0}, **_range_clause("created_at")}
    rows = await db.transactions.aggregate([
        {"$match": tx_match},
        {"$group": {"_id": "$type", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]).to_list(20)
    bucket_map = {r["_id"]: {"total": float(r["total"]), "count": int(r["count"])} for r in rows}
    welcome = bucket_map.get("bonus", {"total": 0, "count": 0})
    coupons = bucket_map.get("coupon", {"total": 0, "count": 0})
    referrals = bucket_map.get("referral", {"total": 0, "count": 0})
    profits = bucket_map.get("profit", {"total": 0, "count": 0})

    net_profit = round(
        total_deposits - total_paid - welcome["total"] - coupons["total"] - referrals["total"] - profits["total"],
        2,
    )

    async def _recent(ttype, n=5):
        q = {"type": ttype, **_range_clause("created_at")}
        items = await db.transactions.find(q, {"_id": 0}).sort("created_at", -1).limit(n).to_list(n)
        for it in items:
            u = await db.users.find_one({"id": it["user_id"]}, {"_id": 0, "name": 1, "phone": 1})
            it["user_name"] = u["name"] if u else "—"
            it["user_phone"] = u["phone"] if u else "—"
        return items

    return {
        "range": {"from": from_, "to": to},
        "inflow": {"total_deposits": total_deposits, "count": deposits_count},
        "outflow": {
            "paid_withdrawals": {"total": total_paid, "count": paid_count},
            "welcome_bonuses": welcome,
            "coupon_redemptions": coupons,
            "referral_commissions": referrals,
            "daily_profit_credits": profits,
        },
        "net_profit": net_profit,
        "formula": "deposits − paid_withdrawals − welcome_bonuses − coupons − referral_commissions − daily_profits",
        "recent": {
            "withdrawals": await db.withdrawals.find(
                {"status": {"$in": ["approved", "paid"]}, **_range_clause("updated_at")}, {"_id": 0}
            ).sort("updated_at", -1).limit(5).to_list(5),
            "welcome_bonuses": await _recent("bonus"),
            "coupons": await _recent("coupon"),
            "referrals": await _recent("referral"),
            "profits": await _recent("profit"),
        },
    }


@router.get("/admin/stats/payout-projection")
async def admin_payout_projection(request: Request, _admin=Depends(get_current_admin)):
    """Detailed projection of the next 24h payout liability.

    Returns:
      - total: sum of daily_profit_amount for every active investment
      - active_investments: count
      - by_product: breakdown grouped by product (product_name, total, count)
      - top_contributors: top 15 active investments by daily payout amount
    """
    db = request.app.state.db
    active = await db.investments.find({"status": "active"}, {"_id": 0}).to_list(20000)
    total = round(sum(float(i.get("daily_profit_amount", 0)) for i in active), 2)

    by_product = {}
    for inv in active:
        key = inv.get("product_name", "—")
        b = by_product.setdefault(key, {"product_name": key, "total": 0.0, "count": 0, "invested": 0.0})
        b["total"] += float(inv.get("daily_profit_amount", 0))
        b["count"] += 1
        b["invested"] += float(inv.get("amount", 0))
    by_product_list = sorted(by_product.values(), key=lambda x: x["total"], reverse=True)
    for b in by_product_list:
        b["total"] = round(b["total"], 2)
        b["invested"] = round(b["invested"], 2)

    # Top 15 individual contributors
    top = sorted(active, key=lambda i: float(i.get("daily_profit_amount", 0)), reverse=True)[:15]
    for inv in top:
        u = await db.users.find_one({"id": inv["user_id"]}, {"_id": 0, "name": 1, "phone": 1})
        inv["user_name"] = u["name"] if u else "—"
        inv["user_phone"] = u["phone"] if u else "—"

    return {
        "total": total,
        "active_count": len(active),
        "by_product": by_product_list,
        "top_contributors": top,
    }


# ===== Admin Activity Log =====
@router.get("/admin/diagnostics/egress")
async def admin_egress_diagnostics(request: Request, _admin=Depends(get_current_admin)):
    """One-shot diagnostic: reveals the actual outbound IP the server uses,
    both directly and through the configured NOMBA_PROXY_URL.

    Use this to verify that the production deployment is actually routing
    Nomba traffic through Fixie (or whatever proxy you configured).
    """
    import httpx as _httpx
    proxy = os.environ.get("NOMBA_PROXY_URL") or ""
    out = {
        "httpx_version": getattr(_httpx, "__version__", "unknown"),
        "nomba_proxy_url_set": bool(proxy),
        "nomba_proxy_host": proxy.split("@")[-1] if proxy else None,
        "direct_egress_ip": None,
        "proxied_egress_ip": None,
        "direct_error": None,
        "proxied_error": None,
    }
    # 1. Raw outbound IP (what Emergent's prod sees without proxy)
    try:
        async with _httpx.AsyncClient(timeout=10) as c:
            r = await c.get("https://api.ipify.org")
            out["direct_egress_ip"] = r.text.strip()
    except Exception as e:
        out["direct_error"] = f"{type(e).__name__}: {e}"
    # 2. Outbound through configured proxy (what Nomba should see)
    if proxy:
        try:
            async with _httpx.AsyncClient(timeout=15, proxy=proxy) as c:
                r = await c.get("https://api.ipify.org")
                out["proxied_egress_ip"] = r.text.strip()
        except Exception as e:
            out["proxied_error"] = f"{type(e).__name__}: {e}"
    return out


@router.get("/admin/activity")
async def list_admin_activity(
    request: Request,
    action: Optional[str] = None,
    target_type: Optional[str] = None,
    admin_id: Optional[str] = None,
    limit: int = 200,
    _admin=Depends(get_current_admin),
):
    """Return recent admin activity, newest first. Filter by action / target_type / admin_id."""
    db = request.app.state.db
    q = {}
    if action:
        q["action"] = action
    if target_type:
        q["target_type"] = target_type
    if admin_id:
        q["admin_id"] = admin_id
    items = await db.admin_activity.find(q, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 1000))
    # Distinct actions for filter UI
    distinct_actions = await db.admin_activity.distinct("action")
    return {"items": items, "count": len(items), "actions": sorted(distinct_actions)}


# ============================================================================
# In-app Announcements (multi-row pop-ups)
# ============================================================================

def _announce_doc(d: dict) -> dict:
    """Strip Mongo internals and coerce datetimes to ISO for JSON."""
    if not d:
        return d
    out = {k: v for k, v in d.items() if k != "_id"}
    for k in ("starts_at", "ends_at", "created_at", "updated_at"):
        v = out.get(k)
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    return out


@router.get("/admin/announcements")
async def admin_list_announcements(request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    items = await db.announcements.find({}, {"_id": 0}).sort([
        ("priority", -1), ("created_at", -1),
    ]).to_list(500)
    return items


@router.post("/admin/announcements")
async def admin_create_announcement(payload: AnnouncementCreate, request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    if payload.style not in ("info", "success", "warning", "critical"):
        raise HTTPException(400, "Invalid style")
    if payload.cta_type not in ("none", "internal", "external"):
        raise HTTPException(400, "Invalid cta_type")
    if payload.cta_type != "none" and not (payload.cta_label and payload.cta_url):
        raise HTTPException(400, "cta_label and cta_url required when cta_type is set")
    now = _now_iso()
    doc = {
        "id": gen_reference("ann"),
        "title": payload.title.strip(),
        "message": payload.message.strip(),
        "style": payload.style,
        "cta_type": payload.cta_type,
        "cta_label": (payload.cta_label or "").strip() or None,
        "cta_url": (payload.cta_url or "").strip() or None,
        "starts_at": _parse_optional_iso(payload.starts_at),
        "ends_at": _parse_optional_iso(payload.ends_at),
        "hide_from_newcomers_hours": max(0, int(payload.hide_from_newcomers_hours or 0)),
        "reshow_interval_minutes": max(0, int(payload.reshow_interval_minutes or 0)),
        "priority": int(payload.priority or 0),
        "is_active": bool(payload.is_active),
        "created_at": now,
        "updated_at": now,
    }
    await db.announcements.insert_one(doc)
    await _log_admin_activity(
        db, _admin, "announcement.created",
        target_type="announcement", target_id=doc["id"],
        description=f"Created announcement '{doc['title']}'",
        meta={"announcement_id": doc["id"], "style": doc["style"]},
    )
    return _announce_doc(doc)


@router.put("/admin/announcements/{ann_id}")
async def admin_update_announcement(ann_id: str, payload: AnnouncementCreate, request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    if payload.style not in ("info", "success", "warning", "critical"):
        raise HTTPException(400, "Invalid style")
    if payload.cta_type not in ("none", "internal", "external"):
        raise HTTPException(400, "Invalid cta_type")
    update = {
        "title": payload.title.strip(),
        "message": payload.message.strip(),
        "style": payload.style,
        "cta_type": payload.cta_type,
        "cta_label": (payload.cta_label or "").strip() or None,
        "cta_url": (payload.cta_url or "").strip() or None,
        "starts_at": _parse_optional_iso(payload.starts_at),
        "ends_at": _parse_optional_iso(payload.ends_at),
        "hide_from_newcomers_hours": max(0, int(payload.hide_from_newcomers_hours or 0)),
        "reshow_interval_minutes": max(0, int(payload.reshow_interval_minutes or 0)),
        "priority": int(payload.priority or 0),
        "is_active": bool(payload.is_active),
        "updated_at": _now_iso(),
    }
    res = await db.announcements.update_one({"id": ann_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Announcement not found")
    doc = await db.announcements.find_one({"id": ann_id}, {"_id": 0})
    return _announce_doc(doc)


@router.delete("/admin/announcements/{ann_id}")
async def admin_delete_announcement(ann_id: str, request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    res = await db.announcements.delete_one({"id": ann_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Announcement not found")
    await db.announcement_dismissals.delete_many({"announcement_id": ann_id})
    await _log_admin_activity(
        db, _admin, "announcement.deleted",
        target_type="announcement", target_id=ann_id,
        description=f"Deleted announcement {ann_id}",
        meta={"announcement_id": ann_id},
    )
    return {"status": "ok"}

