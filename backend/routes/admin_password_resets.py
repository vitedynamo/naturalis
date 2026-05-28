"""Admin password-reset request approval flow.

Self-contained domain — handlers depend only on the shared `admin_router`,
the `PasswordResetActionRequest` model, and the auth dependency. Extracted out
of the legacy `routes_admin.py` as the first step of the modularisation.
"""
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request

from _routers import admin_router as router
from auth import get_current_admin
from models import PasswordResetActionRequest


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/admin/password-resets")
async def list_password_resets(request: Request, _admin=Depends(get_current_admin)):
    db = request.app.state.db
    items = await db.password_resets.find(
        {}, {"_id": 0, "new_password_hash": 0}
    ).sort("created_at", -1).to_list(2000)
    return items


@router.post("/admin/password-resets/{rid}/approve")
async def approve_password_reset(
    rid: str,
    payload: PasswordResetActionRequest,
    request: Request,
    _admin=Depends(get_current_admin),
):
    db = request.app.state.db
    pr = await db.password_resets.find_one({"id": rid}, {"_id": 0})
    if not pr:
        raise HTTPException(404, "Request not found")
    if pr["status"] != "pending":
        raise HTTPException(400, f"Already {pr['status']}")
    await db.users.update_one(
        {"id": pr["user_id"]},
        {"$set": {"password_hash": pr["new_password_hash"]}},
    )
    await db.password_resets.update_one(
        {"id": rid},
        {"$set": {"status": "approved", "admin_note": payload.note, "updated_at": _now_iso()}},
    )
    return {"status": "ok"}


@router.post("/admin/password-resets/{rid}/reject")
async def reject_password_reset(
    rid: str,
    payload: PasswordResetActionRequest,
    request: Request,
    _admin=Depends(get_current_admin),
):
    db = request.app.state.db
    pr = await db.password_resets.find_one({"id": rid}, {"_id": 0})
    if not pr:
        raise HTTPException(404, "Request not found")
    if pr["status"] != "pending":
        raise HTTPException(400, f"Already {pr['status']}")
    await db.password_resets.update_one(
        {"id": rid},
        {"$set": {"status": "rejected", "admin_note": payload.note, "updated_at": _now_iso()}},
    )
    return {"status": "ok"}
