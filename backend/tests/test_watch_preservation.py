import sys
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.base import Base
from app.models import (
    BackgroundWatchSample,
    PreservedWatchCapture,
    PreservedWatchCaptureStatus,
    PreservedWatchSample,
)
from app.services.background_watch import BackgroundWatchService
from app.services.session_lifecycle import SessionLifecycleService
from app.services.watch_preservation import WatchPreservationService


class WatchPreservationTests(unittest.TestCase):
    def setUp(self) -> None:
        temp_root = Path(__file__).resolve().parent / ".tmp"
        temp_root.mkdir(exist_ok=True)
        self.db_path = temp_root / f"watch-preservation-{uuid4().hex}.db"
        self.engine = create_engine(f"sqlite:///{self.db_path.resolve().as_posix()}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db: Session = self.session_factory()
        self.session_service = SessionLifecycleService(self.db)
        self.printer = self.session_service.create_printer(
            name=f"Preservation Test {uuid4().hex[:8]}",
            base_url=f"http://printer-{uuid4().hex[:8]}.local",
            api_key=None,
            notes=None,
            is_enabled=True,
        )
        self.watch_service = BackgroundWatchService(self.db)
        self.preservation_service = WatchPreservationService(self.db)
        self.config = self.watch_service.get_or_create_watch_config(self.printer)
        self.config.is_enabled = True
        self.db.add(self.config)
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()
        if self.db_path.exists():
            self.db_path.unlink()

    def test_nozzle_drop_trigger_creates_preserved_capture_and_survives_watch_pruning(self) -> None:
        trigger_time = datetime.now(UTC)
        self._insert_watch_sample(captured_at=trigger_time - timedelta(minutes=10), nozzle_actual=212.0, nozzle_target=215.0)
        trigger_sample = self._insert_watch_sample(captured_at=trigger_time, nozzle_actual=194.0, nozzle_target=215.0)

        capture = self.preservation_service.process_watch_sample(self.printer, trigger_sample)
        captures = self.preservation_service.list_captures(printer_id=self.printer.id)

        self.assertIsNotNone(capture)
        self.assertEqual(len(captures), 1)
        self.assertEqual(captures[0].trigger_rule, "watch-nozzle-drop")
        self.assertEqual(captures[0].status, PreservedWatchCaptureStatus.COLLECTING)
        self.assertEqual(self._count_rows(PreservedWatchSample), 2)
        self.assertEqual(self._count_rows(BackgroundWatchSample), 2)

        deleted = self.watch_service.prune_all_watch_history(reference_time=trigger_time + timedelta(hours=6), commit=True)
        self.assertEqual(deleted, 2)
        self.assertEqual(self._count_rows(BackgroundWatchSample), 0)
        self.assertEqual(self._count_rows(PreservedWatchSample), 2)
        self.assertEqual(self._count_rows(PreservedWatchCapture), 1)

    def test_sustained_gap_trigger_collects_post_trigger_samples_and_finalizes(self) -> None:
        base_time = datetime.now(UTC)
        for index, actual in enumerate((202.0, 201.0, 200.0)):
            sample = self._insert_watch_sample(
                captured_at=base_time + timedelta(seconds=index * 2),
                nozzle_actual=actual,
                nozzle_target=220.0,
            )
            capture = self.preservation_service.process_watch_sample(self.printer, sample)

        self.assertIsNotNone(capture)
        self.assertEqual(capture.trigger_rule, "watch-nozzle-gap")
        self.assertEqual(self._count_rows(PreservedWatchSample), 3)

        post_trigger_sample = self._insert_watch_sample(
            captured_at=base_time + timedelta(minutes=10),
            nozzle_actual=199.5,
            nozzle_target=220.0,
        )
        self.preservation_service.process_watch_sample(self.printer, post_trigger_sample)

        capture = self.preservation_service.get_capture(capture.id)
        self.assertEqual(capture.sample_count, 4)

        finalized = self.preservation_service.finalize_due_captures(reference_time=base_time + timedelta(minutes=41))
        capture = self.preservation_service.get_capture(capture.id)

        self.assertEqual(finalized, 1)
        self.assertEqual(capture.status, PreservedWatchCaptureStatus.FINALIZED)
        self.assertIsNotNone(capture.finalized_at)

    def _insert_watch_sample(
        self,
        *,
        captured_at: datetime,
        nozzle_actual: float,
        nozzle_target: float,
        bed_actual: float = 60.0,
        bed_target: float = 60.0,
    ) -> BackgroundWatchSample:
        sample = BackgroundWatchSample(
            printer_id=self.printer.id,
            captured_at=captured_at,
            nozzle_actual=nozzle_actual,
            nozzle_target=nozzle_target,
            bed_actual=bed_actual,
            bed_target=bed_target,
            chamber_actual=35.0,
            heater_power=0.8,
            fan_speed=0.25,
            print_state="printing",
            source="test-watch",
            raw_payload='{"source":"test"}',
        )
        self.db.add(sample)
        self.db.commit()
        self.db.refresh(sample)
        return sample

    def _count_rows(self, model) -> int:
        return len(list(self.db.scalars(select(model))))


if __name__ == "__main__":
    unittest.main()
