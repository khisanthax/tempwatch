import sys
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.base import Base
from app.models import BackgroundWatchSample, TemperatureSample
from app.services.background_watch import BackgroundWatchService
from app.services.session_lifecycle import SessionLifecycleService


class StubMoonrakerClient:
    def __init__(self) -> None:
        self.calls = 0

    def fetch_temperature_snapshot(self, _printer):
        self.calls += 1
        return {
            "nozzle_actual": 212.5,
            "nozzle_target": 215.0,
            "bed_actual": 59.0,
            "bed_target": 60.0,
            "chamber_actual": 38.0,
            "heater_power": 0.72,
            "fan_speed": 0.35,
            "print_state": "printing",
            "raw_payload": '{"source":"stub"}',
        }


class BackgroundWatchRetentionTests(unittest.TestCase):
    def setUp(self) -> None:
        temp_root = Path(__file__).resolve().parent / ".tmp"
        temp_root.mkdir(exist_ok=True)
        self.db_path = temp_root / f"watch-retention-{uuid4().hex}.db"
        self.engine = create_engine(f"sqlite:///{self.db_path.resolve().as_posix()}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db: Session = self.session_factory()
        self.session_service = SessionLifecycleService(self.db)
        self.printer = self.session_service.create_printer(
            name="Retention Test Printer",
            base_url="http://printer.local",
            api_key=None,
            notes=None,
            is_enabled=True,
        )
        self.watch_service = BackgroundWatchService(self.db)
        self.config = self.watch_service.get_or_create_watch_config(self.printer)

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()
        if self.db_path.exists():
            self.db_path.unlink()

    def test_watch_samples_stay_separate_from_manual_session_samples(self) -> None:
        self.config.is_enabled = True
        self.db.add(self.config)
        self.db.commit()

        stub = StubMoonrakerClient()
        self.watch_service.moonraker = stub

        sample = self.watch_service.capture_watch_sample_if_due(self.config)

        self.assertIsNotNone(sample)
        self.assertEqual(stub.calls, 1)
        self.assertEqual(self._count_rows(BackgroundWatchSample), 1)
        self.assertEqual(self._count_rows(TemperatureSample), 0)

    def test_prune_all_watch_history_deletes_only_rows_older_than_retention_window(self) -> None:
        now = datetime.now(UTC)
        self.config.is_enabled = False
        self.config.retention_hours = 4
        self.db.add(self.config)
        self.db.commit()

        self._insert_watch_sample(captured_at=now - timedelta(hours=6))
        for minutes_ago in (180, 120, 60, 30, 15, 5):
            self._insert_watch_sample(captured_at=now - timedelta(minutes=minutes_ago))

        deleted = self.watch_service.prune_all_watch_history(reference_time=now, commit=True)
        remaining_samples = list(self.db.scalars(select(BackgroundWatchSample).order_by(BackgroundWatchSample.captured_at.asc())))

        self.assertEqual(deleted, 1)
        self.assertEqual(len(remaining_samples), 6)
        self.assertTrue(all(self._utc(sample.captured_at) >= now - timedelta(hours=4) for sample in remaining_samples))
        self.assertEqual(self._count_rows(TemperatureSample), 0)

    def test_retention_window_change_prunes_existing_watch_rows_immediately(self) -> None:
        now = datetime.now(UTC)
        self.config.is_enabled = True
        self.config.retention_hours = 8
        self.db.add(self.config)
        self.db.commit()

        self._insert_watch_sample(captured_at=now - timedelta(hours=6))
        self._insert_watch_sample(captured_at=now - timedelta(hours=2))

        updated_config = self.watch_service.update_watch_config(self.printer, retention_hours=4)
        remaining_samples = list(self.db.scalars(select(BackgroundWatchSample).order_by(BackgroundWatchSample.captured_at.asc())))

        self.assertEqual(updated_config.retention_hours, 4)
        self.assertEqual(len(remaining_samples), 1)
        self.assertTrue(self._utc(remaining_samples[0].captured_at) >= now - timedelta(hours=4))

    def test_restart_safe_polling_skips_duplicates_inside_watch_interval_and_resumes_after_interval(self) -> None:
        now = datetime.now(UTC)
        self.config.is_enabled = True
        self.db.add(self.config)
        self.db.commit()

        self._insert_watch_sample(captured_at=now - timedelta(seconds=1))
        stub = StubMoonrakerClient()
        self.watch_service.moonraker = stub

        skipped_sample = self.watch_service.capture_watch_sample_if_due(self.config, reference_time=now)
        self.assertIsNone(skipped_sample)
        self.assertEqual(stub.calls, 0)
        self.assertEqual(self._count_rows(BackgroundWatchSample), 1)

        latest_sample = self.db.scalar(select(BackgroundWatchSample).order_by(BackgroundWatchSample.captured_at.desc()).limit(1))
        latest_sample.captured_at = now - timedelta(seconds=3)
        self.db.add(latest_sample)
        self.db.commit()

        captured_sample = self.watch_service.capture_watch_sample_if_due(self.config, reference_time=now)
        self.assertIsNotNone(captured_sample)
        self.assertEqual(stub.calls, 1)
        self.assertEqual(self._count_rows(BackgroundWatchSample), 2)

    def _insert_watch_sample(self, *, captured_at: datetime) -> BackgroundWatchSample:
        sample = BackgroundWatchSample(
            printer_id=self.printer.id,
            captured_at=captured_at,
            nozzle_actual=210.0,
            nozzle_target=215.0,
            bed_actual=58.0,
            bed_target=60.0,
            chamber_actual=37.0,
            heater_power=0.68,
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

    @staticmethod
    def _utc(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


if __name__ == "__main__":
    unittest.main()
