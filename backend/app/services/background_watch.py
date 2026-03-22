import json
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import Select, delete, desc, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.integrations.moonraker import MoonrakerClient
from app.models import BackgroundWatchConfig, BackgroundWatchSample, PrinterProfile, RecordingSession, SessionStatus, TemperatureSample, ThermalEvent
from app.services.session_lifecycle import DEFAULT_WATCH_RETENTION_HOURS

settings = get_settings()
VALID_RETENTION_HOURS = {4, 8, 12, 24}


class BackgroundWatchService:
    def __init__(self, db: Session):
        self.db = db
        self.moonraker = MoonrakerClient()

    def get_or_create_watch_config(self, printer: PrinterProfile) -> BackgroundWatchConfig:
        config = printer.watch_config
        if config is not None:
            return config

        config = BackgroundWatchConfig(
            printer_id=printer.id,
            is_enabled=False,
            retention_hours=DEFAULT_WATCH_RETENTION_HOURS,
        )
        printer.watch_config = config
        self.db.add(config)
        self.db.commit()
        self.db.refresh(config)
        self.db.refresh(printer)
        return config

    def update_watch_config(
        self,
        printer: PrinterProfile,
        *,
        is_enabled: bool | None = None,
        retention_hours: int | None = None,
    ) -> BackgroundWatchConfig:
        config = self.get_or_create_watch_config(printer)

        if retention_hours is not None and retention_hours not in VALID_RETENTION_HOURS:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid watch retention window")

        if is_enabled is not None:
            config.is_enabled = is_enabled
        if retention_hours is not None:
            config.retention_hours = retention_hours

        self.db.add(config)
        self.db.commit()
        self.db.refresh(config)
        self.prune_watch_history(config)
        self.db.commit()
        self.db.refresh(config)
        return config

    def list_watch_samples(self, printer: PrinterProfile, *, hours: int | None = None) -> list[BackgroundWatchSample]:
        config = self.get_or_create_watch_config(printer)
        retention_hours = hours or config.retention_hours
        if retention_hours not in VALID_RETENTION_HOURS:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid watch history window")

        cutoff = datetime.now(UTC) - timedelta(hours=retention_hours)
        stmt: Select[tuple[BackgroundWatchSample]] = (
            select(BackgroundWatchSample)
            .where(BackgroundWatchSample.printer_id == printer.id, BackgroundWatchSample.captured_at >= cutoff)
            .order_by(BackgroundWatchSample.captured_at.asc())
        )
        return list(self.db.scalars(stmt))

    def list_watch_configs(self) -> list[BackgroundWatchConfig]:
        stmt: Select[tuple[BackgroundWatchConfig]] = select(BackgroundWatchConfig).order_by(BackgroundWatchConfig.printer_id.asc())
        return list(self.db.scalars(stmt))

    def list_enabled_watch_configs(self) -> list[BackgroundWatchConfig]:
        stmt: Select[tuple[BackgroundWatchConfig]] = (
            select(BackgroundWatchConfig)
            .where(BackgroundWatchConfig.is_enabled.is_(True))
            .order_by(BackgroundWatchConfig.printer_id.asc())
        )
        return list(self.db.scalars(stmt))

    def capture_watch_sample_if_due(
        self,
        config: BackgroundWatchConfig,
        *,
        reference_time: datetime | None = None,
    ) -> BackgroundWatchSample | None:
        now = self._coerce_utc(reference_time or datetime.now(UTC))
        printer = config.printer or self.db.get(PrinterProfile, config.printer_id)
        self.prune_watch_history(config, reference_time=now)

        if printer is None or not config.is_enabled or not printer.is_enabled:
            return None

        last_sample = self._get_latest_watch_sample(printer.id)
        if last_sample is not None:
            elapsed = now - self._coerce_utc(last_sample.captured_at)
            if elapsed.total_seconds() < settings.watch_poll_interval_seconds:
                return None

        snapshot = self.moonraker.fetch_temperature_snapshot(printer)
        snapshot["source"] = "moonraker-http-watch"
        sample = BackgroundWatchSample(printer_id=printer.id, **snapshot)
        self.db.add(sample)
        self.prune_watch_history(config, reference_time=now)
        self.db.commit()
        self.db.refresh(sample)
        return sample

    def prune_watch_history(
        self,
        config: BackgroundWatchConfig,
        *,
        reference_time: datetime | None = None,
    ) -> int:
        now = self._coerce_utc(reference_time or datetime.now(UTC))
        cutoff = now - timedelta(hours=config.retention_hours)
        result = self.db.execute(
            delete(BackgroundWatchSample)
            .where(
                BackgroundWatchSample.printer_id == config.printer_id,
                BackgroundWatchSample.captured_at < cutoff,
            )
            .execution_options(synchronize_session=False)
        )
        return int(result.rowcount or 0)

    def prune_all_watch_history(self, *, reference_time: datetime | None = None, commit: bool = False) -> int:
        deleted_count = 0
        now = self._coerce_utc(reference_time or datetime.now(UTC))
        for config in self.list_watch_configs():
            deleted_count += self.prune_watch_history(config, reference_time=now)

        if commit:
            self.db.commit()

        return deleted_count

    def promote_watch_window(
        self,
        printer: PrinterProfile,
        *,
        label: str | None = None,
        save_notes: str | None = None,
        hours: int | None = None,
    ) -> RecordingSession:
        config = self.get_or_create_watch_config(printer)
        retention_hours = hours or config.retention_hours
        if retention_hours not in VALID_RETENTION_HOURS:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid watch history window")

        samples = self.list_watch_samples(printer, hours=retention_hours)
        if not samples:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No watch samples are available in the selected window")

        first_sample = samples[0]
        last_sample = samples[-1]
        session = RecordingSession(
            printer_id=printer.id,
            label=label.strip() if label else f"Watch window ({retention_hours}h)",
            started_at=first_sample.captured_at,
            ended_at=last_sample.captured_at,
            status=SessionStatus.SAVED,
            stop_reason="watch-promotion",
            save_notes=save_notes,
        )
        self.db.add(session)
        self.db.flush()

        for watch_sample in samples:
            self.db.add(
                TemperatureSample(
                    session_id=session.id,
                    captured_at=watch_sample.captured_at,
                    nozzle_actual=watch_sample.nozzle_actual,
                    nozzle_target=watch_sample.nozzle_target,
                    bed_actual=watch_sample.bed_actual,
                    bed_target=watch_sample.bed_target,
                    chamber_actual=watch_sample.chamber_actual,
                    heater_power=watch_sample.heater_power,
                    fan_speed=watch_sample.fan_speed,
                    print_state=watch_sample.print_state,
                    source="background-watch-promotion",
                    raw_payload=watch_sample.raw_payload,
                )
            )

        self.db.add(
            ThermalEvent(
                session_id=session.id,
                event_type="session-promoted-from-watch",
                message="Saved session created from background watch history",
                metadata_json=json.dumps({"printer_id": printer.id, "retention_hours": retention_hours, "sample_count": len(samples)}),
            )
        )
        self.db.commit()
        self.db.refresh(session)
        session.sample_count = len(samples)
        return session

    def _get_latest_watch_sample(self, printer_id: int) -> BackgroundWatchSample | None:
        stmt: Select[tuple[BackgroundWatchSample]] = (
            select(BackgroundWatchSample)
            .where(BackgroundWatchSample.printer_id == printer_id)
            .order_by(desc(BackgroundWatchSample.captured_at))
            .limit(1)
        )
        return self.db.scalar(stmt)

    @staticmethod
    def _coerce_utc(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
