import sys
import unittest
from pathlib import Path
from uuid import uuid4

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.base import Base
from app.models import RecordingSession, SessionStatus, SmartWatchSession, ThermalEvent
from app.services.session_lifecycle import SessionLifecycleService
from app.services.smart_watch import SmartWatchService


class StubMoonrakerClient:
    def __init__(self, statuses: list[dict[str, str | None]]) -> None:
        self._statuses = list(statuses)
        self.calls = 0

    def fetch_print_status(self, _printer):
        self.calls += 1
        if not self._statuses:
            raise AssertionError("No more stub print states available")
        return self._statuses.pop(0)


class SmartWatchTests(unittest.TestCase):
    def setUp(self) -> None:
        temp_root = Path(__file__).resolve().parent / ".tmp"
        temp_root.mkdir(exist_ok=True)
        self.db_path = temp_root / f"smart-watch-{uuid4().hex}.db"
        self.engine = create_engine(f"sqlite:///{self.db_path.resolve().as_posix()}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db: Session = self.session_factory()
        self.session_service = SessionLifecycleService(self.db)
        self.printer = self.session_service.create_printer(
            name=f"Smart Watch {uuid4().hex[:8]}",
            base_url=f"http://smart-watch-{uuid4().hex[:8]}.local",
            api_key=None,
            notes=None,
            is_enabled=True,
        )
        self.smart_watch_service = SmartWatchService(self.db)
        self.config = self.smart_watch_service.get_or_create_config(self.printer)
        self.config.is_enabled = True
        self.db.add(self.config)
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()
        if self.db_path.exists():
            self.db_path.unlink()

    def test_print_start_auto_creates_session_and_completion_auto_saves(self) -> None:
        self.smart_watch_service.moonraker = StubMoonrakerClient(
            [
                {"state": "printing", "filename": "cube.gcode", "message": None},
                {"state": "complete", "filename": "cube.gcode", "message": None},
            ]
        )

        started_session = self.smart_watch_service.poll_printer(self.config)
        self.assertIsNotNone(started_session)
        self.assertEqual(started_session.status, SessionStatus.ACTIVE)

        finalized_session = self.smart_watch_service.poll_printer(self.config)
        self.assertIsNotNone(finalized_session)
        self.assertEqual(finalized_session.status, SessionStatus.SAVED)
        self.assertEqual(finalized_session.stop_reason, "smart-watch-completed")

        sessions = list(self.db.scalars(select(RecordingSession).order_by(RecordingSession.id.asc())))
        self.assertEqual(len(sessions), 1)
        self.assertEqual(sessions[0].status, SessionStatus.SAVED)
        smart_run = self.db.scalar(select(SmartWatchSession).where(SmartWatchSession.session_id == sessions[0].id))
        self.assertIsNotNone(smart_run)
        self.assertEqual(smart_run.print_filename, "cube.gcode")
        self.assertEqual(smart_run.terminal_state, "complete")

    def test_pause_and_resume_keep_same_session_active(self) -> None:
        self.smart_watch_service.moonraker = StubMoonrakerClient(
            [
                {"state": "printing", "filename": "benchy.gcode", "message": None},
                {"state": "paused", "filename": "benchy.gcode", "message": None},
                {"state": "printing", "filename": "benchy.gcode", "message": None},
            ]
        )

        first_session = self.smart_watch_service.poll_printer(self.config)
        paused_session = self.smart_watch_service.poll_printer(self.config)
        resumed_session = self.smart_watch_service.poll_printer(self.config)

        self.assertEqual(first_session.id, paused_session.id)
        self.assertEqual(first_session.id, resumed_session.id)
        self.assertEqual(resumed_session.status, SessionStatus.ACTIVE)
        self.assertEqual(len(list(self.db.scalars(select(RecordingSession)))), 1)

        event_types = [event.event_type for event in self.db.scalars(select(ThermalEvent).order_by(ThermalEvent.id.asc()))]
        self.assertIn("smart-watch-paused", event_types)
        self.assertIn("smart-watch-resumed", event_types)

    def test_existing_manual_session_blocks_duplicate_smart_watch_session(self) -> None:
        manual_session = self.session_service.start_session(printer=self.printer, label="Manual diagnostic")
        self.smart_watch_service.moonraker = StubMoonrakerClient(
            [{"state": "printing", "filename": "manual-block.gcode", "message": None}]
        )

        returned_session = self.smart_watch_service.poll_printer(self.config)

        self.assertIsNotNone(returned_session)
        self.assertEqual(returned_session.id, manual_session.id)
        self.assertEqual(self._count_rows(RecordingSession), 1)
        self.assertEqual(self._count_rows(SmartWatchSession), 0)

        manual_events = [
            event.event_type
            for event in self.db.scalars(select(ThermalEvent).where(ThermalEvent.session_id == manual_session.id).order_by(ThermalEvent.id.asc()))
        ]
        self.assertIn("smart-watch-start-skipped", manual_events)

    def test_existing_active_smart_session_prevents_duplicate_session_creation(self) -> None:
        self.smart_watch_service.moonraker = StubMoonrakerClient(
            [
                {"state": "printing", "filename": "repeat.gcode", "message": None},
                {"state": "printing", "filename": "repeat.gcode", "message": None},
            ]
        )

        first_session = self.smart_watch_service.poll_printer(self.config)
        second_session = self.smart_watch_service.poll_printer(self.config)

        self.assertEqual(first_session.id, second_session.id)
        self.assertEqual(self._count_rows(RecordingSession), 1)
        self.assertEqual(self._count_rows(SmartWatchSession), 1)

    def _count_rows(self, model) -> int:
        return len(list(self.db.scalars(select(model))))


if __name__ == "__main__":
    unittest.main()
