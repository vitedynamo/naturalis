"""End-to-end backend tests for Naija Invest API.

Covers:
- Auth (register, login, me, change-password) and referral linking (3 generations)
- Profile bank update
- Products, Investments, Deposits (mock mode), Withdrawals (with/without bank)
- Referrals, Coupons, Transactions, Public Settings
- Admin: stats, users (block/unblock/adjust), products CRUD, deposits, withdrawals
  (approve/reject), investments, referrals, coupons CRUD, settings GET/PUT
- 24h payout simulation via direct DB write (motor) and referral commission cascade
- Non-admin cannot access /api/admin/*
"""
import os
import time
import asyncio
import secrets
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://naija-invest-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_PHONE = "08123456789"
ADMIN_PWD = "personally"


def _uniq_phone():
    # 11-digit Nigerian-style phone, unique per run
    return "0807" + str(int(time.time() * 1000))[-7:] + str(secrets.randbelow(100)).zfill(2)


# ---------- Shared state ----------
state = {}


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _post(s, path, json=None, token=None, expect=None):
    h = {"Authorization": f"Bearer {token}"} if token else {}
    r = s.post(f"{API}{path}", json=json, headers=h, timeout=30)
    if expect is not None:
        assert r.status_code == expect, f"POST {path} -> {r.status_code} body={r.text}"
    return r


def _get(s, path, token=None, expect=None, params=None):
    h = {"Authorization": f"Bearer {token}"} if token else {}
    r = s.get(f"{API}{path}", headers=h, params=params, timeout=30)
    if expect is not None:
        assert r.status_code == expect, f"GET {path} -> {r.status_code} body={r.text}"
    return r


def _put(s, path, json=None, token=None, expect=None):
    h = {"Authorization": f"Bearer {token}"} if token else {}
    r = s.put(f"{API}{path}", json=json, headers=h, timeout=30)
    if expect is not None:
        assert r.status_code == expect, f"PUT {path} -> {r.status_code} body={r.text}"
    return r


def _del(s, path, token=None, expect=None):
    h = {"Authorization": f"Bearer {token}"} if token else {}
    r = s.delete(f"{API}{path}", headers=h, timeout=30)
    if expect is not None:
        assert r.status_code == expect, f"DEL {path} -> {r.status_code} body={r.text}"
    return r


# ============== HEALTH ==============
def test_health(s):
    r = _get(s, "/health", expect=200)
    assert r.json()["status"] == "ok"


# ============== ADMIN LOGIN ==============
def test_admin_login(s):
    r = _post(s, "/auth/login", {"phone": ADMIN_PHONE, "password": ADMIN_PWD}, expect=200)
    j = r.json()
    assert "token" in j and j["user"]["is_admin"] is True
    state["admin_token"] = j["token"]


# ============== REGISTRATION (no referral) ==============
def test_register_root_user(s):
    phone = _uniq_phone()
    r = _post(s, "/auth/register", {"phone": phone, "name": "TEST_Root", "password": "Test@1234"}, expect=200)
    j = r.json()
    assert j["user"]["wallet_balance"] == 750.0
    assert j["user"]["referral_code"]
    state["u1"] = {"token": j["token"], "user": j["user"], "phone": phone}


def test_register_duplicate_phone(s):
    phone = state["u1"]["phone"]
    r = _post(s, "/auth/register", {"phone": phone, "name": "Dup", "password": "Test@1234"})
    assert r.status_code == 400


def test_register_with_invalid_referral(s):
    r = _post(s, "/auth/register", {"phone": _uniq_phone(), "name": "X", "password": "Test@1234", "referral_code": "BADCODE"})
    assert r.status_code == 400


# ============== 3-GEN REFERRAL CHAIN ==============
def test_register_three_gen_chain(s):
    # u2 referred by u1, u3 by u2, u4 by u3
    code1 = state["u1"]["user"]["referral_code"]
    p2 = _uniq_phone()
    r = _post(s, "/auth/register", {"phone": p2, "name": "TEST_U2", "password": "Test@1234", "referral_code": code1}, expect=200)
    state["u2"] = r.json()
    code2 = state["u2"]["user"]["referral_code"]

    p3 = _uniq_phone()
    r = _post(s, "/auth/register", {"phone": p3, "name": "TEST_U3", "password": "Test@1234", "referral_code": code2}, expect=200)
    state["u3"] = r.json()
    code3 = state["u3"]["user"]["referral_code"]

    p4 = _uniq_phone()
    r = _post(s, "/auth/register", {"phone": p4, "name": "TEST_U4", "password": "Test@1234", "referral_code": code3}, expect=200)
    state["u4"] = r.json()

    # u1 should have gen1=u2, gen2=u3, gen3=u4
    r = _get(s, "/referrals", token=state["u1"]["token"], expect=200)
    refs = r.json()
    assert refs["gen1"]["count"] == 1
    assert refs["gen2"]["count"] == 1
    assert refs["gen3"]["count"] == 1


# ============== LOGIN & ME ==============
def test_login_valid(s):
    r = _post(s, "/auth/login", {"phone": state["u1"]["phone"], "password": "Test@1234"}, expect=200)
    assert "token" in r.json()


def test_login_invalid(s):
    r = _post(s, "/auth/login", {"phone": state["u1"]["phone"], "password": "WRONG"})
    assert r.status_code == 401


def test_me(s):
    r = _get(s, "/auth/me", token=state["u1"]["token"], expect=200)
    assert r.json()["id"] == state["u1"]["user"]["id"]


# ============== CHANGE PASSWORD ==============
def test_change_password(s):
    tok = state["u1"]["token"]
    r = _post(s, "/auth/change-password", {"old_password": "Test@1234", "new_password": "NewTest@1234"}, token=tok, expect=200)
    # Verify login with new password
    r = _post(s, "/auth/login", {"phone": state["u1"]["phone"], "password": "NewTest@1234"}, expect=200)
    state["u1"]["token"] = r.json()["token"]


# ============== BANK UPDATE ==============
def test_bank_update(s):
    tok = state["u4"]["token"]
    r = _put(s, "/profile/bank", {"bank_name": "GTBank", "account_number": "0123456789", "account_name": "TEST U4"}, token=tok, expect=200)
    assert r.json()["bank_name"] == "GTBank"


# ============== PRODUCTS ==============
def test_list_products(s):
    r = _get(s, "/products", token=state["u4"]["token"], expect=200)
    items = r.json()
    assert isinstance(items, list) and len(items) >= 1
    assert all(p["is_active"] for p in items)
    state["product"] = items[0]


# ============== PUBLIC SETTINGS ==============
def test_public_settings(s):
    r = _get(s, "/settings/public", expect=200)
    j = r.json()
    for k in ("min_deposit", "min_withdrawal", "welcome_bonus", "payment_mode"):
        assert k in j


# ============== DEPOSIT (mock mode) ==============
def test_deposit_init_mock_then_verify_credits(s):
    tok = state["u4"]["token"]
    # initialize
    r = _post(s, "/deposit/initialize", {"amount": 5000}, token=tok, expect=200)
    j = r.json()
    assert j["mode"] == "mock" and j["reference"]
    ref = j["reference"]
    state["dep_ref"] = ref

    # capture balance before verify
    me0 = _get(s, "/auth/me", token=tok, expect=200).json()
    b0 = me0["wallet_balance"]

    # verify
    r = _get(s, f"/deposit/verify/{ref}", token=tok, expect=200)
    j = r.json()
    assert j["status"] == "success"
    assert abs(j["wallet_balance"] - (b0 + 5000)) < 0.01


def test_deposit_init_below_min(s):
    r = _post(s, "/deposit/initialize", {"amount": 100}, token=state["u4"]["token"])
    assert r.status_code == 400


def test_list_deposits(s):
    r = _get(s, "/deposits", token=state["u4"]["token"], expect=200)
    assert any(d["reference"] == state["dep_ref"] for d in r.json())


# ============== INVEST ==============
def test_invest_insufficient(s):
    # u2 only has welcome 750; product min likely 5000
    r = _post(s, "/invest", {"product_id": state["product"]["id"], "amount": 100000}, token=state["u2"]["token"])
    assert r.status_code == 400


def test_invest_success(s):
    tok = state["u4"]["token"]
    prod = state["product"]
    amount = float(prod["price"])
    r = _post(s, "/invest", {"product_id": prod["id"], "amount": amount}, token=tok, expect=200)
    j = r.json()
    assert j["investment"]["amount"] == amount
    state["invest"] = j["investment"]


def test_list_investments(s):
    r = _get(s, "/investments", token=state["u4"]["token"], expect=200)
    assert any(i["id"] == state["invest"]["id"] for i in r.json())


# ============== WITHDRAWAL ==============
def test_withdrawal_without_bank(s):
    # u2 has no bank set
    r = _post(s, "/withdrawal/request", {"amount": 500, "method": "manual"}, token=state["u2"]["token"])
    # could fail on min (500<1000) - try with 1000
    r = _post(s, "/withdrawal/request", {"amount": 1000, "method": "manual"}, token=state["u2"]["token"])
    assert r.status_code == 400  # no bank or insufficient


def test_withdrawal_with_bank(s):
    tok = state["u4"]["token"]
    # ensure balance enough; deposit again
    rr = _post(s, "/deposit/initialize", {"amount": 5000}, token=tok, expect=200).json()
    _get(s, f"/deposit/verify/{rr['reference']}", token=tok, expect=200)
    r = _post(s, "/withdrawal/request", {"amount": 1500, "method": "manual"}, token=tok, expect=200)
    j = r.json()
    assert j["status"] == "pending" and j["amount"] == 1500
    state["wid"] = j["id"]


def test_list_withdrawals(s):
    r = _get(s, "/withdrawals", token=state["u4"]["token"], expect=200)
    assert any(w["id"] == state["wid"] for w in r.json())


# ============== COUPONS (admin create then user redeem) ==============
def test_admin_create_coupon(s):
    code = "TEST" + secrets.token_hex(3).upper()
    r = _post(s, "/admin/coupons", {"code": code, "amount": 250, "max_uses": 5, "is_active": True},
              token=state["admin_token"], expect=200)
    state["coupon_code"] = code
    state["coupon_id"] = r.json()["id"]


def test_user_redeem_coupon(s):
    tok = state["u4"]["token"]
    r = _post(s, "/coupons/redeem", {"code": state["coupon_code"]}, token=tok, expect=200)
    assert r.json()["amount"] == 250


def test_user_redeem_coupon_duplicate(s):
    r = _post(s, "/coupons/redeem", {"code": state["coupon_code"]}, token=state["u4"]["token"])
    assert r.status_code == 400


# ============== TRANSACTIONS ==============
def test_transactions_no_filter(s):
    r = _get(s, "/transactions", token=state["u4"]["token"], expect=200)
    assert isinstance(r.json(), list) and len(r.json()) > 0


def test_transactions_filter_deposit(s):
    r = _get(s, "/transactions", token=state["u4"]["token"], params={"ttype": "deposit"}, expect=200)
    assert all(t["type"] == "deposit" for t in r.json())


# ============== REFERRALS ==============
def test_referrals_payload(s):
    r = _get(s, "/referrals", token=state["u1"]["token"], expect=200)
    j = r.json()
    assert "referral_code" in j and "gen1" in j and "gen2" in j and "gen3" in j


# ============== ADMIN: STATS/USERS/PRODUCTS ==============
def test_admin_stats(s):
    r = _get(s, "/admin/stats", token=state["admin_token"], expect=200)
    j = r.json()
    for k in ("users", "active_investments", "total_deposits", "total_withdrawn", "total_invested",
              "pending_withdrawals", "pending_deposits"):
        assert k in j


def test_admin_users_block_unblock_adjust(s):
    tok = state["admin_token"]
    uid = state["u2"]["user"]["id"]
    _post(s, f"/admin/users/{uid}/block", token=tok, expect=200)
    # blocked user should now get 403 on /auth/me
    r = _get(s, "/auth/me", token=state["u2"]["token"])
    assert r.status_code == 403
    _post(s, f"/admin/users/{uid}/unblock", token=tok, expect=200)
    # adjust +500
    r = _post(s, f"/admin/users/{uid}/adjust", {"amount": 500, "note": "TEST bonus"}, token=tok, expect=200)
    assert r.json()["wallet_balance"] >= 500


def test_admin_products_crud(s):
    tok = state["admin_token"]
    # Create
    r = _post(s, "/admin/products", {
        "name": "TEST_PROD", "description": "x", "image_url": "", "price": 1000,
        "daily_profit_percent": 3, "duration_days": 10, "min_amount": 1000, "max_amount": 0, "is_active": True,
    }, token=tok, expect=200)
    pid = r.json()["id"]
    # Update
    r = _put(s, f"/admin/products/{pid}", {
        "name": "TEST_PROD2", "description": "y", "image_url": "", "price": 1500,
        "daily_profit_percent": 4, "duration_days": 12, "min_amount": 1500, "max_amount": 0, "is_active": True,
    }, token=tok, expect=200)
    assert r.json()["name"] == "TEST_PROD2"
    # Delete
    _del(s, f"/admin/products/{pid}", token=tok, expect=200)


def test_admin_deposits_list_and_approve(s):
    tok = state["admin_token"]
    # create a pending deposit then approve (don't verify)
    u_tok = state["u4"]["token"]
    r = _post(s, "/deposit/initialize", {"amount": 3000}, token=u_tok, expect=200).json()
    # find admin deposit id
    deps = _get(s, "/admin/deposits", token=tok, expect=200).json()
    dep = next(d for d in deps if d["reference"] == r["reference"])
    _post(s, f"/admin/deposits/{dep['id']}/approve", token=tok, expect=200)


def test_admin_withdrawals_reject_refunds(s):
    tok = state["admin_token"]
    # find the pending withdrawal we created
    items = _get(s, "/admin/withdrawals", token=tok, expect=200).json()
    target = next((w for w in items if w["id"] == state["wid"]), None)
    assert target is not None
    # capture user balance
    me0 = _get(s, "/auth/me", token=state["u4"]["token"]).json()
    r = _post(s, f"/admin/withdrawals/{state['wid']}/reject", {"note": "TEST reject"}, token=tok, expect=200)
    me1 = _get(s, "/auth/me", token=state["u4"]["token"]).json()
    assert me1["wallet_balance"] >= me0["wallet_balance"] + target["amount"] - 0.01


def test_admin_investments_referrals_coupons_list(s):
    tok = state["admin_token"]
    _get(s, "/admin/investments", token=tok, expect=200)
    _get(s, "/admin/referrals", token=tok, expect=200)
    _get(s, "/admin/coupons", token=tok, expect=200)


def test_admin_delete_coupon(s):
    _del(s, f"/admin/coupons/{state['coupon_id']}", token=state["admin_token"], expect=200)


def test_admin_settings_get_put(s):
    tok = state["admin_token"]
    r = _get(s, "/admin/settings", token=tok, expect=200)
    cur = r.json()
    # PUT roundtrip - just toggle min_deposit then revert
    new_min = float(cur.get("min_deposit", 3000))
    r = _put(s, "/admin/settings", {"min_deposit": new_min}, token=tok, expect=200)
    assert r.json()["min_deposit"] == new_min


# ============== NON-ADMIN CANNOT HIT ADMIN ==============
def test_non_admin_forbidden(s):
    r = _get(s, "/admin/stats", token=state["u4"]["token"])
    assert r.status_code == 403


# ============== 24H PAYOUT SIMULATION ==============
def test_payout_simulation_and_referral_cascade():
    """Use motor to push last_payout_at back >24h on u4's investment, hit /auth/me,
    verify profit credited and 3-gen referral commissions cascaded to u3, u2, u1."""
    from motor.motor_asyncio import AsyncIOMotorClient
    from datetime import datetime, timezone, timedelta

    async def run():
        mongo_url = "mongodb://localhost:27017"
        db_name = "test_database"
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]

        inv = state["invest"]
        # set last_payout_at to 25h ago
        past = (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat()
        await db.investments.update_one({"id": inv["id"]}, {"$set": {"last_payout_at": past}})

        # capture balances before
        u1 = await db.users.find_one({"id": state["u1"]["user"]["id"]}, {"_id": 0})
        u2 = await db.users.find_one({"id": state["u2"]["user"]["id"]}, {"_id": 0})
        u3 = await db.users.find_one({"id": state["u3"]["user"]["id"]}, {"_id": 0})
        u4 = await db.users.find_one({"id": state["u4"]["user"]["id"]}, {"_id": 0})
        client.close()
        return {
            "u1": u1["wallet_balance"], "u2": u2["wallet_balance"],
            "u3": u3["wallet_balance"], "u4": u4["wallet_balance"],
            "daily": inv["daily_profit_amount"],
        }

    loop = asyncio.new_event_loop()
    before = loop.run_until_complete(run())
    loop.close()

    # Trigger payout processor via /auth/me as u4
    sess = requests.Session()
    me = sess.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {state['u4']['token']}"}, timeout=30)
    assert me.status_code == 200

    async def after_run():
        from motor.motor_asyncio import AsyncIOMotorClient as C
        client = C("mongodb://localhost:27017")
        db = client["test_database"]
        u1 = await db.users.find_one({"id": state["u1"]["user"]["id"]}, {"_id": 0})
        u2 = await db.users.find_one({"id": state["u2"]["user"]["id"]}, {"_id": 0})
        u3 = await db.users.find_one({"id": state["u3"]["user"]["id"]}, {"_id": 0})
        u4 = await db.users.find_one({"id": state["u4"]["user"]["id"]}, {"_id": 0})
        client.close()
        return {"u1": u1["wallet_balance"], "u2": u2["wallet_balance"], "u3": u3["wallet_balance"], "u4": u4["wallet_balance"]}

    after = asyncio.new_event_loop().run_until_complete(after_run())

    daily = before["daily"]
    # u4 should be credited the profit (>= before + daily)
    assert after["u4"] >= before["u4"] + daily - 0.5, f"u4 not credited profit: {before} -> {after}"
    # u3 gen1 10% of profit
    assert after["u3"] >= before["u3"] + (daily * 0.10) - 0.5, f"u3 gen1 not credited: {before} -> {after}"
    # u2 gen2 5%
    assert after["u2"] >= before["u2"] + (daily * 0.05) - 0.5, f"u2 gen2 not credited: {before} -> {after}"
    # u1 gen3 2%
    assert after["u1"] >= before["u1"] + (daily * 0.02) - 0.5, f"u1 gen3 not credited: {before} -> {after}"
