"""Backend tests for Marasoft dynamic-account deposit flow + regression."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://naija-invest-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

USER_PHONE = "08099887766"
USER_PWD = "newpwd"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"phone": USER_PHONE, "password": USER_PWD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Public settings ----------
def test_public_settings_marasoft_gateway():
    r = requests.get(f"{API}/settings/public", timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert data.get("deposit_gateway") == "marasoft", f"deposit_gateway is {data.get('deposit_gateway')}"


# ---------- Deposit Initialize ----------
def test_deposit_initialize_marasoft_bank_transfer(headers):
    r = requests.post(f"{API}/deposit/initialize", json={"amount": 3000}, headers=headers, timeout=45)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("type") == "bank_transfer", data
    assert data.get("mode") == "live"
    assert data.get("gateway") == "marasoft"
    assert "reference" in data and data["reference"].startswith("dep_")
    assert float(data.get("amount", 0)) == 3000.0
    assert data.get("account_number") and len(str(data["account_number"])) >= 10
    assert data.get("account_name")
    assert data.get("bank_name")
    assert "authorization_url" not in data, "authorization_url must NOT be present for bank_transfer"
    # store for follow-up
    pytest.deposit_ref = data["reference"]
    pytest.deposit_acct = data["account_number"]


def test_deposit_persisted_in_db_via_list(headers):
    ref = getattr(pytest, "deposit_ref", None)
    assert ref, "needs prior init"
    r = requests.get(f"{API}/deposits", headers=headers, timeout=20)
    assert r.status_code == 200
    items = r.json()
    match = next((d for d in items if d.get("reference") == ref), None)
    assert match is not None, "deposit not found in user history"
    assert match["status"] == "pending"
    assert match["method"] == "marasoft"
    assert match.get("account_number") == pytest.deposit_acct
    assert match.get("account_name")
    assert match.get("bank_name")


def test_deposit_verify_pending_or_failed(headers):
    ref = getattr(pytest, "deposit_ref", None)
    assert ref
    r = requests.get(f"{API}/deposit/verify/{ref}", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    # No actual transfer made — must not be success
    assert data.get("status") in ("failed", "pending"), data


def test_deposit_below_minimum_rejected(headers):
    r = requests.post(f"{API}/deposit/initialize", json={"amount": 100}, headers=headers, timeout=20)
    assert r.status_code == 400


# ---------- Regression ----------
def test_auth_me(headers):
    r = requests.get(f"{API}/auth/me", headers=headers, timeout=20)
    assert r.status_code == 200
    u = r.json()
    assert u["phone"] == USER_PHONE
    assert u.get("has_withdrawal_pin") is True


def test_withdrawal_pin_status(headers):
    r = requests.get(f"{API}/profile/withdrawal-pin/status", headers=headers, timeout=20)
    assert r.status_code == 200
    assert r.json().get("has_pin") is True


def test_products_list(headers):
    r = requests.get(f"{API}/products", headers=headers, timeout=20)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
