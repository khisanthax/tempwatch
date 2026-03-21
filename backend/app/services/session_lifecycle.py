from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import PrinterProfile, RecordingSession, SessionStatus

settings = get_settings()


class SessionLifecycleService:
    def __init__(self, db: Session):
        self.db = db

    def list_printers(self) -> list[PrinterProfile]:
        stmt: Select[tuple[PrinterProfile]] = select(PrinterProfile).order_by(PrinterProfile.name.asc())
        return list(self.db.scalars(stmt))

    def get_printer(self, printer_id: int) -> PrinterProfile:
        printer = self.db.get(PrinterProfile, printer_id)
        if printer is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Printer not found")
        return printer

    def create_printer(self, *, name: str, base_url: str, api_key: str | None, notes: str | None, is_enabled: bool) -> PrinterProfile:
        printer = PrinterProfile(
            name=name.strip(),
            base_url=base_url.strip().rstrip("/"),
            api_key=api_key,
            notes=notes,
            is_enabled=is_enabled,
        )
        self.db.add(printer)
        self.db.commit()
        self.db.refresh(printer)
        return printer

    def update_printer(
        self,
        printer: PrinterProfile,
        *,
        name: str | None,
        base_url: str | None,
        api_key: str | None,
        notes: str | None,
        is_enabled: bool | None,
    ) -> PrinterProfile:
        if name is not None:
            printer.name = name.strip()
        if base_url is not None:
            printer.base_url = base_url.strip().rstrip("/")
        if api_key is not None:
            printer.api_key = api_key
        if notes is not None:
            printer.notes = notes
        if is_enabled is not None:
            printer.is_enabled = is_enabled

        self.db.add(printer)
        self.db.commit()
        self.db.refresh(printer)
        return printer

    def list_sessions(self, *, printer_id: int | None = None, status_filter: SessionStatus | None = None) -> list[RecordingSession]:
        stmt: Select[tuple[RecordingSession]] = select(RecordingSession).order_by(RecordingSession.started_at.desc())
        if printer_id is not None:
            stmt = stmt.where(RecordingSession.printer_id == printer_id)
        if status_filter is not None:
            stmt = stmt.where(RecordingSession.status == status_filter)
        return list(self.db.scalars(stmt))

    def start_session(self, *, printer: PrinterProfile, label: str | None = None) -> RecordingSession:
        if not printer.is_enabled:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Printer is disabled")

        active_stmt = select(RecordingSession).where(
            RecordingSession.printer_id == printer.id,
            RecordingSession.status == SessionStatus.ACTIVE,
        )
        existing = self.db.scalar(active_stmt)
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This printer already has an active recording session",
            )

        session = RecordingSession(printer_id=printer.id, label=label.strip() if label else None)
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return session

    def get_session(self, session_id: int) -> RecordingSession:
        session = self.db.get(RecordingSession, session_id)
        if session is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        return session

    def stop_session(self, session: RecordingSession, *, stop_reason: str | None = None) -> RecordingSession:
        if session.status != SessionStatus.ACTIVE:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only active sessions can be stopped")

        max_duration = timedelta(hours=settings.session_max_duration_hours)
        stop_time = datetime.now(UTC)
        if stop_time - session.started_at > max_duration:
            stop_reason = stop_reason or "max-duration-enforced"

        session.ended_at = stop_time
        session.stop_reason = stop_reason
        session.status = SessionStatus.COMPLETED
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return session

    def save_session(self, session: RecordingSession, *, save_notes: str | None = None) -> RecordingSession:
        if session.status != SessionStatus.COMPLETED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only completed sessions can be saved")

        session.status = SessionStatus.SAVED
        session.save_notes = save_notes
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return session

    def discard_session(self, session: RecordingSession) -> RecordingSession:
        if session.status not in {SessionStatus.COMPLETED, SessionStatus.SAVED}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only completed or saved sessions can be discarded")

        session.status = SessionStatus.DISCARDED
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return session
