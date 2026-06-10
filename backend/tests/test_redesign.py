"""Tests for the big redesign update:
- Security questions on register
- /auth/security-questions/{phone}
- /auth/reset-with-questions
- /admin/upload-image
- /api/files/{path}
"""
import io
import os
import secrets
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://evoque-payout-fix.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_PHONE = "08123456789"
ADMIN_PWD = "personally"


def _uniq_phone():
    # Must be exactly 11 digits
    suffix = (str(int(time.time() * 1000)) + str(secrets.randbelow(1000000)))[-7:]
    p = "0807" + suffix
    return p[:11]


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"phone": ADMIN_PHONE, "password": ADMIN_PWD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ===== Security Questions =====
@pytest.fixture(scope="module")
def user_with_sq(s):
    phone = _uniq_phone()
    payload = {
        "phone": phone, "name": "TEST_SQ", "password": "orig123",
        "security_question_1": "What is your mother's maiden name?",
        "security_answer_1": "Smith",
        "security_question_2": "What was the name of your first pet?",
        "security_answer_2": "Rex",
    }
    r = s.post(f"{API}/auth/register", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    return {"phone": phone, "token": r.json()["token"], "user": r.json()["user"]}


def test_register_with_security_questions_persists(s, user_with_sq, admin_token):
    # Hit security-questions endpoint, should return both Qs
    phone = user_with_sq["phone"]
    r = s.get(f"{API}/auth/security-questions/{phone}", timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["question_1"] == "What is your mother's maiden name?"
    assert j["question_2"] == "What was the name of your first pet?"
    assert j["phone"] == phone


def test_security_questions_no_auth_required(s, user_with_sq):
    # explicitly no Authorization header
    r = requests.get(f"{API}/auth/security-questions/{user_with_sq['phone']}", timeout=20)
    assert r.status_code == 200


def test_security_questions_404_when_not_set(s):
    # Register user without security questions
    phone = _uniq_phone()
    r = s.post(f"{API}/auth/register", json={"phone": phone, "name": "TEST_NoSQ", "password": "abcd"}, timeout=20)
    assert r.status_code == 200
    r = s.get(f"{API}/auth/security-questions/{phone}", timeout=20)
    assert r.status_code == 404


def test_security_questions_404_unknown_phone(s):
    r = s.get(f"{API}/auth/security-questions/09999999999", timeout=20)
    assert r.status_code == 404


def test_reset_with_questions_wrong_answer(s, user_with_sq):
    r = s.post(f"{API}/auth/reset-with-questions", json={
        "phone": user_with_sq["phone"],
        "answer_1": "Smith",
        "answer_2": "Wrong",
        "new_password": "newpwd123",
    }, timeout=20)
    assert r.status_code == 400


def test_reset_with_questions_success_case_insensitive(s, user_with_sq):
    new_pwd = "ResetOK@1"
    r = s.post(f"{API}/auth/reset-with-questions", json={
        "phone": user_with_sq["phone"],
        "answer_1": "SMITH",  # uppercase
        "answer_2": "rex",     # lowercase
        "new_password": new_pwd,
    }, timeout=20)
    assert r.status_code == 200, r.text
    # verify old password no longer works
    r2 = s.post(f"{API}/auth/login", json={"phone": user_with_sq["phone"], "password": "orig123"}, timeout=20)
    assert r2.status_code == 401
    # verify new one works
    r3 = s.post(f"{API}/auth/login", json={"phone": user_with_sq["phone"], "password": new_pwd}, timeout=20)
    assert r3.status_code == 200


# ===== Upload Image =====
def _png_bytes():
    # 1x1 transparent PNG
    return bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
        "890000000d49444154789c6300010000000500010d0a2db40000000049454e44ae426082"
    )


def test_upload_image_admin_only(s, admin_token):
    files = {"file": ("test.png", io.BytesIO(_png_bytes()), "image/png")}
    r = requests.post(
        f"{API}/admin/upload-image",
        files=files,
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=60,
    )
    if r.status_code == 502:
        pytest.skip(f"Object storage unavailable: {r.text}")
    assert r.status_code == 200, r.text
    j = r.json()
    assert "path" in j and "url" in j
    assert j["url"].startswith("/api/files/")
    return j


def test_upload_image_rejects_non_admin(s, user_with_sq):
    # User token (from fresh registration)
    files = {"file": ("test.png", io.BytesIO(_png_bytes()), "image/png")}
    r = requests.post(
        f"{API}/admin/upload-image",
        files=files,
        headers={"Authorization": f"Bearer {user_with_sq['token']}"},
        timeout=60,
    )
    assert r.status_code == 403


def test_upload_rejects_non_image(s, admin_token):
    files = {"file": ("hello.txt", io.BytesIO(b"hello"), "text/plain")}
    r = requests.post(
        f"{API}/admin/upload-image",
        files=files,
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=30,
    )
    assert r.status_code == 400


def test_upload_rejects_oversize(s, admin_token):
    big = b"\x00" * (5 * 1024 * 1024 + 10)
    files = {"file": ("big.png", io.BytesIO(big), "image/png")}
    r = requests.post(
        f"{API}/admin/upload-image",
        files=files,
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=60,
    )
    assert r.status_code == 400


def test_files_endpoint_serves_uploaded_image(s, admin_token):
    files = {"file": ("served.png", io.BytesIO(_png_bytes()), "image/png")}
    up = requests.post(
        f"{API}/admin/upload-image",
        files=files,
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=60,
    )
    if up.status_code == 502:
        pytest.skip("Object storage unavailable")
    assert up.status_code == 200, up.text
    rel_url = up.json()["url"]  # /api/files/...
    full = f"{BASE_URL}{rel_url}"
    r = requests.get(full, timeout=30)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("image/")
    assert len(r.content) == len(_png_bytes())


def test_files_endpoint_no_auth_required(s, admin_token):
    files = {"file": ("noauth.png", io.BytesIO(_png_bytes()), "image/png")}
    up = requests.post(
        f"{API}/admin/upload-image",
        files=files,
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=60,
    )
    if up.status_code == 502:
        pytest.skip("Object storage unavailable")
    rel_url = up.json()["url"]
    r = requests.get(f"{BASE_URL}{rel_url}", timeout=30)  # no Authorization
    assert r.status_code == 200
