"""Simple notification helpers — persist notifications + log unread count."""
from datetime import datetime, timezone
from typing import Optional
import uuid


def _new_id():
    return "ntf_" + uuid.uuid4().hex[:12]


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


async def notify(db, user_id: str, *, ntype: str, title: str, message: str, meta: Optional[dict] = None):
    """Create an in-app notification for a user."""
    if not user_id:
        return
    doc = {
        "id": _new_id(),
        "user_id": user_id,
        "type": ntype,           # success | info | warn | error
        "title": title,
        "message": message,
        "meta": meta or {},
        "read": False,
        "created_at": _now_iso(),
    }
    await db.notifications.insert_one(doc)
    return doc
