from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.thermal import (
    BackgroundWatchConfigRead,
    BackgroundWatchConfigUpdate,
    BackgroundWatchPromoteRequest,
    BackgroundWatchSampleRead,
    PrinterConnectionCheckRead,
    PrinterCreate,
    PrinterRead,
    PrinterUpdate,
    SessionRead,
    SmartWatchConfigRead,
    SmartWatchConfigUpdate,
)
from app.services.background_watch import BackgroundWatchService
from app.services.session_lifecycle import SessionLifecycleService
from app.services.smart_watch import SmartWatchService

router = APIRouter(prefix="/printers", tags=["printers"])


@router.get("", response_model=list[PrinterRead])
def list_printers(db: Session = Depends(get_db)) -> list[PrinterRead]:
    return SessionLifecycleService(db).list_printers()


@router.post("", response_model=PrinterRead, status_code=status.HTTP_201_CREATED)
def create_printer(payload: PrinterCreate, db: Session = Depends(get_db)) -> PrinterRead:
    return SessionLifecycleService(db).create_printer(**payload.model_dump())


@router.get("/{printer_id}", response_model=PrinterRead)
def get_printer(printer_id: int, db: Session = Depends(get_db)) -> PrinterRead:
    return SessionLifecycleService(db).get_printer(printer_id)


@router.patch("/{printer_id}", response_model=PrinterRead)
def update_printer(printer_id: int, payload: PrinterUpdate, db: Session = Depends(get_db)) -> PrinterRead:
    service = SessionLifecycleService(db)
    printer = service.get_printer(printer_id)
    return service.update_printer(printer, **payload.model_dump(exclude_unset=True))


@router.delete("/{printer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_printer(printer_id: int, db: Session = Depends(get_db)) -> Response:
    service = SessionLifecycleService(db)
    printer = service.get_printer(printer_id)
    service.delete_printer(printer)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{printer_id}/connection-check", response_model=PrinterConnectionCheckRead)
def check_printer_connection(printer_id: int, db: Session = Depends(get_db)) -> PrinterConnectionCheckRead:
    service = SessionLifecycleService(db)
    printer = service.get_printer(printer_id)
    return service.check_printer_connection(printer)


@router.patch("/{printer_id}/watch-config", response_model=BackgroundWatchConfigRead)
def update_watch_config(printer_id: int, payload: BackgroundWatchConfigUpdate, db: Session = Depends(get_db)) -> BackgroundWatchConfigRead:
    printer_service = SessionLifecycleService(db)
    printer = printer_service.get_printer(printer_id)
    watch_service = BackgroundWatchService(db)
    return watch_service.update_watch_config(printer, **payload.model_dump(exclude_unset=True))


@router.patch("/{printer_id}/smart-watch-config", response_model=SmartWatchConfigRead)
def update_smart_watch_config(
    printer_id: int,
    payload: SmartWatchConfigUpdate,
    db: Session = Depends(get_db),
) -> SmartWatchConfigRead:
    printer_service = SessionLifecycleService(db)
    printer = printer_service.get_printer(printer_id)
    smart_watch_service = SmartWatchService(db)
    return smart_watch_service.update_config(printer, **payload.model_dump(exclude_unset=True))


@router.get("/{printer_id}/watch/samples", response_model=list[BackgroundWatchSampleRead])
def list_watch_samples(
    printer_id: int,
    hours: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[BackgroundWatchSampleRead]:
    printer_service = SessionLifecycleService(db)
    printer = printer_service.get_printer(printer_id)
    watch_service = BackgroundWatchService(db)
    return watch_service.list_watch_samples(printer, hours=hours)


@router.post("/{printer_id}/watch/promote", response_model=SessionRead, status_code=status.HTTP_201_CREATED)
def promote_watch_history(
    printer_id: int,
    payload: BackgroundWatchPromoteRequest,
    db: Session = Depends(get_db),
) -> SessionRead:
    printer_service = SessionLifecycleService(db)
    printer = printer_service.get_printer(printer_id)
    watch_service = BackgroundWatchService(db)
    return watch_service.promote_watch_window(printer, **payload.model_dump())
