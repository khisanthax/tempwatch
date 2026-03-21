import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_router
from app.core.config import get_settings
from app.db.init_db import init_db
from app.services.recording_loop import RecordingLoop

settings = get_settings()
recording_loop = RecordingLoop()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    stop_event = asyncio.Event()
    task = asyncio.create_task(recording_loop.run(stop_event))
    try:
        yield
    finally:
        stop_event.set()
        await task


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": f"{settings.app_name} backend"}