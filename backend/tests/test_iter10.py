"""
Iteration 10 backend tests:
- GET /api/admin/stats/extended structure
- GET /api/admin/stats/inflow default + custom range
- Auth gating
- Regression smoke for existing admin endpoints
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


# ------------ tests: extended stats ------------
class TestExtendedStats:
    def test_extended_stats_structure(self, admin_client):
        r = admin_client.get(f"{API}/admin/stats/extended", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()

        for k in [
            "platform_profit", "next_24h_payout", "users", "online",
            "total_deposits", "active_investments", "pending_withdrawals",
            "today", "all_time", "system_health",
        ]:
            assert k in d, f"missing key: {k}"

        assert isinstance(d["platform_profit"], (int, float))
        assert isinstance(d["next_24h_payout"], (int, float))

        today = d["today"]
        for k in ["deposits", "deposits_count", "paid_out", "paid_out_count", "net_inflow", "pending_now"]:
            assert k in today, f"today missing {k}"

        all_time = d["all_time"]
        for k in [
            "total_paid_out", "paid_withdrawals_count", "total_fees",
            "awaiting_verification", "total_investments", "total_invested_amount",
            "total_bonuses", "total_referral_paid", "total_profit_paid",
        ]:
            assert k in all_time, f"all_time missing {k}"

        sh = d["system_health"]
        for k in ["fraud_attempts", "amount_mismatches"]:
            assert k in sh, f"system_health missing {k}"

    def test_extended_stats_requires_auth(self):
        r = requests.get(f"{API}/admin/stats/extended", timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"


# ------------ tests: inflow ------------
class TestInflow:
    def test_inflow_default_last7(self, admin_client):
        r = admin_client.get(f"{API}/admin/stats/inflow", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["total", "count", "avg", "peak", "series", "gateways"]:
            assert k in d, f"missing {k}"
        assert isinstance(d["series"], list)
        # series only includes days with deposits (no zero-fill)
        for pt in d["series"]:
            assert "date" in pt and "total" in pt
        for gw in d["gateways"]:
            assert "name" in gw and "total" in gw and "count" in gw
        peak = d["peak"]
        assert "date" in peak and "total" in peak

    def test_inflow_custom_range(self, admin_client):
        r = admin_client.get(f"{API}/admin/stats/inflow", params={"frm": "2026-01-01", "to": "2026-01-31"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # Range is honored; window total/series reflect that range (may be empty)
        assert d["from"] == "2026-01-01"
        assert d["to"] == "2026-01-31"
        assert isinstance(d["series"], list)

    def test_inflow_requires_auth(self):
        r = requests.get(f"{API}/admin/stats/inflow", timeout=15)
        assert r.status_code in (401, 403)


# ------------ regression smoke ------------
class TestAdminRegression:
    @pytest.mark.parametrize("path", [
        "/admin/stats",
        "/admin/users",
        "/admin/products",
        "/admin/deposits",
        "/admin/withdrawals",
        "/admin/transactions",
    ])
    def test_existing_endpoints_200(self, admin_client, path):
        r = admin_client.get(API + path, timeout=15)
        assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text[:200]}"
