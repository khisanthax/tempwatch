from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import SessionStatus
from app.schemas.thermal import SessionCaptureResponse, SessionDispositionRequest, SessionRead, SessionStartRequest, SessionStopRequest, TemperatureSampleRead, ThermalEventRead
from app.services.session_lifecycle import SessionLifecycleService

router = APIRouter(tags=["sessions"])


@router.get("/sessions", response_model=list[SessionRead])
def list_sessions(
    printer_id: int | None = Query(default=None),
    status_filter: SessionStatus | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
) -> list[SessionRead]:
    return SessionLifecycleService(db).list_sessions(printer_id=printer_id, status_filter=status_filter)


@router.get("/sessions/{session_id}", response_model=SessionRead)
def get_session(session_id: int, db: Session = Depends(get_db)) -> SessionRead:
    return SessionLifecycleService(db).get_session(session_id)


@router.post("/printers/{printer_id}/sessions/start", response_model=SessionRead, status_code=status.HTTP_201_CREATED)
def start_session(printer_id: int, payload: SessionStartRequest, db: Session = Depends(get_db)) -> SessionRead:
    service = SessionLifecycleService(db)
    printer = service.get_printer(printer_id)
    return service.start_session(printer=printer, label=payload.label)


@router.post("/sessions/{session_id}/stop", response_model=SessionRead)
def stop_session(session_id: int, payload: SessionStopRequest, db: Session = Depends(get_db)) -> SessionRead:
    service = SessionLifecycleService(db)
    session = service.get_session(session_id)
    return service.stop_session(session, stop_reason=payload.stop_reason)


@router.post("/sessions/{session_id}/save", response_model=SessionRead)
def save_session(session_id: int, payload: SessionDispositionRequest, db: Session = Depends(get_db)) -> SessionRead:
    service = SessionLifecycleService(db)
    session = service.get_session(session_id)
    return service.save_session(session, save_notes=payload.save_notes)


@router.post("/sessions/{session_id}/discard", response_model=SessionRead)
def discard_session(session_id: int, db: Session = Depends(get_db)) -> SessionRead:
    service = SessionLifecycleService(db)
    session = service.get_session(session_id)
    return service.discard_session(session)


@router.get("/sessions/{session_id}/samples", response_model=list[TemperatureSampleRead])
def list_samples(session_id: int, db: Session = Depends(get_db)) -> list[TemperatureSampleRead]:
    service = SessionLifecycleService(db)
    session = service.get_session(session_id)
    return service.list_samples(session)


@router.get("/sessions/{session_id}/events", response_model=list[ThermalEventRead])
def list_events(session_id: int, db: Session = Depends(get_db)) -> list[ThermalEventRead]:
    service = SessionLifecycleService(db)
    session = service.get_session(session_id)
    return service.list_events(session)


@router.post("/sessions/{session_id}/samples/capture", response_model=SessionCaptureResponse, status_code=status.HTTP_201_CREATED)
def capture_sample(session_id: int, db: Session = Depends(get_db)) -> SessionCaptureResponse:
    service = SessionLifecycleService(db)
    session = service.get_session(session_id)
    return service.capture_sample(session)