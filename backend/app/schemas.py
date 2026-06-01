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


class LoginRequest(BaseModel):
    user_id: str = Field(min_length=1)


class LoginResponse(BaseModel):
    user: User


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


class StatsResponse(BaseModel):
    period: str
    rows: list[StatsRow]
