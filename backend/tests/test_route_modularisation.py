"""Regression test for the route-modularisation refactor.

Asserts that every endpoint we expect on the user + admin routers is still
registered after `routes_user.py` / `routes_admin.py` were split into the
`/app/backend/routes/` package. If a future split accidentally drops an
endpoint, this test fails immediately.
"""
import os
import sys

# Load .env so importing routes_user → motor → mongo settings resolves
for line in open("/app/backend/.env"):
    if "=" in line and not line.startswith("#"):
        k, v = line.strip().split("=", 1)
        os.environ.setdefault(k, v.strip().strip('"'))
sys.path.insert(0, "/app/backend")

import routes_user  # noqa: E402,F401  (registers user routes)
import routes_admin  # noqa: E402,F401  (registers admin routes)
from _routers import admin_router, user_router  # noqa: E402


EXPECTED_USER_PATHS = {
    "/auth/register",
    "/auth/login",
    "/auth/me",
    "/auth/change-password",
    "/profile/bank",
    "/profile/withdrawal-pin/status",
    "/products",
    "/invest",
    "/investments",
    "/deposit/initialize",
    "/deposits",
    "/withdrawal/request",
    "/withdrawals",
    "/referrals",
    "/coupons/redeem",
    "/transactions",
    "/settings/public",
    "/announcements/next",
    "/daily-claim/status",
    "/daily-claim/claim",
}

EXPECTED_ADMIN_PATHS = {
    "/admin/stats",
    "/admin/users",
    "/admin/products",
    "/admin/deposits",
    "/admin/withdrawals",
    "/admin/investments",
    "/admin/transactions",
    "/admin/password-resets",
    "/admin/password-resets/{rid}/approve",
    "/admin/password-resets/{rid}/reject",
    "/admin/settings",
    "/admin/activity",
    "/admin/announcements",
    "/admin/change-password",
}


def _paths_for(router):
    return {r.path for r in router.routes}


def test_user_routes_present():
    paths = _paths_for(user_router)
    missing = EXPECTED_USER_PATHS - paths
    assert not missing, f"User routes missing after modularisation: {missing}"


def test_admin_routes_present():
    paths = _paths_for(admin_router)
    missing = EXPECTED_ADMIN_PATHS - paths
    assert not missing, f"Admin routes missing after modularisation: {missing}"


def test_routers_share_instances():
    # The shared instances must be the same object across imports, otherwise
    # split modules wouldn't all register on the canonical router used by
    # server.py (`from routes_user import router as user_router`).
    assert routes_user.router is user_router
    assert routes_admin.router is admin_router


if __name__ == "__main__":
    test_user_routes_present()
    test_admin_routes_present()
    test_routers_share_instances()
    print(f"OK · {len(_paths_for(user_router))} user routes · {len(_paths_for(admin_router))} admin routes")
