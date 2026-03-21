from collections.abc import Generator
from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class SessionStatus(StrEnum):
    ACTIVE = "active"
    COMPLETED = "completed"
    SAVED = "saved"
    DISCARDED = "discarded"


class PrinterProfile(TimestampMixin, Base):
    __tablename__ = "printer_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    base_url: Mapped[str] = mapped_column(String(255), nullable=False)
    api_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    sessions: Mapped[list["RecordingSession"]] = relationship(back_populates="printer", cascade="all, delete-orphan")


class RecordingSession(TimestampMixin, Base):
    __tablename__ = "recording_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    printer_id: Mapped[int] = mapped_column(ForeignKey("printer_profiles.id"), nullable=False, index=True)
    label: Mapped[str | None] = mapped_column(String(160), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default=SessionStatus.ACTIVE, nullable=False, index=True)
    stop_reason: Mapped[str | None] = mapped_column(String(80), nullable=True)
    save_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    printer: Mapped[PrinterProfile] = relationship(back_populates="sessions")
    samples: Mapped[list["TemperatureSample"]] = relationship(back_populates="session", cascade="all, delete-orphan")
    thermal_events: Mapped[list["ThermalEvent"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class TemperatureSample(TimestampMixin, Base):
    __tablename__ = "temperature_samples"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("recording_sessions.id"), nullable=False, index=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False, index=True)
    nozzle_actual: Mapped[float | None] = mapped_column(Float, nullable=True)
    nozzle_target: Mapped[float | None] = mapped_column(Float, nullable=True)
    bed_actual: Mapped[float | None] = mapped_column(Float, nullable=True)
    bed_target: Mapped[float | None] = mapped_column(Float, nullable=True)
    chamber_actual: Mapped[float | None] = mapped_column(Float, nullable=True)
    heater_power: Mapped[float | None] = mapped_column(Float, nullable=True)
    fan_speed: Mapped[float | None] = mapped_column(Float, nullable=True)
    print_state: Mapped[str | None] = mapped_column(String(80), nullable=True)
    source: Mapped[str] = mapped_column(String(32), default="moonraker-http", nullable=False)
    raw_payload: Mapped[str | None] = mapped_column(Text, nullable=True)

    session: Mapped[RecordingSession] = relationship(back_populates="samples")


class ThermalEvent(TimestampMixin, Base):
    __tablename__ = "thermal_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("recording_sessions.id"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    event_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False, index=True)
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    session: Mapped[RecordingSession] = relationship(back_populates="thermal_events")
