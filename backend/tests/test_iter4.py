"""Iteration 4 backend tests.
Tests:
- register all-or-none security questions + same-question rejection
- /admin/banks list
- /admin/withdrawals/{id}/pay-paystack (mock)
- /admin/settings featured_product_id + home_announcement persistence and /settings/public exposure
- Smoke checks for products / invest / deposit init+verify / withdrawal/request
"""
import os
import random
import time
import requests
import pytest

def _load_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not found")


BASE = _load_url()
API = f"{BASE}/api"

ADMIN_PHONE = "08123456789"
ADMIN_PWD = "personally"


def _rand_phone():
    return "070" + "".join(str(random.randint(0, 9)) for _ in range(8))


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"phone": ADMIN_PHONE, "password": ADMIN_PWD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_hdr(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- register hardening ----------
class TestRegisterSecurityQuestionsHardening:
    def test_only_q1_a1_returns_400(self):
        body = {
            "phone": _rand_phone(),
            "name": "TEST_OnlyQ1",
            "password": "abcd",
            "security_question_1": "Q1?",
            "security_answer_1": "ans1",
        }
        r = requests.post(f"{API}/auth/register", json=body, timeout=15)
        assert r.status_code == 400, r.text
        assert "both" in r.json().get("detail", "").lower()

    def test_only_q2_a2_returns_400(self):
        body = {
            "phone": _rand_phone(),
            "name": "TEST_OnlyQ2",
            "password": "abcd",
            "security_question_2": "Q2?",
            "security_answer_2": "ans2",
        }
        r = requests.post(f"{API}/auth/register", json=body, timeout=15)
        assert r.status_code == 400, r.text

    def test_same_question_returns_400(self):
        body = {
            "phone": _rand_phone(),
            "name": "TEST_SameQ",
            "password": "abcd",
            "security_question_1": "Favorite color?",
            "security_answer_1": "red",
            "security_question_2": "Favorite color?",
            "security_answer_2": "blue",
        }
        r = requests.post(f"{API}/auth/register", json=body, timeout=15)
        assert r.status_code == 400, r.text
        assert "different" in r.json().get("detail", "").lower()

    def test_no_security_fields_succeeds(self):
        body = {"phone": _rand_phone(), "name": "TEST_NoSQ", "password": "abcd"}
        r = requests.post(f"{API}/auth/register", json=body, timeout=15)
        assert r.status_code == 200, r.text
        assert "token" in r.json()

    def test_all_four_distinct_succeeds(self):
        body = {
            "phone": _rand_phone(),
            "name": "TEST_AllSQ",
            "password": "abcd",
            "security_question_1": "Mother's maiden?",
            "security_answer_1": "Smith",
            "security_question_2": "First pet?",
            "security_answer_2": "Rex",
        }
        r = requests.post(f"{API}/auth/register", json=body, timeout=15)
        assert r.status_code == 200, r.text


# ---------- admin/banks ----------
class TestAdminBanks:
    def test_banks_admin_ok(self, admin_hdr):
        r = requests.get(f"{API}/admin/banks", headers=admin_hdr, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 10
        for b in items[:3]:
            assert "name" in b and "code" in b

    def test_banks_no_auth_401(self):
        r = requests.get(f"{API}/admin/banks", timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_banks_user_403(self):
        # create a regular user and check
        phone = _rand_phone()
        requests.post(f"{API}/auth/register", json={"phone": phone, "name": "TEST_RegU", "password": "abcd"}, timeout=15)
        tok = requests.post(f"{API}/auth/login", json={"phone": phone, "password": "abcd"}, timeout=15).json()["token"]
        r = requests.get(f"{API}/admin/banks", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code in (401, 403), r.text


# ---------- settings persistence ----------
class TestSettingsFeaturedAndAnnouncement:
    def test_put_and_get_settings(self, admin_hdr):
        # Get a real product id
        prods = requests.get(f"{API}/admin/products", headers=admin_hdr, timeout=15).json()
        assert isinstance(prods, list) and len(prods) > 0
        pid = prods[0]["id"]
        # Set
        body = {
            "featured_product_id": pid,
            "home_announcement": "TEST iter4 announcement",
            "home_announcement_active": True,
        }
        r = requests.put(f"{API}/admin/settings", json=body, headers=admin_hdr, timeout=15)
        assert r.status_code == 200, r.text
        s = r.json()
        assert s.get("featured_product_id") == pid
        assert s.get("home_announcement") == "TEST iter4 announcement"
        assert s.get("home_announcement_active") is True
        # Public
        pub = requests.get(f"{API}/settings/public", timeout=15).json()
        assert pub.get("featured_product_id") == pid
        assert pub.get("home_announcement") == "TEST iter4 announcement"
        assert pub.get("home_announcement_active") is True

    def test_turn_off_announcement(self, admin_hdr):
        body = {"home_announcement_active": False}
        r = requests.put(f"{API}/admin/settings", json=body, headers=admin_hdr, timeout=15)
        assert r.status_code == 200
        pub = requests.get(f"{API}/settings/public", timeout=15).json()
        assert pub.get("home_announcement_active") is False


# ---------- pay-paystack mock ----------
def _create_user_with_balance_and_bank(admin_hdr, balance=5000):
    phone = _rand_phone()
    r = requests.post(f"{API}/auth/register", json={"phone": phone, "name": "TEST_Pay", "password": "abcd"}, timeout=15)
    uid = r.json()["user"]["id"]
    tok = r.json()["token"]
    # adjust balance
    requests.post(f"{API}/admin/users/{uid}/adjust",
                  json={"amount": balance, "note": "TEST seed"},
                  headers=admin_hdr, timeout=15)
    # set bank
    requests.put(f"{API}/profile/bank",
                 json={"bank_name": "Access Bank", "account_number": "0123456789", "account_name": "TEST User"},
                 headers={"Authorization": f"Bearer {tok}"}, timeout=15)
    return uid, tok


def _create_pending_withdrawal(admin_hdr, amount=2000):
    uid, tok = _create_user_with_balance_and_bank(admin_hdr, balance=amount + 1000)
    r = requests.post(f"{API}/withdrawal/request",
                      json={"amount": amount, "method": "manual"},
                      headers={"Authorization": f"Bearer {tok}"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["id"]


class TestPayPaystack:
    def test_pay_mock_success(self, admin_hdr):
        wid = _create_pending_withdrawal(admin_hdr)
        r = requests.post(f"{API}/admin/withdrawals/{wid}/pay-paystack",
                          json={"bank_code": "044", "reason": "TEST mock"},
                          headers=admin_hdr, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("status") == "ok"
        assert data.get("mode") == "mock"
        assert data.get("reference", "").startswith("ptr_")
        # Confirm state via list
        wlist = requests.get(f"{API}/admin/withdrawals", headers=admin_hdr, timeout=15).json()
        match = [w for w in wlist if w["id"] == wid]
        assert match and match[0]["status"] == "paid"
        assert match[0]["method"] == "auto"
        assert match[0].get("paystack_transfer_ref")

    def test_already_paid_returns_400(self, admin_hdr):
        wid = _create_pending_withdrawal(admin_hdr)
        # pay once
        r1 = requests.post(f"{API}/admin/withdrawals/{wid}/pay-paystack",
                           json={"bank_code": "044"}, headers=admin_hdr, timeout=20)
        assert r1.status_code == 200
        # pay again
        r2 = requests.post(f"{API}/admin/withdrawals/{wid}/pay-paystack",
                           json={"bank_code": "044"}, headers=admin_hdr, timeout=20)
        assert r2.status_code == 400, r2.text

    def test_missing_id_404(self, admin_hdr):
        r = requests.post(f"{API}/admin/withdrawals/does-not-exist/pay-paystack",
                          json={"bank_code": "044"}, headers=admin_hdr, timeout=15)
        assert r.status_code == 404

    def test_missing_bank_code_422(self, admin_hdr):
        wid = _create_pending_withdrawal(admin_hdr)
        r = requests.post(f"{API}/admin/withdrawals/{wid}/pay-paystack",
                          json={}, headers=admin_hdr, timeout=15)
        assert r.status_code in (400, 422), r.text


# ---------- smoke ----------
class TestSmoke:
    def test_settings_public(self):
        r = requests.get(f"{API}/settings/public", timeout=15)
        assert r.status_code == 200
        for k in ("min_deposit", "min_withdrawal", "welcome_bonus", "featured_product_id",
                  "home_announcement", "home_announcement_active"):
            assert k in r.json(), f"missing {k}"

    def test_products_and_invest_and_deposit(self, admin_hdr):
        # create user with balance
        uid, tok = _create_user_with_balance_and_bank(admin_hdr, balance=20000)
        uh = {"Authorization": f"Bearer {tok}"}
        prods = requests.get(f"{API}/products", headers=uh, timeout=15).json()
        assert len(prods) > 0
        # invest min into cheapest
        p = sorted(prods, key=lambda x: x["price"])[0]
        amt = max(p.get("min_amount", p["price"]), p["price"])
        if amt > 20000:
            pytest.skip("Cheapest product too expensive")
        ri = requests.post(f"{API}/invest", json={"product_id": p["id"], "amount": amt},
                           headers=uh, timeout=15)
        assert ri.status_code == 200, ri.text
        # deposit init+verify mock
        rd = requests.post(f"{API}/deposit/initialize", json={"amount": 5000}, headers=uh, timeout=15)
        assert rd.status_code == 200
        ref = rd.json()["reference"]
        rv = requests.get(f"{API}/deposit/verify/{ref}", headers=uh, timeout=15)
        assert rv.status_code == 200
        assert rv.json()["status"] == "success"
