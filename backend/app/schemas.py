from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class UserRole(StrEnum):
    ESTABLISHMENT = "establishment"
    ADMIN = "admin"


class User(BaseModel):
    id: str
    role: UserRole
    display_name: str
    whatsapp: str | None = None
    establishment_name: str | None = None
    parcel_number: str | None = None
    accommodation_name: str | None = None
    address: str | None = None
    phone: str | None = None
    units: int | None = None
    places: int | None = None
    accommodation_type: str | None = None
    temporary_leave_start: date | None = None
    temporary_leave_end: date | None = None


class LoginRequest(BaseModel):
    user_id: str | None = None
    username: str | None = None
    password: str | None = None


class LoginResponse(BaseModel):
    user: User


class EstablishmentCreate(BaseModel):
    parcel_number: str = Field(min_length=1)
    accommodation_name: str = Field(min_length=2)
    address: str = Field(min_length=3)
    phone: str = Field(min_length=6)
    units: int | None = Field(default=None, ge=0)
    places: int | None = Field(default=None, ge=0)
    accommodation_type: str | None = None
    temporary_leave_start: date | None = None
    temporary_leave_end: date | None = None


class EstablishmentUpdate(BaseModel):
    parcel_number: str = Field(min_length=1)
    accommodation_name: str = Field(min_length=2)
    address: str = Field(min_length=3)
    phone: str = Field(min_length=6)
    units: int | None = Field(default=None, ge=0)
    places: int | None = Field(default=None, ge=0)
    accommodation_type: str | None = None
    temporary_leave_start: date | None = None
    temporary_leave_end: date | None = None


class OccupancyEntryCreate(BaseModel):
    week_start: date
    occupied_places: int = Field(ge=0)
    occupied_units: int = Field(ge=0)
    notes: str | None = None


class OccupancyEntry(OccupancyEntryCreate):
    id: str
    establishment_id: str
    establishment_name: str
    created_at: datetime
    updated_at: datetime


class EstablishmentSummary(BaseModel):
    id: str
    establishment_name: str
    whatsapp: str
    parcel_number: str | None = None
    accommodation_name: str | None = None
    address: str | None = None
    phone: str | None = None
    units: int | None = None
    places: int | None = None
    accommodation_type: str | None = None
    temporary_leave_start: date | None = None
    temporary_leave_end: date | None = None


class ComplianceStatus(BaseModel):
    establishment_id: str
    establishment_name: str
    whatsapp: str | None = None
    week_start: date
    completed: bool
    missing_fields: list[str]
    status: str


class StatsRow(BaseModel):
    label: str
    occupied_places: int
    occupied_units: int
    entries: int


class TypeStatsRow(BaseModel):
    accommodation_type: str
    establishments: int
    participant_establishments: int
    participation_percent: float
    expected_responses: int
    response_count: int
    missing_responses: int
    response_rate_percent: float
    occupied_places: int
    available_places: int
    respondent_available_places: int
    occupancy_rate_percent: float
    occupied_units: int
    available_units: int
    respondent_available_units: int
    unit_occupancy_percent: float


class StatsResponse(BaseModel):
    period: str
    year: int | None = None
    month: int | None = None
    week_start: date | None = None
    range_start: date | None = None
    range_end: date | None = None
    weeks: int = 1
    rows: list[StatsRow]
    type_rows: list[TypeStatsRow] = Field(default_factory=list)


class StatsAvailability(BaseModel):
    years: list[int]
    months_by_year: dict[str, list[int]]


class WhatsAppSendResult(BaseModel):
    establishment_id: str
    establishment_name: str
    to: str
    sent: bool
    dry_run: bool
    message: str
    detail: object | None = None


class WhatsAppBulkResult(BaseModel):
    week_start: date
    results: list[WhatsAppSendResult]
