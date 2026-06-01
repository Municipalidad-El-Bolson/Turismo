from datetime import date

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pymongo.errors import DuplicateKeyError

from .config import settings
from .database import close_database, connect_database
from .repositories import (
    aggregate_stats,
    create_establishment,
    ensure_indexes,
    find_admin_by_credentials,
    find_entry,
    find_user,
    list_entries,
    list_establishments,
    seed_demo_data,
    serialize_user,
    upsert_occupancy_entry,
)
from .schemas import (
    ComplianceStatus,
    EstablishmentCreate,
    EstablishmentSummary,
    LoginRequest,
    LoginResponse,
    OccupancyEntry,
    OccupancyEntryCreate,
    StatsResponse,
    User,
    UserRole,
)

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
    )


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


@app.get("/admin/compliance", response_model=list[ComplianceStatus])
async def compliance(
    week_start: date,
    _: User = Depends(require_admin),
) -> list[ComplianceStatus]:
    statuses: list[ComplianceStatus] = []
    for establishment in await list_establishments():
        entry = await find_entry(establishment["id"], week_start)
        missing_fields = []
        if not entry:
            missing_fields = ["occupied_places", "occupied_units"]
        elif entry["occupied_places"] == 0 and entry["occupied_units"] == 0:
            missing_fields = ["occupied_places", "occupied_units"]

        completed = len(missing_fields) == 0
        statuses.append(
            ComplianceStatus(
                establishment_id=establishment["id"],
                establishment_name=establishment["establishment_name"] or establishment["display_name"],
                whatsapp=establishment["whatsapp"],
                week_start=week_start,
                completed=completed,
                missing_fields=missing_fields,
                status="complete" if completed else "missing",
            )
        )
    return statuses


@app.get("/admin/stats", response_model=StatsResponse)
async def stats(
    period: str = Query("monthly", pattern="^(establishment|yearly|monthly|weekend)$"),
    year: int | None = None,
    month: int | None = Query(None, ge=1, le=12),
    _: User = Depends(require_admin),
) -> StatsResponse:
    rows = await aggregate_stats(period, year, month)
    return StatsResponse(period=period, rows=rows)
