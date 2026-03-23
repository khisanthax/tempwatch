from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.thermal import PreservedWatchCaptureRead, PreservedWatchSampleRead, PreservedWatchTriggerEventRead
from app.services.watch_preservation import WatchPreservationService

router = APIRouter(prefix="/preserved-watch-captures", tags=["preserved-watch"])


@router.get("", response_model=list[PreservedWatchCaptureRead])
def list_preserved_watch_captures(
    printer_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[PreservedWatchCaptureRead]:
    return WatchPreservationService(db).list_captures(printer_id=printer_id)


@router.get("/{capture_id}", response_model=PreservedWatchCaptureRead)
def get_preserved_watch_capture(capture_id: int, db: Session = Depends(get_db)) -> PreservedWatchCaptureRead:
    return WatchPreservationService(db).get_capture(capture_id)


@router.get("/{capture_id}/samples", response_model=list[PreservedWatchSampleRead])
def list_preserved_watch_samples(capture_id: int, db: Session = Depends(get_db)) -> list[PreservedWatchSampleRead]:
    service = WatchPreservationService(db)
    capture = service.get_capture(capture_id)
    return service.list_capture_samples(capture)


@router.get("/{capture_id}/triggers", response_model=list[PreservedWatchTriggerEventRead])
def list_preserved_watch_triggers(capture_id: int, db: Session = Depends(get_db)) -> list[PreservedWatchTriggerEventRead]:
    service = WatchPreservationService(db)
    capture = service.get_capture(capture_id)
    return service.list_capture_triggers(capture)
