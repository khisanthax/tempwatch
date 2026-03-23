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


class PreservedWatchCaptureStatus(StrEnum):
    COLLECTING = "collecting"
    FINALIZED = "finalized"


class PrinterProfile(TimestampMixin, Base):
    __tablename__ = "printer_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    base_url: Mapped[str] = mapped_column(String(255), nullable=False)
    api_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    sessions: Mapped[list["RecordingSession"]] = relationship(back_populates="printer", cascade="all, delete-orphan")
    watch_config: Mapped["BackgroundWatchConfig | None"] = relationship(
        back_populates="printer",
        cascade="all, delete-orphan",
        uselist=False,
    )
    watch_samples: Mapped[list["BackgroundWatchSample"]] = relationship(back_populates="printer", cascade="all, delete-orphan")
    preserved_watch_captures: Mapped[list["PreservedWatchCapture"]] = relationship(
        back_populates="printer",
        cascade="all, delete-orphan",
    )


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


class BackgroundWatchConfig(TimestampMixin, Base):
    __tablename__ = "background_watch_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    printer_id: Mapped[int] = mapped_column(ForeignKey("printer_profiles.id"), nullable=False, unique=True, index=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    retention_hours: Mapped[int] = mapped_column(Integer, default=4, nullable=False)

    printer: Mapped[PrinterProfile] = relationship(back_populates="watch_config")


class BackgroundWatchSample(TimestampMixin, Base):
    __tablename__ = "background_watch_samples"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    printer_id: Mapped[int] = mapped_column(ForeignKey("printer_profiles.id"), nullable=False, index=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False, index=True)
    nozzle_actual: Mapped[float | None] = mapped_column(Float, nullable=True)
    nozzle_target: Mapped[float | None] = mapped_column(Float, nullable=True)
    bed_actual: Mapped[float | None] = mapped_column(Float, nullable=True)
    bed_target: Mapped[float | None] = mapped_column(Float, nullable=True)
    chamber_actual: Mapped[float | None] = mapped_column(Float, nullable=True)
    heater_power: Mapped[float | None] = mapped_column(Float, nullable=True)
    fan_speed: Mapped[float | None] = mapped_column(Float, nullable=True)
    print_state: Mapped[str | None] = mapped_column(String(80), nullable=True)
    source: Mapped[str] = mapped_column(String(32), default="moonraker-http-watch", nullable=False)
    raw_payload: Mapped[str | None] = mapped_column(Text, nullable=True)

    printer: Mapped[PrinterProfile] = relationship(back_populates="watch_samples")


class PreservedWatchCapture(TimestampMixin, Base):
    __tablename__ = "preserved_watch_captures"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    printer_id: Mapped[int] = mapped_column(ForeignKey("printer_profiles.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), default=PreservedWatchCaptureStatus.COLLECTING, nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(48), default="background-watch-trigger", nullable=False)
    trigger_rule: Mapped[str] = mapped_column(String(80), nullable=False)
    trigger_reason: Mapped[str] = mapped_column(Text, nullable=False)
    trigger_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    capture_start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    capture_end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    printer: Mapped[PrinterProfile] = relationship(back_populates="preserved_watch_captures")
    samples: Mapped[list["PreservedWatchSample"]] = relationship(back_populates="capture", cascade="all, delete-orphan")
    trigger_events: Mapped[list["PreservedWatchTriggerEvent"]] = relationship(back_populates="capture", cascade="all, delete-orphan")


class PreservedWatchSample(TimestampMixin, Base):
    __tablename__ = "preserved_watch_samples"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    capture_id: Mapped[int] = mapped_column(ForeignKey("preserved_watch_captures.id"), nullable=False, index=True)
    source_watch_sample_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    nozzle_actual: Mapped[float | None] = mapped_column(Float, nullable=True)
    nozzle_target: Mapped[float | None] = mapped_column(Float, nullable=True)
    bed_actual: Mapped[float | None] = mapped_column(Float, nullable=True)
    bed_target: Mapped[float | None] = mapped_column(Float, nullable=True)
    chamber_actual: Mapped[float | None] = mapped_column(Float, nullable=True)
    heater_power: Mapped[float | None] = mapped_column(Float, nullable=True)
    fan_speed: Mapped[float | None] = mapped_column(Float, nullable=True)
    print_state: Mapped[str | None] = mapped_column(String(80), nullable=True)
    source: Mapped[str] = mapped_column(String(48), default="preserved-watch-copy", nullable=False)
    raw_payload: Mapped[str | None] = mapped_column(Text, nullable=True)

    capture: Mapped[PreservedWatchCapture] = relationship(back_populates="samples")


class PreservedWatchTriggerEvent(TimestampMixin, Base):
    __tablename__ = "preserved_watch_trigger_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    capture_id: Mapped[int] = mapped_column(ForeignKey("preserved_watch_captures.id"), nullable=False, index=True)
    event_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    trigger_rule: Mapped[str] = mapped_column(String(80), nullable=False)
    trigger_reason: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    capture: Mapped[PreservedWatchCapture] = relationship(back_populates="trigger_events")
