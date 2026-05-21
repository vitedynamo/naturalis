"""One-off migration: replace profit-based referral commissions with invest-amount-based ones.

For every user we:
  1. Sum all existing type='referral' transactions → that is the wallet/earnings delta that was credited under the OLD logic.
  2. Subtract that delta from wallet_balance, total_earnings, referral_earnings.
  3. Delete those transactions.

Then for every existing investment we walk up to 2 generations and credit the referrer based on the
investment amount × current gen1/gen2 percentages, logging a new transaction.

Idempotent guard: new transactions are tagged with meta.basis='invest_amount'. Old ones have no basis tag.
"""
import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
from motor.motor_asyncio import AsyncIOMotorClient
from auth import gen_reference


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    settings = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    percents = [float(settings.get("gen1_percent", 10.0)),
                float(settings.get("gen2_percent", 5.0))]
    print(f"Using percentages: gen1={percents[0]}% gen2={percents[1]}%")

    # ---- Step 1: aggregate existing referral credits per user ----
    pipeline = [
        {"$match": {"type": "referral"}},
        {"$group": {"_id": "$user_id", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]
    olds = await db.transactions.aggregate(pipeline).to_list(10000)
    print(f"Found {len(olds)} users with old referral transactions")
    total_clawback = 0.0
    for row in olds:
        uid = row["_id"]
        delta = float(row["total"])
        total_clawback += delta
        # Subtract from balances
        await db.users.update_one(
            {"id": uid},
            {"$inc": {
                "wallet_balance": -delta,
                "total_earnings": -delta,
                "referral_earnings": -delta,
            }},
        )
    print(f"Clawed back a total of ₦{total_clawback:,.2f} across {len(olds)} users")

    deleted = await db.transactions.delete_many({"type": "referral"})
    print(f"Deleted {deleted.deleted_count} old referral transactions")

    # ---- Step 2: re-credit based on EVERY existing investment ----
    investments = await db.investments.find({}, {"_id": 0}).sort("started_at", 1).to_list(100000)
    print(f"Replaying {len(investments)} investments")

    awarded_count = 0
    awarded_amount = 0.0
    for inv in investments:
        investor = await db.users.find_one({"id": inv["user_id"]}, {"_id": 0})
        if not investor:
            continue
        investor_name = investor.get("name", "a user")
        amount = float(inv.get("amount", 0))
        if amount <= 0:
            continue
        current = investor
        for gen in range(2):
            ref_id = current.get("referred_by")
            if not ref_id:
                break
            referrer = await db.users.find_one({"id": ref_id}, {"_id": 0})
            if not referrer:
                break
            commission = round(amount * (percents[gen] / 100.0), 2)
            if commission > 0:
                updated = await db.users.find_one_and_update(
                    {"id": referrer["id"]},
                    {"$inc": {
                        "wallet_balance": commission,
                        "total_earnings": commission,
                        "referral_earnings": commission,
                    }},
                    return_document=True,
                    projection={"_id": 0},
                )
                await db.transactions.insert_one({
                    "id": gen_reference("tx"),
                    "user_id": referrer["id"],
                    "type": "referral",
                    "amount": commission,
                    "description": f"Gen-{gen+1} referral bonus from {investor_name} ({inv.get('product_name','plan')})",
                    "balance_after": updated["wallet_balance"],
                    "meta": {
                        "generation": gen + 1,
                        "from_user_id": investor["id"],
                        "investment_id": inv["id"],
                        "basis": "invest_amount",
                        "backfill": True,
                        "backfill_at": _now_iso(),
                    },
                    "created_at": inv.get("started_at") or _now_iso(),
                })
                awarded_count += 1
                awarded_amount += commission
            current = referrer

    print(f"Awarded {awarded_count} new commissions totaling ₦{awarded_amount:,.2f}")
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
