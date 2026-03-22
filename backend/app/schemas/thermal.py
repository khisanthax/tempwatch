from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import SessionStatus


def serialize_utc_datetime(value: datetime) -> str:
    normalized = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    return normalized.isoformat().replace("+00:00", "Z")


class ReadModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, json_encoders={datetime: serialize_utc_datetime})


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


class PrinterRead(ReadModel, PrinterBase):
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


class SessionRead(ReadModel):
    id: int
    printer_id: int
    label: str | None
    started_at: datetime
    ended_at: datetime | None
    status: SessionStatus
    stop_reason: str | None
    save_notes: str | None
    sample_count: int = 0
    created_at: datetime
    updated_at: datetime


class TemperatureSampleRead(ReadModel):
    id: int
    session_id: int
    captured_at: datetime
    nozzle_actual: float | None
    nozzle_target: float | None
    bed_actual: float | None
    bed_target: float | None
    chamber_actual: float | None
    heater_power: float | None
    fan_speed: float | None
    print_state: str | None
    source: str
    raw_payload: str | None
    created_at: datetime
    updated_at: datetime


class ThermalEventRead(ReadModel):
    id: int
    session_id: int
    event_type: str
    message: str
    event_time: datetime
    metadata_json: str | None
    created_at: datetime
    updated_at: datetime


class SessionCaptureResponse(ReadModel):
    session: SessionRead
    sample: TemperatureSampleRead
