from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import SessionStatus


class PrinterBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    base_url: str = Field(min_length=1, max_length=255)
    api_key: str | None = Field(default=None, max_length=255)
    notes: str | None = None
    is_enabled: bool = True


class PrinterCreate(PrinterBase):
    pass


class PrinterUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    base_url: str | None = Field(default=None, min_length=1, max_length=255)
    api_key: str | None = Field(default=None, max_length=255)
    notes: str | None = None
    is_enabled: bool | None = None


class PrinterRead(PrinterBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class PrinterConnectionCheckRead(BaseModel):
    printer_id: int
    reachable: bool
    status_code: int | None
    message: str
    moonraker_version: str | None
    klippy_state: str | None


class SessionStartRequest(BaseModel):
    label: str | None = Field(default=None, max_length=160)


class SessionStopRequest(BaseModel):
    stop_reason: str | None = Field(default=None, max_length=80)


class SessionDispositionRequest(BaseModel):
    save_notes: str | None = None


class SessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    printer_id: int
    label: str | None
    started_at: datetime
    ended_at: datetime | None
    status: SessionStatus
    stop_reason: str | None
    save_notes: str | None
    created_at: datetime
    updated_at: datetime
