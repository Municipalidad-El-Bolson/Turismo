from datetime import UTC, date, datetime, timedelta
from hmac import compare_digest
import json
from pathlib import Path
from secrets import randbelow

from pymongo import ASCENDING
from pymongo.errors import DuplicateKeyError

from .database import get_database
from .schemas import EstablishmentCreate, EstablishmentUpdate, OccupancyEntryCreate, UserRole

SEED_FILE = Path(__file__).with_name("establishments_seed.json")
OCCUPANCY_SEED_FILE = Path(__file__).with_name("occupancy_seed.json")


def infer_accommodation_type(name: str | None) -> str:
    normalized = (name or "").lower()
    if "hostel" in normalized:
        return "Hostels"
    if "camping" in normalized or "dormi" in normalized:
        return "Campings / dormis"
    if "hotel" in normalized or "hosteria" in normalized or "hostería" in normalized or "posada" in normalized:
        return "Hoteles / hosterias"
    if "apart" in normalized or "caba" in normalized or "bungalow" in normalized or "depart" in normalized:
        return "Apart / cabanas"
    if "hospedaje" in normalized or "bed" in normalized or "b&b" in normalized:
        return "B&B / hospedajes"
    return "Otros"


def serialize_optional_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str) and value:
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def date_to_datetime(value: date | None) -> datetime | None:
    if value is None:
        return None
    return datetime.combine(value, datetime.min.time(), tzinfo=UTC)


def iso_to_datetime(value) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, dict) and "$date" in value:
        value = value["$date"]
    if isinstance(value, str):
        normalized = value.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized)
    return datetime.now(UTC)


def leave_dates(establishment: dict) -> tuple[date | None, date | None]:
    start = serialize_optional_date(establishment.get("temporary_leave_start"))
    end = serialize_optional_date(establishment.get("temporary_leave_end"))
    if start and end and end < start:
        return end, start
    return start, end


def leave_overlaps(establishment: dict, start: date, end: date) -> bool:
    leave_start, leave_end = leave_dates(establishment)
    if not leave_start or not leave_end:
        return False
    return leave_start < end and leave_end >= start


def entry_is_on_leave(establishment: dict, entry_date: date) -> bool:
    leave_start, leave_end = leave_dates(establishment)
    return bool(leave_start and leave_end and leave_start <= entry_date <= leave_end)


def week_count_between(start: date, end: date) -> int:
    if end <= start:
        return 0
    return max(1, len({(start + timedelta(days=offset)).isocalendar().week for offset in range((end - start).days)}))


def active_weeks_for_establishment(establishment: dict, period: str, start: date, end: date, total_weeks: int) -> int:
    leave_start, leave_end = leave_dates(establishment)
    if not leave_start or not leave_end:
        return total_weeks

    leave_end_exclusive = leave_end + timedelta(days=1)
    overlap_start = max(start, leave_start)
    overlap_end = min(end, leave_end_exclusive)
    if overlap_end <= overlap_start:
        return total_weeks
    if period in {"monthly", "weekend"}:
        return 0
    unavailable_weeks = week_count_between(overlap_start, overlap_end)
    return max(total_weeks - unavailable_weeks, 0)


def generate_establishment_id() -> str:
    return str(10_000_000 + randbelow(90_000_000))


def serialize_user(document: dict) -> dict:
    establishment_name = document.get("establishment_name") or document.get("accommodation_name")
    return {
        "id": document["_id"],
        "role": document["role"],
        "display_name": document["display_name"],
        "whatsapp": document.get("whatsapp"),
        "establishment_name": establishment_name,
        "parcel_number": document.get("parcel_number"),
        "accommodation_name": document.get("accommodation_name") or establishment_name,
        "address": document.get("address"),
        "phone": document.get("phone"),
        "social_reason": document.get("social_reason"),
        "email": document.get("email"),
        "category_number": document.get("category_number"),
        "category_numbers": document.get("category_numbers") or [],
        "accommodation_types": document.get("accommodation_types") or [],
        "habilitation_number": document.get("habilitation_number"),
        "nomenclature": document.get("nomenclature"),
        "neighborhood": document.get("neighborhood"),
        "units": document.get("units"),
        "places": document.get("places"),
        "accommodation_type": document.get("accommodation_type") or infer_accommodation_type(establishment_name),
        "temporary_leave_start": serialize_optional_date(document.get("temporary_leave_start")),
        "temporary_leave_end": serialize_optional_date(document.get("temporary_leave_end")),
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
    await db.users.update_one(
        {"_id": "meb-admin"},
        {
            "$set": {
                "role": UserRole.ADMIN,
                "display_name": "Admin MEB",
                "username": "admin",
                "password": "admin123",
            }
        },
        upsert=True,
    )
    await clean_legacy_establishments()
    await seed_establishments_from_file()
    await seed_occupancy_from_file()
    await backfill_accommodation_types()


async def clean_legacy_establishments() -> None:
    await get_database().users.delete_many(
        {
            "role": UserRole.ESTABLISHMENT,
            "$or": [
                {"_id": {"$in": ["hotel-sol", "cabanas-rio", "10000001", "10000002"]}},
                {"_id": {"$regex": r"\D"}},
                {"establishment_name": "Prueba ID Automatico"},
                {"establishment_name": "Buena Vida Social Club", "seed_source": {"$exists": False}},
            ],
        }
    )


async def seed_establishments_from_file() -> None:
    if not SEED_FILE.exists():
        return

    db = get_database()
    records = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    seed_ids = [record["id"] for record in records]
    if seed_ids:
        await db.users.delete_many(
            {
                "role": UserRole.ESTABLISHMENT,
                "_id": {"$nin": seed_ids},
            }
        )
    for record in records:
        document = {
            "_id": record["id"],
            "role": UserRole.ESTABLISHMENT,
            "display_name": record["accommodation_name"],
            "establishment_name": record["accommodation_name"],
            "accommodation_name": record["accommodation_name"],
            "parcel_number": record.get("parcel_number", ""),
            "address": record.get("address", ""),
            "phone": record.get("phone", ""),
            "whatsapp": record.get("phone", ""),
            "raw_phone": record.get("raw_phone", ""),
            "social_reason": record.get("social_reason", ""),
            "email": record.get("email", ""),
            "category_number": record.get("category_number"),
            "category_numbers": record.get("category_numbers", []),
            "accommodation_types": record.get("accommodation_types", []),
            "habilitation_number": record.get("habilitation_number", ""),
            "nomenclature": record.get("nomenclature", ""),
            "neighborhood": record.get("neighborhood", ""),
            "units": record.get("units"),
            "places": record.get("places"),
            "accommodation_type": record.get("accommodation_type") or infer_accommodation_type(record["accommodation_name"]),
            "temporary_leave_start": date_to_datetime(serialize_optional_date(record.get("temporary_leave_start"))),
            "temporary_leave_end": date_to_datetime(serialize_optional_date(record.get("temporary_leave_end"))),
            "temporary_leave_source_row": record.get("temporary_leave_source_row"),
            "source_sheet": record.get("source_sheet"),
            "source_row": record.get("source_row"),
            "seed_source": record.get("seed_source", "mora_ultima_etapa_2026"),
        }
        await db.users.update_one(
            {"_id": document["_id"]},
            {"$set": document},
            upsert=True,
        )


async def seed_occupancy_from_file() -> None:
    if not OCCUPANCY_SEED_FILE.exists():
        return

    db = get_database()
    records = json.loads(OCCUPANCY_SEED_FILE.read_text(encoding="utf-8"))
    await db.occupancy_entries.delete_many({})
    for record in records:
        record.pop("_id", None)
        record["week_start"] = iso_to_datetime(record["week_start"])
        record["created_at"] = iso_to_datetime(record.get("created_at"))
        record["updated_at"] = iso_to_datetime(record.get("updated_at"))
    if records:
        await db.occupancy_entries.insert_many(records)


async def backfill_accommodation_types() -> None:
    if not SEED_FILE.exists():
        return

    db = get_database()
    records = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    for record in records:
        await db.users.update_one(
            {
                "_id": record["id"],
                "role": UserRole.ESTABLISHMENT,
                "$or": [
                    {"accommodation_type": {"$exists": False}},
                    {"accommodation_type": None},
                    {"accommodation_type": ""},
                ],
            },
            {"$set": {"accommodation_type": record.get("accommodation_type") or infer_accommodation_type(record["accommodation_name"])}},
        )


async def find_user(user_id: str) -> dict | None:
    return await get_database().users.find_one({"_id": user_id})


async def find_admin_by_credentials(username: str, password: str) -> dict | None:
    user = await get_database().users.find_one({"role": UserRole.ADMIN, "username": username})
    if not user or not compare_digest(user.get("password", ""), password):
        return None
    return user


async def list_establishments() -> list[dict]:
    cursor = get_database().users.find({"role": UserRole.ESTABLISHMENT}).sort("establishment_name", ASCENDING)
    return [serialize_user(document) async for document in cursor]


async def create_establishment(payload: EstablishmentCreate) -> dict:
    db = get_database()
    for _ in range(5):
        document = {
            "_id": generate_establishment_id(),
            "role": UserRole.ESTABLISHMENT,
            "display_name": payload.accommodation_name,
            "establishment_name": payload.accommodation_name,
            "accommodation_name": payload.accommodation_name,
            "parcel_number": payload.parcel_number,
            "address": payload.address,
            "phone": payload.phone,
            "whatsapp": payload.phone,
            "units": payload.units,
            "places": payload.places,
            "accommodation_type": payload.accommodation_type or infer_accommodation_type(payload.accommodation_name),
            "temporary_leave_start": date_to_datetime(payload.temporary_leave_start),
            "temporary_leave_end": date_to_datetime(payload.temporary_leave_end),
        }
        try:
            await db.users.insert_one(document)
        except DuplicateKeyError:
            continue
        return serialize_user(document)

    raise DuplicateKeyError("Could not generate a unique establishment ID")


async def update_establishment(establishment_id: str, payload: EstablishmentUpdate) -> dict | None:
    update = {
        "display_name": payload.accommodation_name,
        "establishment_name": payload.accommodation_name,
        "accommodation_name": payload.accommodation_name,
        "parcel_number": payload.parcel_number,
        "address": payload.address,
        "phone": payload.phone,
        "whatsapp": payload.phone,
        "units": payload.units,
        "places": payload.places,
        "accommodation_type": payload.accommodation_type or infer_accommodation_type(payload.accommodation_name),
        "temporary_leave_start": date_to_datetime(payload.temporary_leave_start),
        "temporary_leave_end": date_to_datetime(payload.temporary_leave_end),
    }
    result = await get_database().users.update_one(
        {"_id": establishment_id, "role": UserRole.ESTABLISHMENT},
        {"$set": update},
    )
    if result.matched_count == 0:
        return None
    await get_database().occupancy_entries.update_many(
        {"establishment_id": establishment_id},
        {"$set": {"establishment_name": payload.accommodation_name}},
    )
    user = await find_user(establishment_id)
    return serialize_user(user) if user else None


async def delete_establishment(establishment_id: str) -> bool:
    result = await get_database().users.delete_one({"_id": establishment_id, "role": UserRole.ESTABLISHMENT})
    if result.deleted_count == 0:
        return False
    await get_database().occupancy_entries.delete_many({"establishment_id": establishment_id})
    return True


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


async def list_entries_between(establishment_id: str, start_date, end_date) -> list[dict]:
    start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=UTC)
    end_dt = datetime.combine(end_date, datetime.min.time(), tzinfo=UTC)
    cursor = get_database().occupancy_entries.find(
        {
            "establishment_id": establishment_id,
            "week_start": {"$gte": start_dt, "$lt": end_dt},
        }
    ).sort("week_start", 1)
    return [serialize_entry(document) async for document in cursor]


async def delete_entry(establishment_id: str, week_start) -> bool:
    week_start_dt = datetime.combine(week_start, datetime.min.time(), tzinfo=UTC)
    result = await get_database().occupancy_entries.delete_one(
        {"establishment_id": establishment_id, "week_start": week_start_dt}
    )
    return result.deleted_count > 0


async def aggregate_stats(
    period: str,
    year: int | None,
    month: int | None,
    week_start: date | None,
    range_start: date | None,
    range_end: date | None,
) -> list[dict]:
    start, end, _ = stats_date_range(period, year, month, week_start, range_start, range_end)
    match: dict = {"week_start": {"$gte": start, "$lt": end}}
    if period == "yearly":
        label_expr = {"$dateToString": {"format": "%Y", "date": "$week_start"}}
    elif period == "monthly":
        label_expr = {"$dateToString": {"format": "%Y-%m", "date": "$week_start"}}
    elif period in {"weekend", "range"}:
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


async def stats_availability() -> dict:
    pipeline = [
        {
            "$group": {
                "_id": {
                    "year": {"$year": "$week_start"},
                    "month": {"$month": "$week_start"},
                }
            }
        },
        {"$sort": {"_id.year": 1, "_id.month": 1}},
    ]
    years: set[int] = set()
    months_by_year: dict[str, set[int]] = {}
    async for document in get_database().occupancy_entries.aggregate(pipeline):
        year = int(document["_id"]["year"])
        month = int(document["_id"]["month"])
        years.add(year)
        months_by_year.setdefault(str(year), set()).add(month)

    return {
        "years": sorted(years),
        "months_by_year": {
            year: sorted(months)
            for year, months in sorted(months_by_year.items(), key=lambda item: int(item[0]))
        },
    }


def stats_date_range(
    period: str,
    year: int | None,
    month: int | None,
    week_start: date | None,
    range_start: date | None = None,
    range_end: date | None = None,
) -> tuple[datetime, datetime, int]:
    today = datetime.now(UTC).date()
    selected_year = year or today.year
    selected_month = month or today.month

    if period == "range":
        start_date = range_start or today
        final_date = range_end or start_date
        if final_date < start_date:
            start_date, final_date = final_date, start_date
        end_date = final_date + timedelta(days=1)
    elif period == "yearly":
        start_date = date(selected_year, 1, 1)
        end_date = date(selected_year + 1, 1, 1)
    elif period == "monthly":
        start_date = date(selected_year, selected_month, 1)
        if selected_month == 12:
            end_date = date(selected_year + 1, 1, 1)
        else:
            end_date = date(selected_year, selected_month + 1, 1)
    elif period == "weekend":
        start_date = week_start or today
        end_date = start_date + timedelta(days=7)
        weeks = 1
        return (
            datetime.combine(start_date, datetime.min.time(), tzinfo=UTC),
            datetime.combine(end_date, datetime.min.time(), tzinfo=UTC),
            weeks,
        )
    else:
        start_date = date(selected_year, 1, 1)
        end_date = date(selected_year + 1, 1, 1)

    weeks = max(1, len({(start_date + timedelta(days=offset)).isocalendar().week for offset in range((end_date - start_date).days)}))
    return (
        datetime.combine(start_date, datetime.min.time(), tzinfo=UTC),
        datetime.combine(end_date, datetime.min.time(), tzinfo=UTC),
        weeks,
    )


def percent(numerator: int | float, denominator: int | float) -> float:
    if denominator <= 0:
        return 0
    return round((numerator / denominator) * 100, 2)


async def aggregate_type_stats(
    period: str,
    year: int | None,
    month: int | None,
    week_start: date | None,
    range_start: date | None,
    range_end: date | None,
) -> tuple[list[dict], int]:
    start, end, weeks = stats_date_range(period, year, month, week_start, range_start, range_end)
    start_date = start.date()
    end_date = end.date()
    establishments = await list_establishments()
    entries = await list_entries()
    period_entries = [
        entry for entry in entries
        if start_date <= entry["week_start"] < end_date
    ]

    rows: dict[str, dict] = {}
    for establishment in establishments:
        active_weeks = active_weeks_for_establishment(establishment, period, start_date, end_date, weeks)
        if active_weeks <= 0:
            continue
        accommodation_type = establishment.get("accommodation_type") or infer_accommodation_type(establishment.get("establishment_name"))
        row = rows.setdefault(
            accommodation_type,
            {
                "accommodation_type": accommodation_type,
                "establishments": 0,
                "participant_ids": set(),
                "expected_responses": 0,
                "response_count": 0,
                "occupied_places": 0,
                "available_places": 0,
                "occupied_units": 0,
                "available_units": 0,
            },
        )
        row["establishments"] += 1
        row["expected_responses"] += active_weeks
        row["available_places"] += (establishment.get("places") or 0) * active_weeks
        row["available_units"] += (establishment.get("units") or 0) * active_weeks

    establishments_by_id = {establishment["id"]: establishment for establishment in establishments}
    for entry in period_entries:
        establishment = establishments_by_id.get(entry["establishment_id"])
        if not establishment:
            continue
        if entry_is_on_leave(establishment, entry["week_start"]):
            continue
        if active_weeks_for_establishment(establishment, period, start_date, end_date, weeks) <= 0:
            continue
        accommodation_type = establishment.get("accommodation_type") or infer_accommodation_type(entry.get("establishment_name"))
        row = rows.setdefault(
            accommodation_type,
            {
                "accommodation_type": accommodation_type,
                "establishments": 0,
                "participant_ids": set(),
                "expected_responses": 0,
                "response_count": 0,
                "occupied_places": 0,
                "available_places": 0,
                "occupied_units": 0,
                "available_units": 0,
            },
        )
        row["participant_ids"].add(entry["establishment_id"])
        row["response_count"] += 1
        row["occupied_places"] += entry["occupied_places"]
        row["occupied_units"] += entry["occupied_units"]

    result = []
    for row in sorted(rows.values(), key=lambda item: item["accommodation_type"]):
        participant_establishments = len(row["participant_ids"])
        missing_responses = max(row["expected_responses"] - row["response_count"], 0)
        respondent_available_places = 0
        respondent_available_units = 0
        for establishment_id in row["participant_ids"]:
            establishment = establishments_by_id.get(establishment_id)
            if not establishment:
                continue
            active_weeks = active_weeks_for_establishment(establishment, period, start_date, end_date, weeks)
            respondent_available_places += (establishment.get("places") or 0) * active_weeks
            respondent_available_units += (establishment.get("units") or 0) * active_weeks
        result.append(
            {
                "accommodation_type": row["accommodation_type"],
                "establishments": row["establishments"],
                "participant_establishments": participant_establishments,
                "participation_percent": percent(participant_establishments, row["establishments"]),
                "expected_responses": row["expected_responses"],
                "response_count": row["response_count"],
                "missing_responses": missing_responses,
                "response_rate_percent": percent(row["response_count"], row["expected_responses"]),
                "occupied_places": row["occupied_places"],
                "available_places": row["available_places"],
                "respondent_available_places": respondent_available_places,
                "occupancy_rate_percent": percent(row["occupied_places"], row["available_places"]),
                "occupied_units": row["occupied_units"],
                "available_units": row["available_units"],
                "respondent_available_units": respondent_available_units,
                "unit_occupancy_percent": percent(row["occupied_units"], row["available_units"]),
            }
        )
    return result, weeks
