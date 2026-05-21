"""Iteration 8 tests:
- welcome_bonus persists via PUT/GET /admin/settings, applied to new registrations
- gen3_percent field removed from Settings model — admin GET/PUT must not include it
- Regression smoke: login, products, invest, investments, referrals (gen1+gen2 keys)
"""
import os
import random
import time
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE}/api"
ADMIN_PHONE = "08123456789"
ADMIN_PASS = "personally"

assert BASE, "REACT_APP_BACKEND_URL not set"


def _post(p, **kw): return requests.post(f"{API}{p}", timeout=30, **kw)
def _get(p, **kw): return requests.get(f"{API}{p}", timeout=30, **kw)
def _put(p, **kw): return requests.put(f"{API}{p}", timeout=30, **kw)


_SEEN = set()
def _rand_phone():
    while True:
        p = "080" + str(random.randint(10000000, 99999999))
        if p not in _SEEN and len(p) == 11:
            _SEEN.add(p)
            return p


def _register(phone, password="testpass", referral_code=None):
    body = {"phone": phone, "password": password, "name": f"TEST8_{phone[-4:]}"}
    if referral_code:
        body["referral_code"] = referral_code
    return _post("/auth/register", json=body)


@pytest.fixture(scope="module")
def admin_headers():
    r = _post("/auth/login", json={"phone": ADMIN_PHONE, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module", autouse=True)
def restore_welcome_bonus(admin_headers):
    """Always restore welcome_bonus to 750 after this module finishes."""
    yield
    _put("/admin/settings", headers=admin_headers, json={"welcome_bonus": 750})


class TestWelcomeBonusPersistence:
    def test_put_get_welcome_bonus(self, admin_headers):
        # Set to 900
        r = _put("/admin/settings", headers=admin_headers, json={"welcome_bonus": 900})
        assert r.status_code == 200, r.text
        assert float(r.json().get("welcome_bonus", 0)) == 900.0
        # Read back
        r2 = _get("/admin/settings", headers=admin_headers)
        assert r2.status_code == 200
        assert float(r2.json().get("welcome_bonus", 0)) == 900.0

    def test_new_user_gets_welcome_bonus_900(self, admin_headers):
        # Ensure setting is 900
        _put("/admin/settings", headers=admin_headers, json={"welcome_bonus": 900})
        # Register a fresh user
        phone = _rand_phone()
        r = _register(phone)
        assert r.status_code == 200, r.text
        user = r.json()["user"]
        assert float(user["wallet_balance"]) == 900.0, f"Expected 900, got {user['wallet_balance']}"

    def test_restore_750_and_new_user(self, admin_headers):
        # Set back to 750
        r = _put("/admin/settings", headers=admin_headers, json={"welcome_bonus": 750})
        assert r.status_code == 200
        assert float(r.json().get("welcome_bonus", 0)) == 750.0
        phone = _rand_phone()
        r = _register(phone)
        assert r.status_code == 200, r.text
        assert float(r.json()["user"]["wallet_balance"]) == 750.0


class TestGen3Removed:
    def test_admin_settings_no_gen3(self, admin_headers):
        r = _get("/admin/settings", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert "gen1_percent" in d, "gen1_percent should exist"
        assert "gen2_percent" in d, "gen2_percent should exist"
        assert "gen3_percent" not in d, f"gen3_percent should be removed; keys={list(d.keys())}"

    def test_put_gen3_silently_ignored(self, admin_headers):
        # Try sending gen3_percent — pydantic extra='ignore' should drop it
        r = _put("/admin/settings", headers=admin_headers,
                 json={"gen3_percent": 3.0, "gen1_percent": 10.0, "gen2_percent": 5.0})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "gen3_percent" not in d, f"PUT echoed gen3_percent: {d}"

    def test_public_settings_no_gen3(self):
        r = _get("/settings/public")
        assert r.status_code == 200
        d = r.json()
        assert "gen3_percent" not in d
        assert "gen1_percent" in d and "gen2_percent" in d


class TestRegressionSmoke:
    @pytest.fixture(scope="class")
    def user_ctx(self):
        phone = _rand_phone()
        r = _register(phone)
        assert r.status_code == 200, r.text
        return {"token": r.json()["token"], "uid": r.json()["user"]["id"], "phone": phone}

    def test_admin_login(self):
        r = _post("/auth/login", json={"phone": ADMIN_PHONE, "password": ADMIN_PASS})
        assert r.status_code == 200

    def test_user_login(self, user_ctx):
        # Login with the freshly registered user
        r = _post("/auth/login", json={"phone": user_ctx["phone"], "password": "testpass"})
        assert r.status_code == 200

    def test_products_list(self, user_ctx):
        h = {"Authorization": f"Bearer {user_ctx['token']}"}
        r = _get("/products", headers=h)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_invest_flow(self, user_ctx):
        h = {"Authorization": f"Bearer {user_ctx['token']}"}
        # Top up wallet to ensure investable
        init = _post("/deposit/initialize", headers=h, json={"amount": 50000})
        assert init.status_code == 200
        ref = init.json()["reference"]
        ver = _get(f"/deposit/verify/{ref}", headers=h)
        assert ver.status_code == 200
        # Pick cheapest product
        prods = _get("/products", headers=h).json()
        if not prods:
            pytest.skip("no products")
        p = sorted(prods, key=lambda x: x.get("price", 0))[0]
        amount = max(p.get("min_amount", 0), p.get("price", 0))
        r = _post("/invest", headers=h, json={"product_id": p["id"], "amount": amount})
        assert r.status_code == 200, r.text
        inv = r.json().get("investment", {})
        assert inv.get("id"), r.text
        assert inv.get("product_id") == p["id"]
        # Verify in /investments
        r2 = _get("/investments", headers=h)
        assert r2.status_code == 200
        assert any(i.get("id") == inv["id"] for i in r2.json()), "newly created investment missing from /investments"

    def test_referrals_keys(self, user_ctx):
        h = {"Authorization": f"Bearer {user_ctx['token']}"}
        r = _get("/referrals", headers=h)
        assert r.status_code == 200
        d = r.json()
        assert "gen1" in d and "gen2" in d
        assert "gen3" not in d, f"gen3 leaked: {list(d.keys())}"
        # percent values from settings
        assert "percent" in d["gen1"] and "percent" in d["gen2"]
