# TempWatch

TempWatch is a local-first web app for recording Moonraker/Klipper temperature data so printer thermal issues can be diagnosed with saved sessions and later comparison tooling.

## Stack

- Backend: FastAPI + SQLAlchemy + SQLite
- Frontend: React + TypeScript + Vite
- Data source: Moonraker HTTP/WebSocket APIs

## Repository Layout

- `backend/` FastAPI app, persistence layer, Moonraker integration, tests
- `frontend/` React app
- `docs/ROADMAP.md` living implementation roadmap

## Local Development

### Backend

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ./backend
uvicorn app.main:app --reload --app-dir backend
```

When the backend is running, TempWatch will poll active sessions and capture samples automatically at the configured interval.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

## Configuration

Copy `.env.example` to `.env` and adjust values for your local environment.

Notable settings:

- `TEMPWATCH_DATABASE_URL` controls the local SQLite path.
- `TEMPWATCH_SAMPLE_INTERVAL_SECONDS` controls the minimum gap between captured samples for an active session.
- `TEMPWATCH_RECORDING_LOOP_INTERVAL_SECONDS` controls how often the backend scans active sessions for due captures.