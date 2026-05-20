"""Incremental tests for: 11-digit phone validation + forgot-password flow + admin password resets."""
import os
import time
import secrets
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_PHONE = "08123456789"
ADMIN_PWD = "personally"


def _uniq_phone():
    # exactly 11 digits, starts with 080
    return "080" + str(int(time.time() * 1000))[-6:] + str(secrets.randbelow(100)).zfill(2)


state = {}


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------------- PHONE VALIDATION ON REGISTER ----------------
def test_register_phone_short(s):
    r = s.post(f"{API}/auth/register", json={"phone": "0801234", "name": "X", "password": "Test@1234"})
    assert r.status_code == 400, r.text
    assert "11 digits" in r.text or "11" in r.text


def test_register_phone_long(s):
    r = s.post(f"{API}/auth/register", json={"phone": "080123456789", "name": "X", "password": "Test@1234"})
    assert r.status_code == 400


def test_register_phone_nonnumeric(s):
    r = s.post(f"{API}/auth/register", json={"phone": "0801234567a", "name": "X", "password": "Test@1234"})
    assert r.status_code == 400


def test_register_phone_ok(s):
    p = _uniq_phone()
    assert len(p) == 11
    r = s.post(f"{API}/auth/register", json={"phone": p, "name": "TEST_FP", "password": "Orig@1234"})
    assert r.status_code == 200, r.text
    state["user"] = r.json()["user"]
    state["phone"] = p
    state["orig_pwd"] = "Orig@1234"


# ---------------- PHONE VALIDATION ON LOGIN ----------------
def test_login_short_phone(s):
    r = s.post(f"{API}/auth/login", json={"phone": "0801234", "password": "x"})
    assert r.status_code == 400


def test_login_long_phone(s):
    r = s.post(f"{API}/auth/login", json={"phone": "080123456789", "password": "x"})
    assert r.status_code == 400


def test_login_valid_11digit(s):
    r = s.post(f"{API}/auth/login", json={"phone": state["phone"], "password": state["orig_pwd"]})
    assert r.status_code == 200, r.text


# ---------------- FORGOT PASSWORD ----------------
def test_forgot_password_invalid_phone(s):
    r = s.post(f"{API}/auth/forgot-password",
               json={"phone": "12345", "new_password": "NewPwd1", "reason": "lost"})
    assert r.status_code == 400


def test_forgot_password_unknown_phone(s):
    # 11 digits, but not registered
    r = s.post(f"{API}/auth/forgot-password",
               json={"phone": "09999999999", "new_password": "NewPwd1", "reason": "lost"})
    assert r.status_code == 404


def test_forgot_password_submit_ok(s):
    r = s.post(f"{API}/auth/forgot-password",
               json={"phone": state["phone"], "new_password": "NewPwd@123", "reason": "forgot my pwd"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["status"] == "pending"


def test_cannot_login_with_new_pwd_before_approval(s):
    r = s.post(f"{API}/auth/login", json={"phone": state["phone"], "password": "NewPwd@123"})
    assert r.status_code == 401


def test_old_pwd_still_works_before_approval(s):
    r = s.post(f"{API}/auth/login", json={"phone": state["phone"], "password": state["orig_pwd"]})
    assert r.status_code == 200


def test_forgot_password_duplicate_pending(s):
    r = s.post(f"{API}/auth/forgot-password",
               json={"phone": state["phone"], "new_password": "Another1", "reason": "again"})
    assert r.status_code == 400


# ---------------- ADMIN PASSWORD RESETS ----------------
def test_admin_login_get_token(s):
    r = s.post(f"{API}/auth/login", json={"phone": ADMIN_PHONE, "password": ADMIN_PWD})
    assert r.status_code == 200, r.text
    state["admin_token"] = r.json()["token"]


def test_non_admin_forbidden_on_password_resets(s):
    # login as fresh user
    r = s.post(f"{API}/auth/login", json={"phone": state["phone"], "password": state["orig_pwd"]})
    utok = r.json()["token"]
    r = s.get(f"{API}/admin/password-resets", headers={"Authorization": f"Bearer {utok}"})
    assert r.status_code == 403


def test_admin_list_password_resets(s):
    r = s.get(f"{API}/admin/password-resets",
              headers={"Authorization": f"Bearer {state['admin_token']}"})
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    # find our pending one
    ours = [i for i in items if i.get("user_id") == state["user"]["id"] and i.get("status") == "pending"]
    assert len(ours) >= 1, f"pending reset not found for our user: {items[:3]}"
    state["reset_id"] = ours[0]["id"]
    # ensure new_password_hash NOT leaked
    assert "new_password_hash" not in ours[0]


def test_admin_approve_password_reset(s):
    r = s.post(f"{API}/admin/password-resets/{state['reset_id']}/approve",
               json={"note": "TEST approve"},
               headers={"Authorization": f"Bearer {state['admin_token']}"})
    assert r.status_code == 200, r.text


def test_login_with_new_pwd_after_approval(s):
    r = s.post(f"{API}/auth/login", json={"phone": state["phone"], "password": "NewPwd@123"})
    assert r.status_code == 200, r.text


def test_old_pwd_no_longer_works(s):
    r = s.post(f"{API}/auth/login", json={"phone": state["phone"], "password": state["orig_pwd"]})
    assert r.status_code == 401


# ---------------- REJECT FLOW: separate user ----------------
def test_reject_flow_keeps_old_pwd(s):
    p = _uniq_phone()
    r = s.post(f"{API}/auth/register", json={"phone": p, "name": "TEST_FP2", "password": "Keep@1234"})
    assert r.status_code == 200
    # submit forgot
    r = s.post(f"{API}/auth/forgot-password",
               json={"phone": p, "new_password": "Shouldnot@1", "reason": "test reject"})
    assert r.status_code == 200
    # find pending id
    r = s.get(f"{API}/admin/password-resets",
              headers={"Authorization": f"Bearer {state['admin_token']}"})
    items = r.json()
    rid = next(i["id"] for i in items if i.get("phone") == p and i.get("status") == "pending")
    # reject
    r = s.post(f"{API}/admin/password-resets/{rid}/reject",
               json={"note": "TEST reject"},
               headers={"Authorization": f"Bearer {state['admin_token']}"})
    assert r.status_code == 200
    # old still works
    r = s.post(f"{API}/auth/login", json={"phone": p, "password": "Keep@1234"})
    assert r.status_code == 200
    # new doesn't
    r = s.post(f"{API}/auth/login", json={"phone": p, "password": "Shouldnot@1"})
    assert r.status_code == 401
