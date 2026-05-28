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


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="Naija Invest API")
app.state.db = db

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "Naija Invest API", "ts": datetime.now(timezone.utc).isoformat()}


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
            {
                "name": "Agro Starter",
                "description": "Invest in Nigerian agriculture. Daily returns from farm produce sales.",
                "image_url": "https://images.unsplash.com/photo-1673200692829-fcdb7e267fc1?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjV8MHwxfHNlYXJjaHwxfHxhZ3JpY3VsdHVyZSUyMGZhcm0lMjBsYW5kc2NhcGV8ZW58MHx8fHwxNzc5MzEwMjc0fDA&ixlib=rb-4.1.0&q=85",
                "price": 5000,
                "daily_profit_percent": 4.0,
                "duration_days": 30,
                "min_amount": 5000,
                "max_amount": 0,
            },
            {
                "name": "Real Estate Growth",
                "description": "Earn daily from property development across Lagos & Abuja.",
                "image_url": "https://images.pexels.com/photos/27307400/pexels-photo-27307400.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
                "price": 20000,
                "daily_profit_percent": 5.0,
                "duration_days": 40,
                "min_amount": 20000,
                "max_amount": 0,
            },
            {
                "name": "Gold Reserve",
                "description": "Premium gold-backed plan with stable daily yields.",
                "image_url": "https://images.pexels.com/photos/33539242/pexels-photo-33539242.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
                "price": 50000,
                "daily_profit_percent": 6.5,
                "duration_days": 50,
                "min_amount": 50000,
                "max_amount": 0,
            },
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
        created = _parse_iso(record.get("created_at")) or now
        last = _parse_iso(record.get("last_polled_at")) or _parse_iso(record.get("updated_at")) or created
        age = now - created
        cadence = _cadence_for(age)
        return (now - last) >= cadence

    async def _withdrawal_status_poller():
        from routes_admin import _refresh_one_withdrawal, _refresh_pending_deposit
        while True:
            try:
                await asyncio.sleep(TICK_SEC)
                now = datetime.now(timezone.utc)

                # ----- Withdrawals -----
                pendings = await db.withdrawals.find(
                    {"status": {"$in": ["pending", "processing"]}},
                    {"_id": 0},
                ).to_list(500)
                touched = 0
                for w in pendings:
                    if not (w.get("nomba_transfer_ref") or w.get("paystack_transfer_ref")):
                        continue
                    if not _is_due(w, now):
                        continue
                    try:
                        await _refresh_one_withdrawal(db, w)
                        await db.withdrawals.update_one(
                            {"id": w["id"]}, {"$set": {"last_polled_at": now.isoformat()}},
                        )
                        touched += 1
                    except Exception as inner:
                        logger.warning(f"Poller: withdrawal refresh {w.get('id')} failed: {inner}")

                # ----- Deposits -----
                pending_deps = await db.deposits.find(
                    {"status": "pending"}, {"_id": 0},
                ).to_list(500)
                dep_touched = 0
                for d in pending_deps:
                    if d.get("method") not in ("marasoft", "paystack"):
                        continue
                    if not _is_due(d, now):
                        continue
                    try:
                        await _refresh_pending_deposit(db, d)
                        await db.deposits.update_one(
                            {"id": d["id"]}, {"$set": {"last_polled_at": now.isoformat()}},
                        )
                        dep_touched += 1
                    except Exception as inner:
                        logger.warning(f"Poller: deposit refresh {d.get('id')} failed: {inner}")

                if touched or dep_touched:
                    logger.info(f"Status poller: refreshed {touched} withdrawal(s) + {dep_touched} deposit(s)")
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"Status poller crashed (will retry): {e}")

    app.state._withdrawal_poller_task = asyncio.create_task(_withdrawal_status_poller())
    logger.info(
        f"Status poller online · tick={TICK_SEC}s · cadence: "
        f"fast={int(FAST_CADENCE.total_seconds())}s ≤{int(FAST_WINDOW.total_seconds()/60)}m, "
        f"med={int(MED_CADENCE.total_seconds())}s ≤{int(MED_WINDOW.total_seconds()/60)}m, "
        f"slow={int(SLOW_CADENCE.total_seconds())}s"
    )


@app.on_event("shutdown")
async def shutdown_db_client():
    if hasattr(app.state, "_withdrawal_poller_task") and app.state._withdrawal_poller_task:
        app.state._withdrawal_poller_task.cancel()
    client.close()
