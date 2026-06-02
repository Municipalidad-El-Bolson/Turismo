from datetime import date, timedelta

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pymongo.errors import DuplicateKeyError

from .config import settings
from .database import close_database, connect_database
from .repositories import (
    aggregate_stats,
    aggregate_type_stats,
    create_establishment,
    delete_entry,
    delete_establishment,
    ensure_indexes,
    find_admin_by_credentials,
    find_user,
    list_entries,
    list_entries_between,
    list_establishments,
    seed_demo_data,
    serialize_user,
    update_establishment,
    upsert_occupancy_entry,
)
from .schemas import (
    ComplianceStatus,
    EstablishmentCreate,
    EstablishmentSummary,
    EstablishmentUpdate,
    LoginRequest,
    LoginResponse,
    OccupancyEntry,
    OccupancyEntryCreate,
    StatsResponse,
    User,
    UserRole,
    WhatsAppBulkResult,
    WhatsAppSendResult,
)
from .whatsapp import build_reminder_message, send_whatsapp_text

app = FastAPI(title="Turismo MEB API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup() -> None:
    await connect_database()
    await ensure_indexes()
    await seed_demo_data()


@app.on_event("shutdown")
async def shutdown() -> None:
    await close_database()


async def get_current_user(user_id: str = Query(..., alias="userId")) -> User:
    user = await find_user(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid user")
    return User(**serialize_user(user))


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/auth/login", response_model=LoginResponse)
async def login(payload: LoginRequest) -> LoginResponse:
    if payload.username and payload.password:
        user = await find_admin_by_credentials(payload.username, payload.password)
    elif payload.user_id:
        if not payload.user_id.isdigit():
            raise HTTPException(status_code=400, detail="Establishment ID must be numeric")
        user = await find_user(payload.user_id)
        if user and user["role"] != UserRole.ESTABLISHMENT:
            raise HTTPException(status_code=403, detail="Use admin credentials")
    else:
        raise HTTPException(status_code=400, detail="Missing login credentials")

    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return LoginResponse(user=User(**serialize_user(user)))


@app.get("/establishments", response_model=list[EstablishmentSummary])
async def establishments(_: User = Depends(require_admin)) -> list[EstablishmentSummary]:
    return [
        EstablishmentSummary(
            id=user["id"],
            establishment_name=user["establishment_name"] or user["display_name"],
            whatsapp=user["whatsapp"] or "",
            parcel_number=user["parcel_number"],
            accommodation_name=user["accommodation_name"],
            address=user["address"],
            phone=user["phone"],
            units=user["units"],
            places=user["places"],
            accommodation_type=user["accommodation_type"],
        )
        for user in await list_establishments()
    ]


@app.post("/admin/establishments", response_model=EstablishmentSummary, status_code=201)
async def add_establishment(
    payload: EstablishmentCreate,
    _: User = Depends(require_admin),
) -> EstablishmentSummary:
    try:
        user = await create_establishment(payload)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Establishment ID already exists") from exc

    return EstablishmentSummary(
        id=user["id"],
        establishment_name=user["establishment_name"] or user["display_name"],
        whatsapp=user["whatsapp"] or "",
        parcel_number=user["parcel_number"],
        accommodation_name=user["accommodation_name"],
        address=user["address"],
        phone=user["phone"],
        units=user["units"],
        places=user["places"],
        accommodation_type=user["accommodation_type"],
    )


@app.put("/admin/establishments/{establishment_id}", response_model=EstablishmentSummary)
async def edit_establishment(
    establishment_id: str,
    payload: EstablishmentUpdate,
    _: User = Depends(require_admin),
) -> EstablishmentSummary:
    user = await update_establishment(establishment_id, payload)
    if not user:
        raise HTTPException(status_code=404, detail="Establishment not found")
    return EstablishmentSummary(
        id=user["id"],
        establishment_name=user["establishment_name"] or user["display_name"],
        whatsapp=user["whatsapp"] or "",
        parcel_number=user["parcel_number"],
        accommodation_name=user["accommodation_name"],
        address=user["address"],
        phone=user["phone"],
        units=user["units"],
        places=user["places"],
        accommodation_type=user["accommodation_type"],
    )


@app.delete("/admin/establishments/{establishment_id}", status_code=204)
async def remove_establishment(
    establishment_id: str,
    _: User = Depends(require_admin),
) -> None:
    deleted = await delete_establishment(establishment_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Establishment not found")


@app.get("/establishments/{establishment_id}/entries", response_model=list[OccupancyEntry])
async def establishment_entries(
    establishment_id: str,
    user: User = Depends(get_current_user),
) -> list[OccupancyEntry]:
    if user.role != UserRole.ADMIN and user.id != establishment_id:
        raise HTTPException(status_code=403, detail="Cannot read another establishment")
    return [OccupancyEntry(**entry) for entry in await list_entries(establishment_id)]


@app.post("/establishments/{establishment_id}/entries", response_model=OccupancyEntry)
async def save_entry(
    establishment_id: str,
    payload: OccupancyEntryCreate,
    user: User = Depends(get_current_user),
) -> OccupancyEntry:
    if user.role != UserRole.ADMIN and user.id != establishment_id:
        raise HTTPException(status_code=403, detail="Cannot write another establishment")
    try:
        entry = await upsert_occupancy_entry(establishment_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return OccupancyEntry(**entry)


@app.delete("/establishments/{establishment_id}/entries/{week_start}", status_code=204)
async def remove_entry(
    establishment_id: str,
    week_start: date,
    user: User = Depends(get_current_user),
) -> None:
    if user.role != UserRole.ADMIN and user.id != establishment_id:
        raise HTTPException(status_code=403, detail="Cannot delete another establishment entry")
    deleted = await delete_entry(establishment_id, week_start)
    if not deleted:
        raise HTTPException(status_code=404, detail="Entry not found")


@app.get("/admin/compliance", response_model=list[ComplianceStatus])
async def compliance(
    week_start: date,
    compliance_period: str = Query("week", pattern="^(week|fortnight|month)$"),
    _: User = Depends(require_admin),
) -> list[ComplianceStatus]:
    return await build_compliance_statuses(week_start, compliance_period)


def compliance_range(week_start: date, compliance_period: str) -> tuple[date, date]:
    if compliance_period == "month":
        start = date(week_start.year, week_start.month, 1)
        if week_start.month == 12:
            end = date(week_start.year + 1, 1, 1)
        else:
            end = date(week_start.year, week_start.month + 1, 1)
        return start, end
    if compliance_period == "fortnight":
        if week_start.day <= 15:
            return date(week_start.year, week_start.month, 1), date(week_start.year, week_start.month, 16)
        if week_start.month == 12:
            return date(week_start.year, 12, 16), date(week_start.year + 1, 1, 1)
        return date(week_start.year, week_start.month, 16), date(week_start.year, week_start.month + 1, 1)
    return week_start, week_start + timedelta(days=7)


async def build_compliance_statuses(week_start: date, compliance_period: str = "week") -> list[ComplianceStatus]:
    start, end = compliance_range(week_start, compliance_period)
    statuses: list[ComplianceStatus] = []
    for establishment in await list_establishments():
        entries = await list_entries_between(establishment["id"], start, end)
        missing_fields = []
        valid_entries = [
            entry for entry in entries
            if entry["occupied_places"] > 0 or entry["occupied_units"] > 0
        ]
        if not valid_entries:
            missing_fields = ["period_entries"]

        completed = len(missing_fields) == 0
        statuses.append(
            ComplianceStatus(
                establishment_id=establishment["id"],
                establishment_name=establishment["establishment_name"] or establishment["display_name"],
                whatsapp=establishment["whatsapp"],
                week_start=start,
                completed=completed,
                missing_fields=missing_fields,
                status="complete" if completed else "missing",
            )
        )
    return statuses


@app.post("/admin/whatsapp/reminders/{establishment_id}", response_model=WhatsAppSendResult)
async def send_establishment_reminder(
    establishment_id: str,
    week_start: date,
    _: User = Depends(require_admin),
) -> WhatsAppSendResult:
    establishment = await find_user(establishment_id)
    if not establishment or establishment["role"] != UserRole.ESTABLISHMENT:
        raise HTTPException(status_code=404, detail="Establishment not found")

    user = serialize_user(establishment)
    phone = user["phone"] or user["whatsapp"]
    message = build_reminder_message(user["establishment_name"] or user["display_name"], week_start.isoformat())
    result = await send_whatsapp_text(phone, message)
    return WhatsAppSendResult(
        establishment_id=user["id"],
        establishment_name=user["establishment_name"] or user["display_name"],
        to=result["to"],
        sent=result["sent"],
        dry_run=result["dry_run"],
        message=result["message"],
        detail=result["detail"],
    )


@app.post("/admin/whatsapp/reminders", response_model=WhatsAppBulkResult)
async def send_missing_reminders(
    week_start: date,
    compliance_period: str = Query("week", pattern="^(week|fortnight|month)$"),
    _: User = Depends(require_admin),
) -> WhatsAppBulkResult:
    statuses = await build_compliance_statuses(week_start, compliance_period)
    results: list[WhatsAppSendResult] = []
    for status in statuses:
        if status.completed:
            continue
        results.append(await send_establishment_reminder(status.establishment_id, week_start, _))
    return WhatsAppBulkResult(week_start=week_start, results=results)


@app.get("/admin/stats", response_model=StatsResponse)
async def stats(
    period: str = Query("monthly", pattern="^(establishment|yearly|monthly|weekend)$"),
    year: int | None = None,
    month: int | None = Query(None, ge=1, le=12),
    week_start: date | None = None,
    _: User = Depends(require_admin),
) -> StatsResponse:
    rows = await aggregate_stats(period, year, month)
    type_rows, weeks = await aggregate_type_stats(period, year, month, week_start)
    return StatsResponse(
        period=period,
        year=year,
        month=month,
        week_start=week_start,
        weeks=weeks,
        rows=rows,
        type_rows=type_rows,
    )
