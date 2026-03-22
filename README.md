# TempWatch

TempWatch is a local-first web app for recording Moonraker/Klipper temperature data so printer thermal issues can be diagnosed with saved sessions, event-aware graphs, and side-by-side session comparison.

## Stack

- Backend: FastAPI + SQLAlchemy + SQLite
- Frontend: React + TypeScript + Vite
- Data source: Moonraker HTTP APIs today, websocket ingestion planned next

## Repository Layout

- `backend/` FastAPI app, persistence layer, Moonraker integration, tests
- `frontend/` React app
- `docker-compose.yml` local multi-container run path
- `docs/ROADMAP.md` living implementation roadmap

## Features In Place

- Multiple printer profiles with add/edit/delete management, Moonraker URL storage, and connection checks
- Manual session start/stop with one active session per printer
- Automatic 4-day max session enforcement
- Persistent temperature samples and lifecycle thermal events
- Background polling for active sessions while the backend is running
- Live session detail view with inline SVG graph and event markers
- Save or discard flow for completed sessions
- Saved sessions browser with printer filtering and sample counts
- Saved-session comparison with elapsed-time or absolute-time alignment
- Printer deletion guard that prevents removing profiles once recorded sessions exist

## Local Development

### 1. Configure environment

```powershell
Copy-Item .env.example .env
```

The defaults work for a local checkout. Adjust the Moonraker URLs you add in the UI per printer profile.

### 2. Run the backend

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ./backend
uvicorn app.main:app --reload --app-dir backend
```

The backend API is available at [http://127.0.0.1:8000](http://127.0.0.1:8000) and interactive docs at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

When the backend is running, TempWatch resumes polling any active sessions stored in SQLite and captures due samples automatically.

### 3. Run the frontend

```powershell
cd frontend
npm install
npm run dev
```

The frontend is available at [http://127.0.0.1:5173](http://127.0.0.1:5173).

By default the frontend uses `VITE_API_BASE_URL=/api/v1`. Vite proxies `/api` requests to the local backend on `http://127.0.0.1:8000`, so local development does not require changing the default API base URL.

## Docker Compose

TempWatch also ships with a Docker Compose path intended for local installs.

### Start the stack

```powershell
docker compose up --build
```

After startup:

- Frontend: [http://127.0.0.1:8080](http://127.0.0.1:8080)
- Backend API: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- Backend docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

The frontend container serves the built React app with Nginx and proxies `/api/*` requests to the backend container, so no separate frontend API configuration is needed for the default Compose path.

### Stop the stack

```powershell
docker compose down
```

To remove the persisted SQLite volume as well:

```powershell
docker compose down -v
```

## Data Storage

- Non-Docker local runs store SQLite data at `./tempwatch.db` by default, relative to the repo root when you launch `uvicorn` from this workspace.
- Docker Compose stores SQLite data in the named Docker volume `tempwatch_data` at `/data/tempwatch.db` inside the backend container.

## Configuration

Copy `.env.example` to `.env` and adjust values as needed.

Common settings:

- `TEMPWATCH_DATABASE_URL`: SQLite path for the backend.
- `TEMPWATCH_SAMPLE_INTERVAL_SECONDS`: minimum gap between captured samples per session.
- `TEMPWATCH_RECORDING_LOOP_INTERVAL_SECONDS`: how often the backend scans active sessions for due captures.
- `TEMPWATCH_API_EXTERNAL_PORT`: host port mapped to the backend container in Docker Compose.
- `TEMPWATCH_FRONTEND_PORT`: host port mapped to the frontend container in Docker Compose.
- `VITE_API_BASE_URL`: frontend API base URL. The default `/api/v1` works for both Vite development and the Nginx-based Docker deployment.

## Verification Commands

```powershell
python -m compileall backend/app
cd frontend; npm run build
docker compose config
```

In this workspace, `docker` is not installed, so the Compose files were authored against the current repo structure but could not be executed end to end here.

## Current Limitations

- Moonraker sampling currently uses HTTP object queries rather than websocket streaming.
- Printer-side fault and state events are limited to what TempWatch already persists from the session lifecycle.
- Saved-session comparison currently focuses on nozzle and bed overlays using the existing inline SVG graphing path.
- Compose runtime validation still needs to be completed on a machine with Docker installed.
