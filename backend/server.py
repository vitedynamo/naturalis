from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from datetime import datetime, timezone

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

    # Background poller: every 5 minutes, refresh the status of every non-final withdrawal.
    # No external scheduler dependency — uses asyncio.
    import asyncio
    POLL_INTERVAL_SEC = int(os.environ.get("WITHDRAWAL_POLL_INTERVAL", "300"))

    async def _withdrawal_status_poller():
        from routes_admin import _refresh_one_withdrawal
        while True:
            try:
                await asyncio.sleep(POLL_INTERVAL_SEC)
                pendings = await db.withdrawals.find(
                    {"status": {"$in": ["pending", "processing"]}},
                    {"_id": 0},
                ).to_list(500)
                # Only refresh ones that actually have a provider transfer ref
                touched = 0
                for w in pendings:
                    if w.get("nomba_transfer_ref") or w.get("paystack_transfer_ref"):
                        try:
                            await _refresh_one_withdrawal(db, w)
                            touched += 1
                        except Exception as inner:
                            logger.warning(f"Poller: refresh {w.get('id')} failed: {inner}")
                if touched:
                    logger.info(f"Withdrawal poller: refreshed {touched} non-final transfer(s)")
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"Withdrawal poller crashed (will retry): {e}")

    app.state._withdrawal_poller_task = asyncio.create_task(_withdrawal_status_poller())
    logger.info(f"Withdrawal status poller scheduled every {POLL_INTERVAL_SEC}s")


@app.on_event("shutdown")
async def shutdown_db_client():
    if hasattr(app.state, "_withdrawal_poller_task") and app.state._withdrawal_poller_task:
        app.state._withdrawal_poller_task.cancel()
    client.close()
