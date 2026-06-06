"""Fire-and-forget Fixie proxy request counter.

`httpx` event hooks call `bump_async()` once per outbound request that goes
through the Fixie proxy (see `nomba.py::_nomba_client`). We don't increment
Mongo synchronously — that would couple latency to the payout call. Instead
we schedule the `$inc` on the running event loop and return immediately.

The counter is exposed on the Admin Dashboard via `GET /api/admin/fixie/usage`
and can be reset / synced manually if it ever drifts from the real Fixie
dashboard number.
"""
import asyncio
import logging

logger = logging.getLogger(__name__)

_db = None


def set_db(db):
    """Called once from `server.py` startup so the bump function can write to Mongo."""
    global _db
    _db = db


async def _do_bump(n: int) -> None:
    if _db is None or n <= 0:
        return
    try:
        await _db.settings.update_one(
            {"id": "global"},
            {"$inc": {"fixie_usage_count": int(n)}},
            upsert=True,
        )
    except Exception as e:
        # Never let a counter failure break an actual Nomba call.
        logger.warning("fixie counter bump failed: %s", e)


def bump_async(n: int = 1) -> None:
    """Fire-and-forget. Safe to call from inside an httpx event hook or any
    coroutine that has a running event loop. Silently no-ops if there's no
    loop (e.g. during import-time test discovery)."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    loop.create_task(_do_bump(n))
