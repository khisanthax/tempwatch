from fastapi import APIRouter

from app.api.routes import health, preserved_watch, printers, sessions

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(printers.router)
api_router.include_router(sessions.router)
api_router.include_router(preserved_watch.router)
