from collections.abc import Generator
from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
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
