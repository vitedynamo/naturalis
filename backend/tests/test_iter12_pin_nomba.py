"""Iteration 12 — Withdrawal PIN + Nomba verification (no webhook) backend tests."""
import os
import random
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"
API = f"{BASE_URL}/api"

ADMIN_PHONE = "08123456789"
ADMIN_PASS = "personally"


def _new_phone() -> str:
    return "080" + str(random.randint(10000000, 99999999))


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session")
def admin_headers(s):
    r = s.post(f"{API}/auth/login", json={"phone": ADMIN_PHONE, "password": ADMIN_PASS})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def fresh_user(s):
    phone = _new_phone()
    pwd = "Test12345"
    body = {
        "phone": phone, "name": "TEST_PinUser", "password": pwd,
        "security_question_1": "Q1", "security_answer_1": "a1",
        "security_question_2": "Q2", "security_answer_2": "a2",
    }
    r = s.post(f"{API}/auth/register", json=body)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return {"phone": phone, "password": pwd, "token": r.json()["token"]}


@pytest.fixture(scope="session")
def user_headers(fresh_user):
    return {"Authorization": f"Bearer {fresh_user['token']}", "Content-Type": "application/json"}


# /auth/me has_withdrawal_pin
def test_auth_me_has_pin_flag(s, user_headers):
    r = s.get(f"{API}/auth/me", headers=user_headers)
    assert r.status_code == 200
    body = r.json()
    assert "has_withdrawal_pin" in body, body
    assert body["has_withdrawal_pin"] is False


# PIN status / set / change
def test_pin_status_no_pin(s, user_headers):
    r = s.get(f"{API}/profile/withdrawal-pin/status", headers=user_headers)
    assert r.status_code == 200
    assert r.json() == {"has_pin": False}


def test_pin_set_wrong_password(s, user_headers):
    r = s.post(f"{API}/profile/withdrawal-pin/set", headers=user_headers,
               json={"pin": "1234", "password": "WrongPass"})
    assert r.status_code == 400
    assert "password" in r.text.lower()


def test_pin_set_invalid_format(s, user_headers, fresh_user):
    r = s.post(f"{API}/profile/withdrawal-pin/set", headers=user_headers,
               json={"pin": "12345", "password": fresh_user["password"]})
    assert r.status_code == 400
    r2 = s.post(f"{API}/profile/withdrawal-pin/set", headers=user_headers,
                json={"pin": "abcd", "password": fresh_user["password"]})
    assert r2.status_code == 400


def test_pin_set_success_and_status_flips(s, user_headers, fresh_user):
    r = s.post(f"{API}/profile/withdrawal-pin/set", headers=user_headers,
               json={"pin": "1357", "password": fresh_user["password"]})
    assert r.status_code == 200, r.text
    assert r.json().get("status") == "ok"

    r2 = s.get(f"{API}/profile/withdrawal-pin/status", headers=user_headers)
    assert r2.json() == {"has_pin": True}

    r3 = s.get(f"{API}/auth/me", headers=user_headers)
    assert r3.json().get("has_withdrawal_pin") is True


def test_pin_set_twice_rejected(s, user_headers, fresh_user):
    r = s.post(f"{API}/profile/withdrawal-pin/set", headers=user_headers,
               json={"pin": "9999", "password": fresh_user["password"]})
    assert r.status_code == 400
    assert "already" in r.text.lower()


def test_pin_change_wrong_old(s, user_headers):
    r = s.post(f"{API}/profile/withdrawal-pin/change", headers=user_headers,
               json={"old_pin": "0000", "new_pin": "2468"})
    assert r.status_code == 400


def test_pin_change_invalid_new(s, user_headers):
    r = s.post(f"{API}/profile/withdrawal-pin/change", headers=user_headers,
               json={"old_pin": "1357", "new_pin": "12"})
    assert r.status_code == 400


def test_pin_change_success(s, user_headers):
    r = s.post(f"{API}/profile/withdrawal-pin/change", headers=user_headers,
               json={"old_pin": "1357", "new_pin": "2468"})
    assert r.status_code == 200, r.text


# /withdrawal/request PIN enforcement
@pytest.fixture(scope="session")
def no_pin_user(s):
    phone = _new_phone()
    body = {"phone": phone, "name": "TEST_NoPin", "password": "Test12345",
            "security_question_1": "Q1", "security_answer_1": "a1",
            "security_question_2": "Q2", "security_answer_2": "a2"}
    r = s.post(f"{API}/auth/register", json=body)
    assert r.status_code == 200, r.text
    return {"phone": phone, "token": r.json()["token"]}


def test_withdraw_rejected_when_no_pin(s, no_pin_user):
    h = {"Authorization": f"Bearer {no_pin_user['token']}", "Content-Type": "application/json"}
    r = s.post(f"{API}/withdrawal/request", headers=h, json={"amount": 1000, "method": "manual"})
    assert r.status_code == 400
    msg = r.json().get("detail", "").lower()
    assert "pin" in msg, msg
    assert ("set" in msg and "profile" in msg) or "4-digit" in msg, msg


def test_withdraw_wrong_pin_counter(s, user_headers):
    expected = [4, 3, 2, 1]
    for i, rem in enumerate(expected):
        r = s.post(f"{API}/withdrawal/request", headers=user_headers,
                   json={"amount": 1000, "method": "manual", "pin": "0000"})
        assert r.status_code == 400, f"attempt {i+1}: {r.status_code} {r.text}"
        msg = r.json().get("detail", "")
        assert f"{rem} attempt" in msg, f"expected '{rem} attempt' in '{msg}'"


def test_withdraw_5th_wrong_pin_locks(s, user_headers):
    r = s.post(f"{API}/withdrawal/request", headers=user_headers,
               json={"amount": 1000, "method": "manual", "pin": "0000"})
    assert r.status_code == 429, f"{r.status_code} {r.text}"
    detail = r.json().get("detail", "").lower()
    assert "15" in detail or "locked" in detail


def test_withdraw_during_lock_returns_429(s, user_headers):
    r = s.post(f"{API}/withdrawal/request", headers=user_headers,
               json={"amount": 1000, "method": "manual", "pin": "2468"})
    assert r.status_code == 429


def test_pin_correct_passes_to_next_check(s):
    """3rd fresh user — set PIN → send correct PIN → expect non-PIN error (bank/balance/window)."""
    phone = _new_phone()
    pwd = "Test12345"
    body = {"phone": phone, "name": "TEST_GoodPin", "password": pwd,
            "security_question_1": "Q1", "security_answer_1": "a1",
            "security_question_2": "Q2", "security_answer_2": "a2"}
    r = s.post(f"{API}/auth/register", json=body)
    assert r.status_code == 200
    tok = r.json()["token"]
    h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

    rp = requests.post(f"{API}/profile/withdrawal-pin/set", headers=h,
                       json={"pin": "5555", "password": pwd})
    assert rp.status_code == 200

    # one wrong → counter = 4 remaining
    rw = requests.post(f"{API}/withdrawal/request", headers=h,
                       json={"amount": 1000, "method": "manual", "pin": "0000"})
    assert rw.status_code == 400
    assert "4 attempt" in rw.json().get("detail", "")

    # correct PIN — should pass PIN check, fail at later validation
    r2 = requests.post(f"{API}/withdrawal/request", headers=h,
                       json={"amount": 1000, "method": "manual", "pin": "5555"})
    assert r2.status_code == 400, r2.text
    msg = r2.json().get("detail", "").lower()
    # MUST NOT mention 'attempt' (i.e. not a PIN failure)
    assert "attempt" not in msg, f"still failing on PIN: {msg}"
    assert any(k in msg for k in ["bank", "balance", "minimum", "between", "closed"]), msg

    # counter reset → another wrong should again say "4 attempts"
    rw2 = requests.post(f"{API}/withdrawal/request", headers=h,
                        json={"amount": 1000, "method": "manual", "pin": "0000"})
    assert rw2.status_code == 400
    assert "4 attempt" in rw2.json().get("detail", ""), rw2.text


# Admin Nomba balance
def test_admin_nomba_balance(s, admin_headers):
    r = s.get(f"{API}/admin/nomba/balance", headers=admin_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    for k in ("balance", "currency", "live"):
        assert k in body, body
    assert body["currency"] == "NGN"
    if body.get("live") and body.get("balance") is not None:
        assert isinstance(body["balance"], (int, float))


def test_admin_nomba_balance_requires_auth(s):
    r = s.get(f"{API}/admin/nomba/balance")
    assert r.status_code in (401, 403)


# Admin poll-pending
def test_admin_poll_pending(s, admin_headers):
    r = s.post(f"{API}/admin/withdrawals/poll-pending", headers=admin_headers, json={})
    assert r.status_code == 200, r.text
    body = r.json()
    for k in ("refreshed", "marked_paid", "marked_rejected", "still_pending", "no_provider_ref", "errors"):
        assert k in body, f"missing {k} in {body}"
        assert isinstance(body[k], int)


def test_admin_poll_pending_requires_admin(s, user_headers):
    r = s.post(f"{API}/admin/withdrawals/poll-pending", headers=user_headers, json={})
    assert r.status_code in (401, 403)


# Admin refresh-status
def test_admin_refresh_status(s, admin_headers):
    r = s.get(f"{API}/admin/withdrawals", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()
    if not items:
        pytest.skip("no withdrawals in DB")
    wid = items[0]["id"]
    r2 = s.post(f"{API}/admin/withdrawals/{wid}/refresh-status",
                headers=admin_headers, json={})
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert "_refresh" in body, body
    assert body["_refresh"] in (
        "marked_paid", "marked_rejected_refunded", "still_pending",
        "no_provider_ref", "already_final", "error",
    )


def test_admin_refresh_status_404(s, admin_headers):
    r = s.post(f"{API}/admin/withdrawals/does-not-exist/refresh-status",
               headers=admin_headers, json={})
    assert r.status_code == 404
