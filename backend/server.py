from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta

from auth import hash_password, gen_referral_code
from routes_user import router as user_router
from routes_admin import router as admin_router
from storage import init_storage, get_object
import fixie_counter


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="Naturalis API")
app.state.db = db

# Wire the in-process Fixie request counter so httpx event hooks can $inc the
# `fixie_usage_count` setting whenever a Nomba call goes through the proxy.
fixie_counter.set_db(db)

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "Naturalis API", "ts": datetime.now(timezone.utc).isoformat()}


@api_router.get("/health")
async def health():
    return {"status": "ok"}


# Public file serving for product images (no auth — product images are public).
@api_router.get("/files/{path:path}")
async def serve_file(path: str):
    from fastapi.responses import Response as FResponse
    try:
        data, content_type = get_object(path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    return FResponse(content=data, media_type=content_type, headers={"Cache-Control": "public, max-age=86400"})


api_router.include_router(user_router)
api_router.include_router(admin_router)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


@app.on_event("startup")
async def on_startup():
    # Initialise object storage (non-fatal if it fails — uploads will error later)
    try:
        init_storage()
    except Exception as e:
        logger.warning(f"Object storage init failed at startup: {e}")
    # Indexes that keep admin list/lookups fast (non-fatal if they fail)
    try:
        await db.transactions.create_index([("created_at", -1)])
        await db.transactions.create_index([("meta.by_admin", 1), ("created_at", -1)])
        await db.transactions.create_index([("user_id", 1), ("created_at", -1)])
        await db.users.create_index([("id", 1)])
    except Exception as e:
        logger.warning(f"Index creation failed at startup: {e}")
    # Seed global settings
    existing = await db.settings.find_one({"id": "global"})
    if not existing:
        await db.settings.insert_one({
            "id": "global",
            "welcome_bonus": 750.0,
            "min_deposit": 3000.0,
            "min_withdrawal": 1000.0,
            "gen1_percent": 10.0,
            "gen2_percent": 5.0,
            "gen3_percent": 2.0,
            "paystack_public_key": "",
            "paystack_secret_key": "",
            "payment_mode": "mock",
        })
        logger.info("Seeded global settings")

    # Seed admin user
    admin_phone = os.environ.get("ADMIN_PHONE", "08123456789")
    admin_pwd = os.environ.get("ADMIN_PASSWORD", "personally")
    admin = await db.users.find_one({"phone": admin_phone})
    if not admin:
        code = gen_referral_code()
        while await db.users.find_one({"referral_code": code}):
            code = gen_referral_code()
        await db.users.insert_one({
            "id": "admin-root",
            "phone": admin_phone,
            "name": "Administrator",
            "password_hash": hash_password(admin_pwd),
            "wallet_balance": 0.0,
            "total_earnings": 0.0,
            "referral_earnings": 0.0,
            "referral_code": code,
            "referred_by": None,
            "bank_name": None,
            "account_number": None,
            "account_name": None,
            "is_admin": True,
            "is_blocked": False,
            "created_at": _now_iso(),
        })
        logger.info(f"Seeded admin user {admin_phone}")
    else:
        # Ensure admin flag is set and password matches admin env
        update = {"is_admin": True, "is_blocked": False}
        await db.users.update_one({"phone": admin_phone}, {"$set": update})

    # Seed default investment products if none exist
    count = await db.products.count_documents({})
    if count == 0:
        defaults = [
            {"name": "Seedling", "description": "Plant your first seed. A gentle entry plan that grows your wallet with steady daily returns.", "image_url": "https://images.unsplash.com/photo-1557234195-bd9f290f0e4d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzZ8MHwxfHNlYXJjaHwxfHxzZWVkbGluZyUyMGVtZXJnaW5nJTIwc29pbHxlbnwwfHx8fDE3ODEzMzY1NTl8MA&ixlib=rb-4.1.0&q=85", "price": 5000, "daily_profit_percent": 4.0, "duration_days": 30, "min_amount": 5000, "max_amount": 0},
            {"name": "Sprout", "description": "Your money breaks ground. Watch your Sprout take root with reliable daily yields.", "image_url": "https://images.unsplash.com/photo-1593850685398-e79bab596d1d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjh8MHwxfHNlYXJjaHwxfHxtaWNyb2dyZWVucyUyMGdyb3dpbmd8ZW58MHx8fHwxNzgxMzM2NTc1fDA&ixlib=rb-4.1.0&q=85", "price": 10000, "daily_profit_percent": 4.5, "duration_days": 30, "min_amount": 10000, "max_amount": 0},
            {"name": "Sapling", "description": "A young plan finding its strength — dependable daily returns, day after day.", "image_url": "https://images.unsplash.com/photo-1547106429-11e696f446d9?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODh8MHwxfHNlYXJjaHwxfHxzYXBsaW5nJTIwdHJlZSUyMHN1bmxpZ2h0fGVufDB8fHx8MTc4MTMzNjU1OXww&ixlib=rb-4.1.0&q=85", "price": 20000, "daily_profit_percent": 5.0, "duration_days": 35, "min_amount": 20000, "max_amount": 0},
            {"name": "Wildflower", "description": "Bloom a little brighter. Vibrant daily returns for growing investors.", "image_url": "https://images.unsplash.com/photo-1618813690183-c8a0e5de80f0?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2ODl8MHwxfHNlYXJjaHwxfHx3aWxkZmxvd2VycyUyMGZpZWxkfGVufDB8fHx8MTc4MTMzNjU1OXww&ixlib=rb-4.1.0&q=85", "price": 35000, "daily_profit_percent": 5.5, "duration_days": 35, "min_amount": 35000, "max_amount": 0},
            {"name": "Bamboo Grove", "description": "Fast, resilient growth. Bamboo-quick daily yields that compound your harvest.", "image_url": "https://images.unsplash.com/photo-1586061968253-7bf5724aab7b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTN8MHwxfHNlYXJjaHwxfHxiYW1ib28lMjBmb3Jlc3QlMjBncmVlbnxlbnwwfHx8fDE3ODEzMzY1NTl8MA&ixlib=rb-4.1.0&q=85", "price": 50000, "daily_profit_percent": 6.0, "duration_days": 40, "min_amount": 50000, "max_amount": 0},
            {"name": "Olive Grove", "description": "Patience bears fruit. A premium grove delivering rich daily returns.", "image_url": "https://images.unsplash.com/photo-1591122523233-22037c1dec9f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzNDR8MHwxfHNlYXJjaHwxfHxvbGl2ZSUyMHRyZWUlMjBicmFuY2hlc3xlbnwwfHx8fDE3ODEzMzY1NTl8MA&ixlib=rb-4.1.0&q=85", "price": 75000, "daily_profit_percent": 6.5, "duration_days": 40, "min_amount": 75000, "max_amount": 0},
            {"name": "Oakwood", "description": "Strong and dependable as oak. Substantial daily returns for serious growers.", "image_url": "https://images.unsplash.com/photo-1502082553048-f009c37129b9?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NjZ8MHwxfHNlYXJjaHwxfHxvYWslMjB0cmVlJTIwc3Ryb25nfGVufDB8fHx8MTc4MTMzNjU1OXww&ixlib=rb-4.1.0&q=85", "price": 100000, "daily_profit_percent": 7.0, "duration_days": 45, "min_amount": 100000, "max_amount": 0},
            {"name": "Cedar Ridge", "description": "Rise above the canopy with elevated daily yields from a premium tier.", "image_url": "https://images.unsplash.com/photo-1551120738-c3fcea8d0cf8?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzZ8MHwxfHNlYXJjaHwxfHxwaW5lJTIwZm9yZXN0JTIwbW91bnRhaW58ZW58MHx8fHwxNzgxMzM2NTY1fDA&ixlib=rb-4.1.0&q=85", "price": 175000, "daily_profit_percent": 7.5, "duration_days": 45, "min_amount": 175000, "max_amount": 0},
            {"name": "Redwood", "description": "Towering returns — one of our tallest plans for ambitious portfolios.", "image_url": "https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzJ8MHwxfHNlYXJjaHwxfHxyZWR3b29kJTIwdHJlZXMlMjB0b3dlcmluZ3xlbnwwfHx8fDE3ODEzMzY1NTl8MA&ixlib=rb-4.1.0&q=85", "price": 250000, "daily_profit_percent": 8.0, "duration_days": 50, "min_amount": 250000, "max_amount": 0},
            {"name": "Evergreen Summit", "description": "The peak of the forest. Our flagship plan with the richest daily harvest.", "image_url": "https://images.unsplash.com/photo-1486707471592-8e7eb7e36f78?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjh8MHwxfHNlYXJjaHwxfHxldmVyZ3JlZW4lMjBmb3Jlc3QlMjBtb3VudGFpbiUyMG1pc3R5fGVufDB8fHx8MTc4MTMzNjU1OXww&ixlib=rb-4.1.0&q=85", "price": 500000, "daily_profit_percent": 9.0, "duration_days": 60, "min_amount": 500000, "max_amount": 0},
        ]
        for d in defaults:
            await db.products.insert_one({
                "id": gen_referral_code(10),
                "is_active": True,
                "created_at": _now_iso(),
                **d,
            })
        logger.info("Seeded default products")

    # Background poller: adaptive cadence per record (no webhook required).
    #   - Newly-created records (age < 3 min)  → re-checked every 30s
    #   - Recent records (age < 30 min)        → re-checked every 60s
    #   - Older records                        → re-checked every 5 min
    # The loop itself ticks every TICK_SEC; each record is only refreshed when its
    # individual `last_polled_at + cadence` is due. No external scheduler dependency.
    import asyncio
    TICK_SEC = int(os.environ.get("POLLER_TICK_SEC", "30"))
    FAST_WINDOW = timedelta(minutes=int(os.environ.get("POLLER_FAST_WINDOW_MIN", "3")))
    MED_WINDOW = timedelta(minutes=int(os.environ.get("POLLER_MED_WINDOW_MIN", "30")))
    FAST_CADENCE = timedelta(seconds=int(os.environ.get("POLLER_FAST_CADENCE_SEC", "30")))
    MED_CADENCE = timedelta(seconds=int(os.environ.get("POLLER_MED_CADENCE_SEC", "60")))
    SLOW_CADENCE = timedelta(seconds=int(os.environ.get("POLLER_SLOW_CADENCE_SEC", "300")))
    CONCURRENCY = max(1, int(os.environ.get("POLLER_CONCURRENCY", "10")))

    def _parse_iso(s):
        if not s:
            return None
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except Exception:
            return None

    def _cadence_for(age: timedelta) -> timedelta:
        if age <= FAST_WINDOW:
            return FAST_CADENCE
        if age <= MED_WINDOW:
            return MED_CADENCE
        return SLOW_CADENCE

    def _is_due(record, now):
        # If the record has never been polled before, poll it on the very next tick.
        last_str = record.get("last_polled_at")
        if not last_str:
            return True
        created = _parse_iso(record.get("created_at")) or now
        last = _parse_iso(last_str) or created
        age = now - created
        cadence = _cadence_for(age)
        return (now - last) >= cadence

    async def _withdrawal_status_poller():
        from routes_admin import _refresh_one_withdrawal, _refresh_pending_deposit, _sweep_due_auto_resumes
        sem = asyncio.Semaphore(CONCURRENCY)

        async def _refresh_withdrawal(w, now):
            async with sem:
                try:
                    await _refresh_one_withdrawal(db, w)
                    await db.withdrawals.update_one(
                        {"id": w["id"]}, {"$set": {"last_polled_at": now.isoformat()}},
                    )
                    return True
                except Exception as inner:
                    logger.warning(f"Poller: withdrawal refresh {w.get('id')} failed: {inner}")
                    return False

        async def _refresh_deposit(d, now):
            async with sem:
                try:
                    await _refresh_pending_deposit(db, d)
                    await db.deposits.update_one(
                        {"id": d["id"]}, {"$set": {"last_polled_at": now.isoformat()}},
                    )
                    return True
                except Exception as inner:
                    logger.warning(f"Poller: deposit refresh {d.get('id')} failed: {inner}")
                    return False

        while True:
            try:
                await asyncio.sleep(TICK_SEC)
                now = datetime.now(timezone.utc)

                # ----- Auto-resume sweep (cheap query, runs every tick) -----
                try:
                    resumed = await _sweep_due_auto_resumes(db)
                    if resumed:
                        logger.info(f"Auto-resume sweep: resumed {resumed} paused investment(s)")
                except Exception as e:
                    logger.warning(f"Auto-resume sweep failed: {e}")

                # ----- Withdrawals (FIFO — oldest first) -----
                pendings = await db.withdrawals.find(
                    {"status": {"$in": ["pending", "processing"]}},
                    {"_id": 0},
                ).sort("created_at", 1).to_list(500)
                due_w = [
                    w for w in pendings
                    if (w.get("nomba_transfer_ref") or w.get("paystack_transfer_ref") or w.get("nomba_transaction_id"))
                    and _is_due(w, now)
                ]

                # ----- Deposits (FIFO — oldest first) -----
                pending_deps = await db.deposits.find(
                    {"status": "pending"}, {"_id": 0},
                ).sort("created_at", 1).to_list(500)
                due_d = [
                    d for d in pending_deps
                    if d.get("method") in ("marasoft", "paystack") and _is_due(d, now)
                ]

                if not due_w and not due_d:
                    continue

                # Fan out under the semaphore — bounded concurrency caps in-flight calls.
                w_results, d_results = await asyncio.gather(
                    asyncio.gather(*(_refresh_withdrawal(w, now) for w in due_w), return_exceptions=False),
                    asyncio.gather(*(_refresh_deposit(d, now) for d in due_d), return_exceptions=False),
                )
                touched = sum(1 for r in w_results if r)
                dep_touched = sum(1 for r in d_results if r)
                if touched or dep_touched:
                    logger.info(
                        f"Status poller: refreshed {touched}/{len(due_w)} withdrawal(s) "
                        f"+ {dep_touched}/{len(due_d)} deposit(s) "
                        f"(concurrency={CONCURRENCY})"
                    )
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"Status poller crashed (will retry): {e}")

    app.state._withdrawal_poller_task = asyncio.create_task(_withdrawal_status_poller())
    logger.info(
        f"Status poller online · tick={TICK_SEC}s · concurrency={CONCURRENCY} · cadence: "
        f"fast={int(FAST_CADENCE.total_seconds())}s ≤{int(FAST_WINDOW.total_seconds()/60)}m, "
        f"med={int(MED_CADENCE.total_seconds())}s ≤{int(MED_WINDOW.total_seconds()/60)}m, "
        f"slow={int(SLOW_CADENCE.total_seconds())}s"
    )


@app.on_event("shutdown")
async def shutdown_db_client():
    if hasattr(app.state, "_withdrawal_poller_task") and app.state._withdrawal_poller_task:
        app.state._withdrawal_poller_task.cancel()
    client.close()
