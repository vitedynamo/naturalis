"""Iteration 4.1 targeted backend retest.

Focus: PUT /api/admin/settings featured_product_id clearing semantics.
- Setting featured_product_id="" must clear to None and /settings/public must return null.
- Setting featured_product_id=null (explicit None) must also clear it.
"""
import os
import requests
import pytest


def _load_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not found")


BASE = _load_url()
API = f"{BASE}/api"

ADMIN_PHONE = "08123456789"
ADMIN_PWD = "personally"


@pytest.fixture(scope="module")
def admin_hdr():
    r = requests.post(f"{API}/auth/login", json={"phone": ADMIN_PHONE, "password": ADMIN_PWD}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def a_product_id(admin_hdr):
    prods = requests.get(f"{API}/admin/products", headers=admin_hdr, timeout=15).json()
    assert isinstance(prods, list) and len(prods) > 0
    return prods[0]["id"]


class TestFeaturedProductIdClearing:
    def test_set_then_clear_with_empty_string(self, admin_hdr, a_product_id):
        # 1) Set featured_product_id to a real id
        r1 = requests.put(
            f"{API}/admin/settings",
            json={"featured_product_id": a_product_id},
            headers=admin_hdr,
            timeout=15,
        )
        assert r1.status_code == 200, r1.text
        assert r1.json().get("featured_product_id") == a_product_id

        # Verify via /settings/public
        pub1 = requests.get(f"{API}/settings/public", timeout=15).json()
        assert pub1.get("featured_product_id") == a_product_id

        # 2) Clear with empty string
        r2 = requests.put(
            f"{API}/admin/settings",
            json={"featured_product_id": ""},
            headers=admin_hdr,
            timeout=15,
        )
        assert r2.status_code == 200, r2.text
        assert r2.json().get("featured_product_id") is None, r2.json()

        # Verify cleared via /settings/public
        pub2 = requests.get(f"{API}/settings/public", timeout=15).json()
        assert pub2.get("featured_product_id") is None, pub2

    def test_set_then_clear_with_null(self, admin_hdr, a_product_id):
        # 1) Set
        r1 = requests.put(
            f"{API}/admin/settings",
            json={"featured_product_id": a_product_id},
            headers=admin_hdr,
            timeout=15,
        )
        assert r1.status_code == 200, r1.text
        assert r1.json().get("featured_product_id") == a_product_id

        # 2) Clear with explicit null
        r2 = requests.put(
            f"{API}/admin/settings",
            json={"featured_product_id": None},
            headers=admin_hdr,
            timeout=15,
        )
        assert r2.status_code == 200, r2.text
        # Either None in response or absent — both acceptable, but featured cleared in public:
        pub2 = requests.get(f"{API}/settings/public", timeout=15).json()
        assert pub2.get("featured_product_id") is None, pub2


# ---------- Smoke subset of iter4: keep these stable ----------

import random


def _rand_phone():
    return "070" + "".join(str(random.randint(0, 9)) for _ in range(8))


class TestSmokeSubset:
    def test_security_questions_only_q1(self):
        body = {
            "phone": _rand_phone(),
            "name": "TEST41_OnlyQ1",
            "password": "abcd",
            "security_question_1": "Q1?",
            "security_answer_1": "ans1",
        }
        r = requests.post(f"{API}/auth/register", json=body, timeout=15)
        assert r.status_code == 400, r.text

    def test_security_questions_same(self):
        body = {
            "phone": _rand_phone(),
            "name": "TEST41_SameQ",
            "password": "abcd",
            "security_question_1": "Same?",
            "security_answer_1": "a",
            "security_question_2": "Same?",
            "security_answer_2": "b",
        }
        r = requests.post(f"{API}/auth/register", json=body, timeout=15)
        assert r.status_code == 400, r.text

    def test_admin_banks_ok(self, admin_hdr):
        r = requests.get(f"{API}/admin/banks", headers=admin_hdr, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and len(items) >= 10

    def test_pay_paystack_happy_path(self, admin_hdr):
        # create user with balance + bank, create pending withdrawal, pay
        phone = _rand_phone()
        reg = requests.post(
            f"{API}/auth/register",
            json={"phone": phone, "name": "TEST41_Pay", "password": "abcd"},
            timeout=15,
        ).json()
        uid, tok = reg["user"]["id"], reg["token"]
        requests.post(
            f"{API}/admin/users/{uid}/adjust",
            json={"amount": 5000, "note": "TEST41 seed"},
            headers=admin_hdr,
            timeout=15,
        )
        requests.put(
            f"{API}/profile/bank",
            json={"bank_name": "Access Bank", "account_number": "0123456789", "account_name": "T"},
            headers={"Authorization": f"Bearer {tok}"},
            timeout=15,
        )
        rw = requests.post(
            f"{API}/withdrawal/request",
            json={"amount": 2000, "method": "manual"},
            headers={"Authorization": f"Bearer {tok}"},
            timeout=15,
        )
        assert rw.status_code == 200, rw.text
        wid = rw.json()["id"]
        rp = requests.post(
            f"{API}/admin/withdrawals/{wid}/pay-paystack",
            json={"bank_code": "044"},
            headers=admin_hdr,
            timeout=20,
        )
        assert rp.status_code == 200, rp.text
        data = rp.json()
        assert data.get("status") == "ok"
        assert data.get("mode") == "mock"
        assert data.get("reference", "").startswith("ptr_")
