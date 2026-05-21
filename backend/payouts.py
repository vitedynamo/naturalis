"""Investment payout processor + 3-generation referral commission."""
from datetime import datetime, timezone, timedelta
from typing import Optional


async def _credit_user(db, user_id: str, amount: float, ttype: str, description: str, meta: Optional[dict] = None):
    """Credit a user's wallet, update earnings/referral aggregates and log a transaction."""
    update = {
        "$inc": {
            "wallet_balance": amount,
        }
    }
    # Track earnings/referral totals
    if ttype == "profit":
        update["$inc"]["total_earnings"] = amount
    if ttype == "referral":
        update["$inc"]["total_earnings"] = amount
        update["$inc"]["referral_earnings"] = amount

    user = await db.users.find_one_and_update(
        {"id": user_id},
        update,
        return_document=True,
        projection={"_id": 0},
    )
    if not user:
        return None

    tx = {
        "id": _new_id(),
        "user_id": user_id,
        "type": ttype,
        "amount": amount,
        "description": description,
        "balance_after": user.get("wallet_balance", 0.0),
        "meta": meta or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.transactions.insert_one(tx)
    return user


def _new_id():
    import uuid
    return str(uuid.uuid4())


async def _award_referral_commissions(db, investor_id: str, profit_amount: float, source_investment_id: str):
    """Walk up to 2 generations and credit each referrer based on settings percentages of the profit."""
    settings = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    percents = [
        settings.get("gen1_percent", 10.0),
        settings.get("gen2_percent", 5.0),
    ]

    current_user = await db.users.find_one({"id": investor_id}, {"_id": 0})
    if not current_user:
        return

    for gen in range(2):
        ref_id = current_user.get("referred_by")
        if not ref_id:
            break
        referrer = await db.users.find_one({"id": ref_id}, {"_id": 0})
        if not referrer:
            break
        commission = round(profit_amount * (percents[gen] / 100.0), 2)
        if commission > 0:
            await _credit_user(
                db,
                referrer["id"],
                commission,
                "referral",
                f"Gen-{gen+1} referral commission",
                meta={
                    "generation": gen + 1,
                    "from_user_id": investor_id,
                    "investment_id": source_investment_id,
                },
            )
        current_user = referrer


def _parse_dt(val):
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    if isinstance(val, str):
        try:
            dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            return datetime.now(timezone.utc)
    return datetime.now(timezone.utc)


async def process_investment_payouts(db, user_id: Optional[str] = None):
    """For each active investment, credit any whole 24h payouts elapsed since last_payout_at,
    up to the remaining duration. Award 3-gen referral commissions per payout."""
    query = {"status": "active"}
    if user_id:
        query["user_id"] = user_id

    now = datetime.now(timezone.utc)
    investments = await db.investments.find(query, {"_id": 0}).to_list(5000)

    for inv in investments:
        last = _parse_dt(inv.get("last_payout_at") or inv.get("started_at"))
        remaining_days = inv["duration_days"] - inv.get("days_paid", 0)
        if remaining_days <= 0:
            await db.investments.update_one(
                {"id": inv["id"]},
                {"$set": {"status": "completed", "completed_at": now.isoformat()}},
            )
            continue

        elapsed_seconds = (now - last).total_seconds()
        payouts_due = int(elapsed_seconds // 86400)
        if payouts_due <= 0:
            continue
        payouts_due = min(payouts_due, remaining_days)

        per_payout = float(inv.get("daily_profit_amount", 0.0))
        total_this_run = round(per_payout * payouts_due, 2)
        new_last = last + timedelta(days=payouts_due)
        new_days_paid = inv.get("days_paid", 0) + payouts_due
        new_total_paid = round(inv.get("total_profit_paid", 0.0) + total_this_run, 2)
        completed = new_days_paid >= inv["duration_days"]

        # Credit investor
        await _credit_user(
            db,
            inv["user_id"],
            total_this_run,
            "profit",
            f"Daily profit x{payouts_due} from {inv['product_name']}",
            meta={"investment_id": inv["id"], "payouts": payouts_due},
        )

        # Update investment
        await db.investments.update_one(
            {"id": inv["id"]},
            {
                "$set": {
                    "last_payout_at": new_last.isoformat(),
                    "days_paid": new_days_paid,
                    "total_profit_paid": new_total_paid,
                    "status": "completed" if completed else "active",
                    "completed_at": now.isoformat() if completed else None,
                }
            },
        )

        # Award referral commissions per payout cycle
        await _award_referral_commissions(db, inv["user_id"], total_this_run, inv["id"])
