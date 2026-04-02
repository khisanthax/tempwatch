from datetime import UTC, datetime

from sqlalchemy import Select, select
from sqlalchemy.orm import Session, joinedload

from app.integrations.moonraker import MoonrakerClient
from app.models import PrinterProfile, RecordingSession, SessionStatus, SmartWatchConfig, SmartWatchSession
from app.services.session_lifecycle import SessionLifecycleService

ACTIVE_PRINT_STATES = {"printing", "paused"}
TERMINAL_STATE_STOP_REASONS = {
    "complete": "smart-watch-completed",
    "completed": "smart-watch-completed",
    "cancelled": "smart-watch-canceled",
    "canceled": "smart-watch-canceled",
    "error": "smart-watch-error",
    "shutdown": "smart-watch-shutdown",
}
DEFAULT_SMART_SESSION_LABEL = "Smart Watch print"


class SmartWatchService:
    def __init__(self, db: Session):
        self.db = db
        self.moonraker = MoonrakerClient()
        self.session_service = SessionLifecycleService(db)

    def get_or_create_config(self, printer: PrinterProfile) -> SmartWatchConfig:
        config = printer.smart_watch_config
        if config is not None:
            return config

        config = SmartWatchConfig(printer_id=printer.id, is_enabled=False)
        printer.smart_watch_config = config
        self.db.add(config)
        self.db.commit()
        self.db.refresh(config)
        self.db.refresh(printer)
        return config

    def update_config(self, printer: PrinterProfile, *, is_enabled: bool | None = None) -> SmartWatchConfig:
        config = self.get_or_create_config(printer)
        if is_enabled is not None:
            config.is_enabled = is_enabled

        self.db.add(config)
        self.db.commit()
        self.db.refresh(config)
        return config

    def list_enabled_configs(self) -> list[SmartWatchConfig]:
        stmt: Select[tuple[SmartWatchConfig]] = (
            select(SmartWatchConfig)
            .options(joinedload(SmartWatchConfig.printer))
            .where(SmartWatchConfig.is_enabled.is_(True))
            .order_by(SmartWatchConfig.printer_id.asc())
        )
        return list(self.db.scalars(stmt).unique())

    def poll_printer(self, config: SmartWatchConfig) -> RecordingSession | None:
        printer = config.printer or self.db.get(PrinterProfile, config.printer_id)
        if printer is None or not config.is_enabled or not printer.is_enabled:
            return None

        status_snapshot = self.moonraker.fetch_print_status(printer)
        current_state = self._normalize_state(status_snapshot.get("state"))
        current_filename = self._normalize_text(status_snapshot.get("filename"))
        previous_state = self._normalize_state(config.last_observed_state)
        previous_filename = self._normalize_text(config.last_observed_filename)
        print_key = self._build_print_key(current_filename, current_state)

        active_run = self.get_active_run(printer.id)
        result: RecordingSession | None = None

        if active_run is not None:
            result = self._handle_active_run(active_run, current_state=current_state, current_filename=current_filename)
        else:
            result = self._handle_idle_run(
                printer,
                config,
                current_state=current_state,
                current_filename=current_filename,
                previous_state=previous_state,
                previous_filename=previous_filename,
                print_key=print_key,
            )

        if current_state not in ACTIVE_PRINT_STATES:
            config.suppressed_print_key = None

        config.last_observed_state = current_state
        config.last_observed_filename = current_filename
        self.db.add(config)
        self.db.commit()
        self.db.refresh(config)
        return result

    def get_active_run(self, printer_id: int) -> SmartWatchSession | None:
        stmt: Select[tuple[SmartWatchSession]] = (
            select(SmartWatchSession)
            .options(joinedload(SmartWatchSession.session))
            .where(
                SmartWatchSession.printer_id == printer_id,
                SmartWatchSession.session.has(RecordingSession.status == SessionStatus.ACTIVE),
            )
            .limit(1)
        )
        return self.db.scalar(stmt)

    def _handle_active_run(
        self,
        run: SmartWatchSession,
        *,
        current_state: str | None,
        current_filename: str | None,
    ) -> RecordingSession | None:
        session = run.session
        if session is None or session.status != SessionStatus.ACTIVE:
            return None

        if current_filename and run.print_filename != current_filename:
            run.print_filename = current_filename

        if current_state in ACTIVE_PRINT_STATES:
            if run.last_state != current_state:
                if current_state == "paused":
                    self.session_service.record_event(
                        session,
                        event_type="smart-watch-paused",
                        message="Smart Watch observed the print pause and kept the session active",
                        metadata={"print_filename": run.print_filename, "state": current_state},
                    )
                elif run.last_state == "paused" and current_state == "printing":
                    self.session_service.record_event(
                        session,
                        event_type="smart-watch-resumed",
                        message="Smart Watch observed the print resume and continued the same session",
                        metadata={"print_filename": run.print_filename, "state": current_state},
                    )
            run.last_state = current_state
            self.db.add(run)
            return session

        stop_reason = TERMINAL_STATE_STOP_REASONS.get(current_state or "", "smart-watch-ended")
        stopped_session = self.session_service.stop_session(session, stop_reason=stop_reason)
        saved_session = self.session_service.save_session(stopped_session)
        run.last_state = current_state
        run.terminal_state = current_state
        self.db.add(run)
        self.session_service.record_event(
            saved_session,
            event_type="smart-watch-finalized",
            message=f"Smart Watch auto-saved this print session after {current_state or 'print end'}",
            metadata={"print_filename": run.print_filename, "terminal_state": current_state},
        )
        return saved_session

    def _handle_idle_run(
        self,
        printer: PrinterProfile,
        config: SmartWatchConfig,
        *,
        current_state: str | None,
        current_filename: str | None,
        previous_state: str | None,
        previous_filename: str | None,
        print_key: str | None,
    ) -> RecordingSession | None:
        if current_state not in ACTIVE_PRINT_STATES:
            return None

        active_session = self.session_service.get_active_session_for_printer(printer.id)
        if active_session is not None:
            if print_key and config.suppressed_print_key != print_key:
                config.suppressed_print_key = print_key
                self.session_service.record_event(
                    active_session,
                    event_type="smart-watch-start-skipped",
                    message="Smart Watch skipped auto-start because this printer already had an active session",
                    metadata={"print_filename": current_filename, "state": current_state},
                )
            return active_session

        if print_key and config.suppressed_print_key == print_key:
            return None

        started_via_recovery = previous_state in ACTIVE_PRINT_STATES
        label = self._build_session_label(current_filename, started_via_recovery=started_via_recovery)
        session = self.session_service.start_session(printer=printer, label=label)
        run = SmartWatchSession(
            printer_id=printer.id,
            session_id=session.id,
            print_filename=current_filename,
            started_state=current_state,
            last_state=current_state,
            started_via_recovery=started_via_recovery,
        )
        self.db.add(run)
        self.session_service.record_event(
            session,
            event_type="smart-watch-started",
            message="Smart Watch automatically started this session from print lifecycle detection",
            metadata={
                "print_filename": current_filename,
                "state": current_state,
                "started_via_recovery": started_via_recovery,
            },
        )
        return session

    @staticmethod
    def _normalize_state(value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        return normalized or None

    @staticmethod
    def _normalize_text(value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @staticmethod
    def _build_print_key(filename: str | None, state: str | None) -> str | None:
        if filename:
            return filename
        if state in ACTIVE_PRINT_STATES:
            return f"active:{state}"
        return None

    @staticmethod
    def _build_session_label(filename: str | None, *, started_via_recovery: bool) -> str:
        if filename:
            prefix = "Smart Watch recovery" if started_via_recovery else "Smart Watch"
            return f"{prefix}: {filename}"
        suffix = "recovery" if started_via_recovery else "session"
        timestamp = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
        return f"{DEFAULT_SMART_SESSION_LABEL} ({suffix}, {timestamp})"
