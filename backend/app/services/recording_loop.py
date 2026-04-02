import asyncio
import logging

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.background_watch import BackgroundWatchService
from app.services.session_lifecycle import SessionLifecycleService
from app.services.smart_watch import SmartWatchService
from app.services.watch_preservation import WatchPreservationService

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
            preservation_service = WatchPreservationService(db)
            try:
                pruned_count = watch_service.prune_all_watch_history(commit=True)
                if pruned_count > 0:
                    logger.debug("Pruned %s stale watch samples", pruned_count)
            except Exception:
                logger.exception("Failed to prune stale watch samples")
                db.rollback()

            for config in watch_service.list_enabled_watch_configs():
                try:
                    captured = watch_service.capture_watch_sample_if_due(config)
                    if captured is not None:
                        printer = config.printer or session_service.get_printer(config.printer_id)
                        preserved = preservation_service.process_watch_sample(printer, captured)
                        logger.debug("Captured watch sample for printer %s", config.printer_id)
                        if preserved is not None:
                            logger.debug("Preserved watch capture %s for printer %s", preserved.id, config.printer_id)
                except Exception:
                    logger.exception("Failed to capture watch sample for printer %s", config.printer_id)
                    db.rollback()

            smart_watch_service = SmartWatchService(db)
            for config in smart_watch_service.list_enabled_configs():
                try:
                    session = smart_watch_service.poll_printer(config)
                    if session is not None:
                        logger.debug("Processed smart watch lifecycle for printer %s", config.printer_id)
                except Exception:
                    logger.exception("Failed to process smart watch for printer %s", config.printer_id)
                    db.rollback()

            try:
                finalized_count = preservation_service.finalize_due_captures()
                if finalized_count > 0:
                    logger.debug("Finalized %s preserved watch captures", finalized_count)
            except Exception:
                logger.exception("Failed to finalize preserved watch captures")
                db.rollback()
        finally:
            db.close()
