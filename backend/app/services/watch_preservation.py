import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import Select, desc, func, select
from sqlalchemy.orm import Session

from app.models import (
    BackgroundWatchSample,
    PreservedWatchCapture,
    PreservedWatchCaptureStatus,
    PreservedWatchSample,
    PreservedWatchTriggerEvent,
    PrinterProfile,
)

TRIGGER_WINDOW_BEFORE = timedelta(minutes=30)
TRIGGER_WINDOW_AFTER = timedelta(minutes=30)
NOZZLE_DROP_THRESHOLD_C = 15.0
BED_DROP_THRESHOLD_C = 8.0
NOZZLE_GAP_THRESHOLD_C = 15.0
BED_GAP_THRESHOLD_C = 8.0
SUSTAINED_GAP_SAMPLES = 3


@dataclass(slots=True)
class TriggerMatch:
    rule: str
    reason: str
    event_time: datetime
    metadata: dict[str, object]


class WatchPreservationService:
    def __init__(self, db: Session):
        self.db = db

    def list_captures(self, *, printer_id: int | None = None) -> list[PreservedWatchCapture]:
        stmt: Select[tuple[PreservedWatchCapture]] = select(PreservedWatchCapture).order_by(PreservedWatchCapture.trigger_time.desc())
        if printer_id is not None:
            stmt = stmt.where(PreservedWatchCapture.printer_id == printer_id)
        captures = list(self.db.scalars(stmt))
        self._attach_counts(captures)
        return captures

    def get_capture(self, capture_id: int) -> PreservedWatchCapture:
        capture = self.db.get(PreservedWatchCapture, capture_id)
        if capture is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preserved capture not found")
        self._attach_counts([capture])
        return capture

    def list_capture_samples(self, capture: PreservedWatchCapture) -> list[PreservedWatchSample]:
        stmt: Select[tuple[PreservedWatchSample]] = (
            select(PreservedWatchSample)
            .where(PreservedWatchSample.capture_id == capture.id)
            .order_by(PreservedWatchSample.captured_at.asc())
        )
        return list(self.db.scalars(stmt))

    def list_capture_triggers(self, capture: PreservedWatchCapture) -> list[PreservedWatchTriggerEvent]:
        stmt: Select[tuple[PreservedWatchTriggerEvent]] = (
            select(PreservedWatchTriggerEvent)
            .where(PreservedWatchTriggerEvent.capture_id == capture.id)
            .order_by(PreservedWatchTriggerEvent.event_time.asc())
        )
        return list(self.db.scalars(stmt))

    def process_watch_sample(self, printer: PrinterProfile, sample: BackgroundWatchSample) -> PreservedWatchCapture | None:
        event_time = self._coerce_utc(sample.captured_at)
        active_capture = self._get_active_capture(printer.id, event_time)
        if active_capture is not None:
            self._copy_watch_sample_to_capture(active_capture, sample)

        matches = self._detect_triggers(printer.id)
        if not matches:
            self._finalize_due_captures(reference_time=event_time, commit=False)
            self.db.commit()
            return active_capture

        capture = active_capture
        for index, match in enumerate(matches):
            capture = capture or self._create_capture(printer, match)
            if index == 0 and event_time + TRIGGER_WINDOW_AFTER > self._coerce_utc(capture.capture_end_at):
                capture.capture_end_at = event_time + TRIGGER_WINDOW_AFTER
            self._record_trigger_event(capture, match, sample.id)
            self._copy_watch_window_to_capture(capture, printer.id, capture.capture_start_at, event_time)
            self._copy_watch_sample_to_capture(capture, sample)
            self.db.add(capture)

        self._finalize_due_captures(reference_time=event_time, commit=False)
        self.db.commit()
        self.db.refresh(capture)
        self._attach_counts([capture])
        return capture

    def finalize_due_captures(self, *, reference_time: datetime | None = None) -> int:
        changed = self._finalize_due_captures(reference_time=reference_time, commit=True)
        return changed

    def _finalize_due_captures(self, *, reference_time: datetime | None = None, commit: bool) -> int:
        now = self._coerce_utc(reference_time or datetime.now(UTC))
        stmt: Select[tuple[PreservedWatchCapture]] = (
            select(PreservedWatchCapture)
            .where(
                PreservedWatchCapture.status == PreservedWatchCaptureStatus.COLLECTING,
                PreservedWatchCapture.capture_end_at <= now,
            )
            .order_by(PreservedWatchCapture.capture_end_at.asc())
        )
        captures = list(self.db.scalars(stmt))
        for capture in captures:
            capture.status = PreservedWatchCaptureStatus.FINALIZED
            capture.finalized_at = now
            self.db.add(capture)

        if commit and captures:
            self.db.commit()

        return len(captures)

    def _detect_triggers(self, printer_id: int) -> list[TriggerMatch]:
        recent_samples = self._list_recent_watch_samples(printer_id, limit=max(4, SUSTAINED_GAP_SAMPLES + 1))
        if len(recent_samples) < 2:
            return []

        current = recent_samples[-1]
        previous = recent_samples[-2]
        matches: list[TriggerMatch] = []

        nozzle_drop = self._temperature_drop(previous.nozzle_actual, current.nozzle_actual)
        if nozzle_drop is not None and self._target_is_set(current.nozzle_target) and nozzle_drop >= NOZZLE_DROP_THRESHOLD_C:
            matches.append(
                TriggerMatch(
                    rule="watch-nozzle-drop",
                    reason=(
                        f"Nozzle temperature dropped {nozzle_drop:.1f}C while the nozzle target remained set at "
                        f"{self._format_temperature(current.nozzle_target)}."
                    ),
                    event_time=self._coerce_utc(current.captured_at),
                    metadata={
                        "drop_c": round(nozzle_drop, 2),
                        "previous_actual": previous.nozzle_actual,
                        "current_actual": current.nozzle_actual,
                        "target": current.nozzle_target,
                    },
                )
            )

        bed_drop = self._temperature_drop(previous.bed_actual, current.bed_actual)
        if bed_drop is not None and self._target_is_set(current.bed_target) and bed_drop >= BED_DROP_THRESHOLD_C:
            matches.append(
                TriggerMatch(
                    rule="watch-bed-drop",
                    reason=(
                        f"Bed temperature dropped {bed_drop:.1f}C while the bed target remained set at "
                        f"{self._format_temperature(current.bed_target)}."
                    ),
                    event_time=self._coerce_utc(current.captured_at),
                    metadata={
                        "drop_c": round(bed_drop, 2),
                        "previous_actual": previous.bed_actual,
                        "current_actual": current.bed_actual,
                        "target": current.bed_target,
                    },
                )
            )

        recent_window = recent_samples[-SUSTAINED_GAP_SAMPLES:]
        if len(recent_window) == SUSTAINED_GAP_SAMPLES:
            nozzle_gaps = [self._target_gap(sample.nozzle_target, sample.nozzle_actual) for sample in recent_window]
            if all(gap is not None and gap >= NOZZLE_GAP_THRESHOLD_C for gap in nozzle_gaps):
                matches.append(
                    TriggerMatch(
                        rule="watch-nozzle-gap",
                        reason=(
                            f"Nozzle stayed at least {NOZZLE_GAP_THRESHOLD_C:.1f}C below target for "
                            f"{SUSTAINED_GAP_SAMPLES} consecutive watch samples."
                        ),
                        event_time=self._coerce_utc(current.captured_at),
                        metadata={
                            "gap_c": round(float(min(gap for gap in nozzle_gaps if gap is not None)), 2),
                            "sample_count": SUSTAINED_GAP_SAMPLES,
                            "target": current.nozzle_target,
                        },
                    )
                )

            bed_gaps = [self._target_gap(sample.bed_target, sample.bed_actual) for sample in recent_window]
            if all(gap is not None and gap >= BED_GAP_THRESHOLD_C for gap in bed_gaps):
                matches.append(
                    TriggerMatch(
                        rule="watch-bed-gap",
                        reason=(
                            f"Bed stayed at least {BED_GAP_THRESHOLD_C:.1f}C below target for "
                            f"{SUSTAINED_GAP_SAMPLES} consecutive watch samples."
                        ),
                        event_time=self._coerce_utc(current.captured_at),
                        metadata={
                            "gap_c": round(float(min(gap for gap in bed_gaps if gap is not None)), 2),
                            "sample_count": SUSTAINED_GAP_SAMPLES,
                            "target": current.bed_target,
                        },
                    )
                )

        return matches

    def _create_capture(self, printer: PrinterProfile, match: TriggerMatch) -> PreservedWatchCapture:
        capture = PreservedWatchCapture(
            printer_id=printer.id,
            trigger_rule=match.rule,
            trigger_reason=match.reason,
            trigger_time=match.event_time,
            capture_start_at=match.event_time - TRIGGER_WINDOW_BEFORE,
            capture_end_at=match.event_time + TRIGGER_WINDOW_AFTER,
        )
        self.db.add(capture)
        self.db.flush()
        return capture

    def _record_trigger_event(self, capture: PreservedWatchCapture, match: TriggerMatch, watch_sample_id: int) -> None:
        existing_stmt = select(PreservedWatchTriggerEvent).where(
            PreservedWatchTriggerEvent.capture_id == capture.id,
            PreservedWatchTriggerEvent.trigger_rule == match.rule,
        )
        if self.db.scalar(existing_stmt) is not None:
            return

        event = PreservedWatchTriggerEvent(
            capture_id=capture.id,
            event_time=match.event_time,
            trigger_rule=match.rule,
            trigger_reason=match.reason,
            metadata_json=json.dumps({**match.metadata, "watch_sample_id": watch_sample_id}),
        )
        self.db.add(event)

    def _copy_watch_window_to_capture(
        self,
        capture: PreservedWatchCapture,
        printer_id: int,
        start_time: datetime,
        end_time: datetime,
    ) -> None:
        stmt: Select[tuple[BackgroundWatchSample]] = (
            select(BackgroundWatchSample)
            .where(
                BackgroundWatchSample.printer_id == printer_id,
                BackgroundWatchSample.captured_at >= start_time,
                BackgroundWatchSample.captured_at <= end_time,
            )
            .order_by(BackgroundWatchSample.captured_at.asc())
        )
        for sample in self.db.scalars(stmt):
            self._copy_watch_sample_to_capture(capture, sample)

    def _copy_watch_sample_to_capture(self, capture: PreservedWatchCapture, sample: BackgroundWatchSample) -> None:
        exists_stmt = select(PreservedWatchSample.id).where(
            PreservedWatchSample.capture_id == capture.id,
            PreservedWatchSample.source_watch_sample_id == sample.id,
        )
        if self.db.scalar(exists_stmt) is not None:
            return

        preserved_sample = PreservedWatchSample(
            capture_id=capture.id,
            source_watch_sample_id=sample.id,
            captured_at=sample.captured_at,
            nozzle_actual=sample.nozzle_actual,
            nozzle_target=sample.nozzle_target,
            bed_actual=sample.bed_actual,
            bed_target=sample.bed_target,
            chamber_actual=sample.chamber_actual,
            heater_power=sample.heater_power,
            fan_speed=sample.fan_speed,
            print_state=sample.print_state,
            source="preserved-watch-copy",
            raw_payload=sample.raw_payload,
        )
        self.db.add(preserved_sample)
        self.db.flush()

    def _get_active_capture(self, printer_id: int, event_time: datetime) -> PreservedWatchCapture | None:
        stmt: Select[tuple[PreservedWatchCapture]] = (
            select(PreservedWatchCapture)
            .where(
                PreservedWatchCapture.printer_id == printer_id,
                PreservedWatchCapture.status == PreservedWatchCaptureStatus.COLLECTING,
                PreservedWatchCapture.capture_end_at >= event_time,
            )
            .order_by(desc(PreservedWatchCapture.trigger_time))
            .limit(1)
        )
        return self.db.scalar(stmt)

    def _list_recent_watch_samples(self, printer_id: int, *, limit: int) -> list[BackgroundWatchSample]:
        stmt: Select[tuple[BackgroundWatchSample]] = (
            select(BackgroundWatchSample)
            .where(BackgroundWatchSample.printer_id == printer_id)
            .order_by(desc(BackgroundWatchSample.captured_at))
            .limit(limit)
        )
        samples = list(self.db.scalars(stmt))
        samples.reverse()
        return samples

    def _attach_counts(self, captures: list[PreservedWatchCapture]) -> None:
        if not captures:
            return

        capture_ids = [capture.id for capture in captures]
        sample_counts_stmt = (
            select(PreservedWatchSample.capture_id, func.count(PreservedWatchSample.id))
            .where(PreservedWatchSample.capture_id.in_(capture_ids))
            .group_by(PreservedWatchSample.capture_id)
        )
        trigger_counts_stmt = (
            select(PreservedWatchTriggerEvent.capture_id, func.count(PreservedWatchTriggerEvent.id))
            .where(PreservedWatchTriggerEvent.capture_id.in_(capture_ids))
            .group_by(PreservedWatchTriggerEvent.capture_id)
        )
        sample_counts = {capture_id: count for capture_id, count in self.db.execute(sample_counts_stmt).all()}
        trigger_counts = {capture_id: count for capture_id, count in self.db.execute(trigger_counts_stmt).all()}
        for capture in captures:
            capture.sample_count = sample_counts.get(capture.id, 0)
            capture.trigger_count = trigger_counts.get(capture.id, 0)

    @staticmethod
    def _target_is_set(target: float | None) -> bool:
        return target is not None and target > 0

    @classmethod
    def _target_gap(cls, target: float | None, actual: float | None) -> float | None:
        if not cls._target_is_set(target) or actual is None:
            return None
        return max(0.0, target - actual)

    @staticmethod
    def _temperature_drop(previous: float | None, current: float | None) -> float | None:
        if previous is None or current is None:
            return None
        return previous - current

    @staticmethod
    def _format_temperature(value: float | None) -> str:
        return "-" if value is None else f"{value:.1f}C"

    @staticmethod
    def _coerce_utc(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
