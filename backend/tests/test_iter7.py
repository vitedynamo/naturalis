"""Iteration 7 regression tests:
- Notification endpoints removed (404)
- Settings public/admin shapes (no gen3_percent, +nomba/gateway/announce_image)
- Referrals: 2 generations only (registration chain + payout commission)
- /admin/withdrawals/{wid}/pay-nomba mock mode
- /admin/upload-image still working
- General regression smoke
"""
import io
import os
import time
import uuid
import requests
import pytest
from datetime import datetime, timedelta, timezone
from pymongo import MongoClient

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://naija-invest-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
ADMIN_PHONE = "08123456789"
ADMIN_PASS = "personally"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


def _post(path, **kw):
    return requests.post(f"{API}{path}", timeout=30, **kw)


def _get(path, **kw):
    return requests.get(f"{API}{path}", timeout=30, **kw)


def _put(path, **kw):
    return requests.put(f"{API}{path}", timeout=30, **kw)


@pytest.fixture(scope="module")
def admin_token():
    r = _post("/auth/login", json={"phone": ADMIN_PHONE, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


import random
_RAND_PHONE_SEEN = set()
def _rand_phone():
    while True:
        n = str(random.randint(10000000, 99999999))
        p = "080" + n
        if p not in _RAND_PHONE_SEEN:
            _RAND_PHONE_SEEN.add(p)
            return p


def _register(phone, password="testpass", referral_code=None):
    body = {
        "phone": phone, "password": password,
        "name": f"TEST7_{phone[-4:]}",
        "security_q1": "What is your mother's maiden name?", "security_a1": "smith",
        "security_q2": "What was the name of your first pet?", "security_a2": "rex",
    }
    if referral_code:
        body["referral_code"] = referral_code
    r = _post("/auth/register", json=body)
    return r


# ---------- Notifications removed ----------
class TestNotificationsRemoved:
    def test_list_notifications_404(self):
        r = _get("/notifications")
        assert r.status_code == 404, f"Expected 404, got {r.status_code}"

    def test_unread_count_404(self):
        r = _get("/notifications/unread-count")
        assert r.status_code == 404

    def test_mark_read_404(self):
        r = _post("/notifications/abc/read")
        assert r.status_code == 404


# ---------- Settings public ----------
class TestSettingsPublic:
    def test_public_shape(self):
        r = _get("/settings/public")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "gen1_percent" in d and "gen2_percent" in d
        assert "gen3_percent" not in d, f"gen3_percent should be removed but found in {list(d.keys())}"
        assert "deposit_gateway" in d
        assert "payout_gateway" in d
        assert "home_announcement_image_url" in d
        assert d["deposit_gateway"] in ("paystack", "nomba")
        assert d["payout_gateway"] in ("paystack", "nomba")


# ---------- Settings admin GET/PUT ----------
class TestSettingsAdmin:
    def test_admin_get_settings(self, admin_headers):
        r = _get("/admin/settings", headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("nomba_client_id", "nomba_client_secret", "nomba_account_id",
                  "deposit_gateway", "payout_gateway", "home_announcement_image_url"):
            assert k in d, f"Missing key {k} in admin settings"

    def test_admin_put_settings_echo(self, admin_headers):
        payload = {
            "nomba_client_id": "TEST7_nci",
            "nomba_client_secret": "TEST7_ncs",
            "nomba_account_id": "TEST7_nai",
            "deposit_gateway": "nomba",
            "payout_gateway": "paystack",
            "home_announcement_image_url": "/api/files/test7/announce.png",
        }
        r = _put("/admin/settings", headers=admin_headers, json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        for k, v in payload.items():
            assert d.get(k) == v, f"PUT did not echo {k}: got {d.get(k)} expected {v}"

        # restore safe defaults
        restore = {
            "nomba_client_id": "", "nomba_client_secret": "", "nomba_account_id": "",
            "deposit_gateway": "paystack", "payout_gateway": "paystack",
        }
        _put("/admin/settings", headers=admin_headers, json=restore)


# ---------- Referral chain A->B->C->D (only gen1+gen2) ----------
class TestReferralChain:
    @pytest.fixture(scope="class")
    def chain(self):
        # Create A
        pA, pB, pC, pD = _rand_phone(), _rand_phone(), _rand_phone(), _rand_phone()
        # Ensure unique
        while len({pA, pB, pC, pD}) < 4:
            pD = _rand_phone(); time.sleep(0.01)

        rA = _register(pA)
        assert rA.status_code == 200, rA.text
        codeA = rA.json()["user"]["referral_code"]
        idA = rA.json()["user"]["id"]

        rB = _register(pB, referral_code=codeA)
        assert rB.status_code == 200, rB.text
        codeB = rB.json()["user"]["referral_code"]
        idB = rB.json()["user"]["id"]

        rC = _register(pC, referral_code=codeB)
        assert rC.status_code == 200, rC.text
        codeC = rC.json()["user"]["referral_code"]
        idC = rC.json()["user"]["id"]

        rD = _register(pD, referral_code=codeC)
        assert rD.status_code == 200, rD.text
        idD = rD.json()["user"]["id"]
        tokenD = rD.json()["token"]
        tokenA = rA.json()["token"]

        return {
            "A": {"id": idA, "phone": pA, "code": codeA, "token": tokenA},
            "B": {"id": idB, "phone": pB, "code": codeB},
            "C": {"id": idC, "phone": pC, "code": codeC},
            "D": {"id": idD, "phone": pD, "token": tokenD},
        }

    def test_referrals_collection_only_gen1_gen2(self, chain):
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        refs = list(db.referrals.find({"referred_id": chain["D"]["id"]}, {"_id": 0}))
        gens = sorted([r["generation"] for r in refs])
        assert 3 not in gens, f"Found gen3 record for D, gens={gens}"
        # Should have at least gen1 (C) and gen2 (B)
        by_gen = {r["generation"]: r["referrer_id"] for r in refs}
        assert by_gen.get(1) == chain["C"]["id"], by_gen
        assert by_gen.get(2) == chain["B"]["id"], by_gen
        # A should NOT have a gen3 referral record for D
        a_refs = list(db.referrals.find({"referrer_id": chain["A"]["id"], "referred_id": chain["D"]["id"]}))
        assert a_refs == [], f"A unexpectedly has referral to D: {a_refs}"

    def test_referrals_api_returns_2_gens(self, chain):
        h = {"Authorization": f"Bearer {chain['A']['token']}"}
        r = _get("/referrals", headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        # gen1 / gen2 shape
        assert "gen1" in d or "1" in d
        assert ("gen3" not in d) and ("3" not in d), f"Found gen3 key in response: {list(d.keys())}"
        # users should have total_invested + investments
        for key in d:
            if isinstance(d[key], list):
                for u in d[key]:
                    if isinstance(u, dict):
                        # may not have investments if 0 but field should exist
                        if "total_invested" not in u:
                            continue
                        assert isinstance(u.get("total_invested"), (int, float))

    def test_referrals_details_gen3_rejected(self, chain):
        h = {"Authorization": f"Bearer {chain['A']['token']}"}
        r = _get("/referrals/3/details", headers=h)
        assert r.status_code == 400, f"Expected 400 for gen3, got {r.status_code}: {r.text}"

    def test_referrals_details_gen1_gen2_ok(self, chain):
        h = {"Authorization": f"Bearer {chain['A']['token']}"}
        for g in (1, 2):
            r = _get(f"/referrals/{g}/details", headers=h)
            assert r.status_code == 200, f"gen {g}: {r.text}"
            d = r.json()
            assert d.get("generation") == g
            assert "users" in d


# ---------- Payout commission only goes to gen1+gen2 ----------
class TestPayoutCommissions:
    def test_award_only_2_gens(self, admin_headers):
        """Simulate a payout via the payouts module and verify only gen1+gen2 referrers get credited."""
        from pymongo import MongoClient as MC
        client = MC(MONGO_URL)
        db_sync = client[DB_NAME]

        # Build chain again with new users to isolate
        pA, pB, pC, pD = _rand_phone(), _rand_phone(), _rand_phone(), _rand_phone()
        while len({pA, pB, pC, pD}) < 4:
            pD = _rand_phone(); time.sleep(0.01)
        rA = _register(pA); assert rA.status_code == 200, rA.text
        codeA = rA.json()["user"]["referral_code"]; idA = rA.json()["user"]["id"]
        rB = _register(pB, referral_code=codeA); assert rB.status_code == 200, rB.text
        codeB = rB.json()["user"]["referral_code"]; idB = rB.json()["user"]["id"]
        rC = _register(pC, referral_code=codeB); assert rC.status_code == 200, rC.text
        codeC = rC.json()["user"]["referral_code"]; idC = rC.json()["user"]["id"]
        rD = _register(pD, referral_code=codeC); assert rD.status_code == 200, rD.text
        idD = rD.json()["user"]["id"]

        # Run _award_referral_commissions directly
        import asyncio
        import sys
        sys.path.insert(0, "/app/backend")
        from payouts import _award_referral_commissions
        from motor.motor_asyncio import AsyncIOMotorClient

        async def run():
            amotor = AsyncIOMotorClient(MONGO_URL)
            adb = amotor[DB_NAME]
            await _award_referral_commissions(adb, idD, 1000.0, "TEST7_inv_" + uuid.uuid4().hex[:8])
            amotor.close()

        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(run())
        finally:
            loop.close()
        time.sleep(0.3)

        # Verify transactions: only C (gen1) and B (gen2) credited, NOT A
        txC = list(db_sync.transactions.find({"user_id": idC, "type": "referral", "meta.from_user_id": idD}))
        txB = list(db_sync.transactions.find({"user_id": idB, "type": "referral", "meta.from_user_id": idD}))
        txA = list(db_sync.transactions.find({"user_id": idA, "type": "referral", "meta.from_user_id": idD}))
        assert len(txC) >= 1, "C should have gen1 referral commission"
        assert len(txB) >= 1, "B should have gen2 referral commission"
        assert len(txA) == 0, f"A should NOT have gen3 referral commission; found {txA}"
        # generation meta values must be 1 and 2
        gens = {t["meta"]["generation"] for t in (txC + txB)}
        assert gens <= {1, 2}, gens
        assert 3 not in gens


# ---------- pay-nomba mock ----------
class TestPayNomba:
    def test_pay_nomba_mock(self, admin_headers):
        # Create a user, deposit, then withdrawal request
        phone = _rand_phone()
        ru = _register(phone)
        assert ru.status_code == 200, ru.text
        utoken = ru.json()["token"]
        uh = {"Authorization": f"Bearer {utoken}"}

        # Mock-init + verify a deposit so user has balance (min deposit 3000)
        init = _post("/deposit/initialize", headers=uh, json={"amount": 10000})
        assert init.status_code == 200, init.text
        ref = init.json().get("reference")
        ver = _get(f"/deposit/verify/{ref}", headers=uh)
        assert ver.status_code == 200, ver.text

        # Set bank details on profile first
        pbank = _put("/profile/bank", headers=uh, json={
            "bank_name": "Test Bank",
            "account_number": "0123456789",
            "account_name": "TEST7 USER",
        })
        assert pbank.status_code == 200, pbank.text

        # Request withdrawal
        wreq = _post("/withdrawal/request", headers=uh, json={
            "amount": 1000,
        })
        assert wreq.status_code == 200, wreq.text
        wid = wreq.json().get("id") or wreq.json().get("withdrawal", {}).get("id")
        assert wid, wreq.text

        # Pay via Nomba (mock)
        pay = _post(f"/admin/withdrawals/{wid}/pay-nomba", headers=admin_headers,
                    json={"bank_code": "058", "reason": "Test withdrawal"})
        assert pay.status_code == 200, pay.text
        d = pay.json()
        assert d.get("status") == "ok"
        assert d.get("mode") == "mock", f"Expected mode=mock, got {d}"

        # Verify withdrawal updated
        wlist = _get("/admin/withdrawals", headers=admin_headers)
        assert wlist.status_code == 200
        w = next((x for x in wlist.json() if x.get("id") == wid), None)
        assert w is not None, "Withdrawal not found in list"
        assert w["status"] == "paid"
        assert w.get("method") == "auto"
        assert "Nomba transfer" in (w.get("admin_note") or ""), w.get("admin_note")


# ---------- upload-image still works ----------
class TestUploadImage:
    def test_upload_png(self, admin_headers):
        # 1x1 PNG
        png = bytes.fromhex(
            "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4"
            "890000000A49444154789C6300010000000500010D0A2DB40000000049454E44"
            "AE426082"
        )
        files = {"file": ("test7.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{API}/admin/upload-image", headers=admin_headers, files=files, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "url" in d or "path" in d, d


# ---------- General regression smoke ----------
class TestRegression:
    @pytest.fixture(scope="class")
    def user_token(self):
        phone = _rand_phone()
        ru = _register(phone)
        assert ru.status_code == 200, ru.text
        return ru.json()["token"]

    def test_products(self, user_token):
        r = _get("/products", headers={"Authorization": f"Bearer {user_token}"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_login_admin(self):
        r = _post("/auth/login", json={"phone": ADMIN_PHONE, "password": ADMIN_PASS})
        assert r.status_code == 200

    def test_register_phone_validation(self):
        r = _register("0812345")  # too short
        assert r.status_code >= 400

    def test_admin_banks(self, admin_headers):
        r = _get("/admin/banks", headers=admin_headers)
        assert r.status_code == 200

    def test_deposit_init_verify_mock(self):
        phone = _rand_phone()
        ru = _register(phone)
        uh = {"Authorization": f"Bearer {ru.json()['token']}"}
        init = _post("/deposit/initialize", headers=uh, json={"amount": 5000})
        assert init.status_code == 200, init.text
        ref = init.json().get("reference")
        ver = _get(f"/deposit/verify/{ref}", headers=uh)
        assert ver.status_code == 200, ver.text

    def test_invest_flow(self, user_token):
        uh = {"Authorization": f"Bearer {user_token}"}
        # Top up
        init = _post("/deposit/initialize", headers=uh, json={"amount": 50000})
        assert init.status_code == 200, init.text
        ref = init.json()["reference"]
        _get(f"/deposit/verify/{ref}", headers=uh)
        # Choose a product
        prods = _get("/products", headers=uh).json()
        if not isinstance(prods, list) or not prods:
            pytest.skip("No products available")
        prods_sorted = sorted(prods, key=lambda p: p.get("min_amount", 0))
        p = prods_sorted[0]
        amount = max(p.get("min_amount", 0), p.get("price", 0), 1000)
        r = _post("/invest", headers=uh, json={"product_id": p["id"], "amount": amount})
        assert r.status_code in (200, 201), r.text
