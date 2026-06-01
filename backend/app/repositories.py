from datetime import UTC, datetime

from pymongo import ASCENDING

from .database import get_database
from .schemas import OccupancyEntryCreate, UserRole


def serialize_user(document: dict) -> dict:
    return {
        "id": document["_id"],
        "role": document["role"],
        "display_name": document["display_name"],
        "whatsapp": document.get("whatsapp"),
        "establishment_name": document.get("establishment_name"),
    }


def serialize_entry(document: dict) -> dict:
    return {
        "id": str(document["_id"]),
        "establishment_id": document["establishment_id"],
        "establishment_name": document["establishment_name"],
        "week_start": document["week_start"].date(),
        "occupied_places": document["occupied_places"],
        "occupied_units": document["occupied_units"],
        "notes": document.get("notes"),
        "created_at": document["created_at"],
        "updated_at": document["updated_at"],
    }


async def ensure_indexes() -> None:
    db = get_database()
    await db.users.create_index([("role", ASCENDING)])
    await db.occupancy_entries.create_index(
        [("establishment_id", ASCENDING), ("week_start", ASCENDING)],
        unique=True,
    )


async def seed_demo_data() -> None:
    db = get_database()
    if await db.users.count_documents({}) > 0:
        return

    await db.users.insert_many(
        [
            {
                "_id": "meb-admin",
                "role": UserRole.ADMIN,
                "display_name": "Admin MEB",
            },
            {
                "_id": "hotel-sol",
                "role": UserRole.ESTABLISHMENT,
                "display_name": "Hotel Sol",
                "establishment_name": "Hotel Sol",
                "whatsapp": "+5492901000001",
            },
            {
                "_id": "cabanas-rio",
                "role": UserRole.ESTABLISHMENT,
                "display_name": "Cabanas Rio",
                "establishment_name": "Cabanas Rio",
                "whatsapp": "+5492901000002",
            },
        ]
    )


async def find_user(user_id: str) -> dict | None:
    return await get_database().users.find_one({"_id": user_id})


async def list_establishments() -> list[dict]:
    cursor = get_database().users.find({"role": UserRole.ESTABLISHMENT}).sort("establishment_name", ASCENDING)
    return [serialize_user(document) async for document in cursor]


async def upsert_occupancy_entry(establishment_id: str, payload: OccupancyEntryCreate) -> dict:
    db = get_database()
    establishment = await find_user(establishment_id)
    if not establishment or establishment["role"] != UserRole.ESTABLISHMENT:
        raise ValueError("Establishment user not found")

    now = datetime.now(UTC)
    week_start = datetime.combine(payload.week_start, datetime.min.time(), tzinfo=UTC)
    update = {
        "$set": {
            "establishment_id": establishment_id,
            "establishment_name": establishment["establishment_name"],
            "week_start": week_start,
            "occupied_places": payload.occupied_places,
            "occupied_units": payload.occupied_units,
            "notes": payload.notes,
            "updated_at": now,
        },
        "$setOnInsert": {"created_at": now},
    }
    await db.occupancy_entries.update_one(
        {"establishment_id": establishment_id, "week_start": week_start},
        update,
        upsert=True,
    )
    document = await db.occupancy_entries.find_one({"establishment_id": establishment_id, "week_start": week_start})
    return serialize_entry(document)


async def list_entries(establishment_id: str | None = None) -> list[dict]:
    query = {"establishment_id": establishment_id} if establishment_id else {}
    cursor = get_database().occupancy_entries.find(query).sort("week_start", -1)
    return [serialize_entry(document) async for document in cursor]


async def find_entry(establishment_id: str, week_start) -> dict | None:
    week_start_dt = datetime.combine(week_start, datetime.min.time(), tzinfo=UTC)
    document = await get_database().occupancy_entries.find_one(
        {"establishment_id": establishment_id, "week_start": week_start_dt}
    )
    return serialize_entry(document) if document else None


async def aggregate_stats(period: str, year: int | None, month: int | None) -> list[dict]:
    match: dict = {}
    if year:
        start = datetime(year, month or 1, 1, tzinfo=UTC)
        end_year = year + 1 if month is None else year + (1 if month == 12 else 0)
        end_month = 1 if month == 12 else (month + 1 if month else 1)
        end = datetime(end_year, end_month, 1, tzinfo=UTC)
        match["week_start"] = {"$gte": start, "$lt": end}

    if period == "yearly":
        label_expr = {"$dateToString": {"format": "%Y", "date": "$week_start"}}
    elif period == "monthly":
        label_expr = {"$dateToString": {"format": "%Y-%m", "date": "$week_start"}}
    elif period == "weekend":
        label_expr = {"$dateToString": {"format": "%Y-%m-%d", "date": "$week_start"}}
    else:
        label_expr = "$establishment_name"

    pipeline = [
        {"$match": match},
        {
            "$group": {
                "_id": label_expr,
                "occupied_places": {"$sum": "$occupied_places"},
                "occupied_units": {"$sum": "$occupied_units"},
                "entries": {"$sum": 1},
            }
        },
        {"$sort": {"_id": 1}},
    ]
    rows = []
    async for document in get_database().occupancy_entries.aggregate(pipeline):
        rows.append(
            {
                "label": document["_id"],
                "occupied_places": document["occupied_places"],
                "occupied_units": document["occupied_units"],
                "entries": document["entries"],
            }
        )
    return rows
