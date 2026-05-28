"""Regression tests — ensure user-facing transaction descriptions never expose
the underlying payment gateway name (paystack/nomba/marasoft)."""
import os
import re
import sys

# Load env so `from routes_user import ...` resolves Mongo
for line in open("/app/backend/.env"):
    if "=" in line and not line.startswith("#"):
        k, v = line.strip().split("=", 1)
        os.environ.setdefault(k, v.strip().strip('"'))

sys.path.insert(0, "/app/backend")

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient


def test_no_gateway_in_user_descriptions():
    async def run():
        db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
        pattern = re.compile(r"\b(paystack|nomba|marasoft)\b", re.I)
        offenders = []
        async for tx in db.transactions.find({}, {"_id": 0, "description": 1, "type": 1, "user_id": 1}):
            desc = tx.get("description") or ""
            if pattern.search(desc):
                offenders.append(tx)
        assert not offenders, (
            f"{len(offenders)} transactions still leak gateway names: "
            + ", ".join((o.get("description") or "")[:60] for o in offenders[:3])
        )
    asyncio.run(run())


if __name__ == "__main__":
    test_no_gateway_in_user_descriptions()
    print("OK · no transactions expose gateway names")
