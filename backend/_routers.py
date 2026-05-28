"""Shared APIRouter instances + small cross-domain helpers used by the per-domain
route modules under `/app/backend/routes/`.

Why this file exists
====================
Both `routes_user.py` and `routes_admin.py` historically grew to thousands of
lines. To start cutting them into per-domain files (deposits, withdrawals,
referrals, …) without inflicting circular imports, all sub-modules pull the
single shared `user_router` / `admin_router` from here. Each domain file then
attaches its endpoints with `@router.get(...)` / `@router.post(...)`.

Migration is incremental: any handler still defined in the legacy files keeps
working because the SAME router instance is used everywhere.
"""

from fastapi import APIRouter

# These two instances are the canonical mounts referenced by server.py via
# `from routes_user import router as user_router` and the equivalent admin
# import. Both legacy files now re-export these instances unchanged.
user_router: APIRouter = APIRouter()
admin_router: APIRouter = APIRouter()
