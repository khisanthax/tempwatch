from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.thermal import PrinterCreate, PrinterRead, PrinterUpdate
from app.services.session_lifecycle import SessionLifecycleService

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
    return service.update_printer(printer, **payload.model_dump())
