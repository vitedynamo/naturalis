"""
Iteration 11 backend tests:
- GET /api/admin/deposits/by-day (valid, invalid date, empty day)
- Regression: /api/admin/stats/extended, /api/admin/stats/inflow, /api/admin/transactions, /api/admin/withdrawals
- pay-nomba route still mounted (we hit a bogus wid -> expect 404, NOT 405/500)
"""
import os
import datetime as dt
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = BASE_URL + "/api"

ADMIN_PHONE = "08123456789"
ADMIN_PASS = "personally"


# ------------ fixtures ------------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"phone": ADMIN_PHONE, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in response: {r.text}"
    return tok


@pytest.fixture(scope="module")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


# ------------ tests: deposits/by-day ------------
class TestDepositsByDay:
    def test_valid_date_today(self, admin_client):
        today = dt.date.today().isoformat()
        r = admin_client.get(f"{API}/admin/deposits/by-day", params={"date": today}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["date", "total", "count", "deposits"]:
            assert k in d, f"missing key {k}"
        assert d["date"] == today
        assert isinstance(d["deposits"], list)
        assert isinstance(d["total"], (int, float))
        assert isinstance(d["count"], int)
        assert d["count"] == len(d["deposits"])
        # If non-empty, each deposit must carry user_name + user_phone enrichment
        for dep in d["deposits"]:
            for k in ["id", "user_id", "user_name", "user_phone", "amount", "reference", "method", "status", "created_at", "updated_at"]:
                assert k in dep, f"deposit missing {k}: {dep}"

    def test_invalid_date_returns_400(self, admin_client):
        r = admin_client.get(f"{API}/admin/deposits/by-day", params={"date": "invalid"}, timeout=15)
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"

    def test_empty_day_returns_zero(self, admin_client):
        r = admin_client.get(f"{API}/admin/deposits/by-day", params={"date": "1999-01-01"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["count"] == 0
        assert d["deposits"] == []
        assert d["total"] == 0

    def test_requires_auth(self):
        r = requests.get(f"{API}/admin/deposits/by-day", params={"date": "2026-05-21"}, timeout=15)
        assert r.status_code in (401, 403)


# ------------ tests: regression ------------
class TestAdminRegression:
    @pytest.mark.parametrize("path", [
        "/admin/stats/extended",
        "/admin/stats/inflow",
        "/admin/transactions",
        "/admin/withdrawals",
        "/admin/deposits",
        "/admin/users",
    ])
    def test_existing_endpoints_200(self, admin_client, path):
        r = admin_client.get(API + path, timeout=15)
        assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text[:200]}"

    def test_pay_nomba_route_present(self, admin_client):
        # Should respond with 404 (withdrawal not found) — proves route exists & POST is allowed
        r = admin_client.post(
            f"{API}/admin/withdrawals/__nonexistent__/pay-nomba",
            json={"bank_code": "044", "reason": "iter11 smoke"},
            timeout=15,
        )
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text[:200]}"


# ------------ tests: inflow zero-fill (new in iter11) ------------
class TestInflowZeroFill:
    def test_series_is_zero_filled(self, admin_client):
        # 7-day default window — series should have exactly 7 entries (one per day)
        r = admin_client.get(f"{API}/admin/stats/inflow", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert len(d["series"]) == 7, f"expected 7-entry zero-filled series, got {len(d['series'])}"
        dates = [pt["date"] for pt in d["series"]]
        assert dates == sorted(dates), "series should be chronologically sorted"
