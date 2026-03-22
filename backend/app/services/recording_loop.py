import asyncio
import logging

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.background_watch import BackgroundWatchService
from app.services.session_lifecycle import SessionLifecycleService

logger = logging.getLogger(__name__)
settings = get_settings()


class RecordingLoop:
    def __init__(self) -> None:
        self.interval_seconds = settings.recording_loop_interval_seconds

    async def run(self, stop_event: asyncio.Event) -> None:
        while not stop_event.is_set():
            await asyncio.to_thread(self.poll_once)
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=self.interval_seconds)
            except TimeoutError:
                continue

    def poll_once(self) -> None:
        db = SessionLocal()
        try:
            session_service = SessionLifecycleService(db)
            for session in session_service.list_active_sessions():
                try:
                    captured = session_service.capture_sample_if_due(session)
                    if captured is not None:
                        logger.debug("Captured sample for session %s", session.id)
                except Exception:
                    logger.exception("Failed to capture sample for session %s", session.id)
                    db.rollback()

            watch_service = BackgroundWatchService(db)
            for config in watch_service.list_enabled_watch_configs():
                try:
                    captured = watch_service.capture_watch_sample_if_due(config)
                    if captured is not None:
                        logger.debug("Captured watch sample for printer %s", config.printer_id)
                except Exception:
                    logger.exception("Failed to capture watch sample for printer %s", config.printer_id)
                    db.rollback()
        finally:
            db.close()
