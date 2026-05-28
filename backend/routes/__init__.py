"""Per-domain route files.

Each module in this package attaches endpoints to the shared `user_router` /
`admin_router` defined in `/app/backend/_routers.py`. Sub-modules are imported
once by `routes_user.py` / `routes_admin.py` so that their `@router.x(...)`
decorators register on FastAPI startup.

Currently extracted domains:
  - admin_password_resets — user password-reset request approval flow
  - admin_announcements   — in-app announcement CRUD

The rest of the legacy code still lives in `routes_user.py` and
`routes_admin.py` and is being moved out incrementally without behaviour
changes.
"""
