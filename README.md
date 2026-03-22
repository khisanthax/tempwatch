# TempWatch

TempWatch is a local-first web app for recording Moonraker/Klipper temperature data so printer thermal issues can be diagnosed with manual sessions, rolling background watch history, event-aware graphs, and side-by-side saved-session comparison.

## Stack

- Backend: FastAPI + SQLAlchemy + SQLite
- Frontend: React + TypeScript + Vite
- Data source: Moonraker HTTP APIs today, with websocket ingestion intentionally deferred until after the current watch-mode and reliability slices settle

## Repository Layout

- `backend/` FastAPI app, persistence layer, Moonraker integration, tests
- `frontend/` React app
- `docker-compose.yml` local multi-container run path
- `docs/ROADMAP.md` living implementation roadmap

## Product Model

### Manual sessions

- Explicit start/stop diagnostic recordings
- One active manual session per printer
- Hard-capped at 4 days
- Can be stopped early, then saved or discarded
- Stored in `recording_sessions`, `temperature_samples`, and `thermal_events`

### Background Watch

- Optional per printer
- Runs independently from manual sessions
- Fixed 2-second polling interval
- Rolling retention window of `4h`, `8h`, `12h`, or `24h`
- Stores watch samples separately from manual session samples so passive history stays distinct from intentional recordings
- Current rolling watch windows can be promoted into a saved manual session from the Watch page

## Features In Place

- Multiple printer profiles with add/edit/delete management, Moonraker URL storage, connection checks, and per-printer Background Watch settings
- Manual session start/stop with one active session per printer and support for different printers recording at the same time
- Automatic 4-day max session enforcement
- Persistent temperature samples and lifecycle thermal events for manual sessions
- Background watch configuration, rolling watch-sample persistence, and automatic pruning of samples older than the selected retention window
- Background polling for active sessions and enabled watch-mode printers while the backend is running
- Live session detail view with inline SVG graph and event markers
- Dedicated watch-history view with recent rolling samples, auto-refresh, and watch-window promotion into saved sessions
- Save or discard flow for completed sessions
- Saved sessions browser with printer filtering and sample counts
- Saved-session comparison with elapsed-time or absolute-time alignment
- Printer deletion guard that prevents removing profiles once recorded sessions exist

## Time Display

- TempWatch stores timestamps in UTC internally.
- The current UI display fallback is fixed to `America/New_York` so the app does not depend on browser timezone drift.
- Moonraker / Klipper host-timezone discovery is not implemented yet, so all user-facing times and absolute-time chart ticks currently render in Eastern Time.
- API responses serialize UTC timestamps with an explicit `Z` suffix before the frontend formats them for display.

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

When the backend is running, TempWatch resumes polling any active manual sessions and any enabled Background Watch printers stored in SQLite.

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

- Frontend: [http://127.0.0.1:8480](http://127.0.0.1:8480)
- Backend API: [http://127.0.0.1:8008](http://127.0.0.1:8008)
- Backend docs: [http://127.0.0.1:8008/docs](http://127.0.0.1:8008/docs)

The frontend container serves the built React app with Nginx and proxies `/api/*` requests to the backend container, so no separate frontend API configuration is needed for the default Compose path.

Frontend refresh note:

- The Nginx container serves `index.html` with `no-store` cache headers so redeploys do not leave the browser on an old app shell.
- Built assets under `/assets/` remain cacheable and content-hashed, so a rebuilt frontend gets a new asset filename and the browser can safely fetch the new bundle.
- The Compose file includes `pull_policy: build` for both services so Git-based Portainer redeploys rebuild from the checked-out source instead of reusing a stale local image when supported by the host.

### Persistence

Docker deployments use an explicit named Docker volume called `tempwatch_data`.

- SQLite path inside the backend container: `/data/tempwatch.db`
- Default backend database URL in Docker: `sqlite:////data/tempwatch.db`
- Volume name on the Docker host: `tempwatch_data`

What survives redeploy:

- Rebuilding or redeploying the stack while keeping the `tempwatch_data` volume preserves printer profiles, manual sessions, watch configuration, watch samples, session samples, and thermal events.
- Replacing containers does not remove the named volume.

What removes data:

- `docker compose down -v`
- manually deleting the `tempwatch_data` volume
- deploying a different persistence target and then removing the old volume before copying the database

Portainer note:

- The compose file uses an explicit volume name instead of a stack-scoped generated volume name. This is intended to keep the SQLite location stable across Portainer redeploys and stack-source changes.

Migration / recovery note:

- Existing data from deployments created before this persistence hardening may still live in an older stack-scoped volume. That data is not moved automatically into `tempwatch_data`.
- If the old volume or old container still exists, copy `tempwatch.db` into the new `tempwatch_data` volume before deleting the old deployment.
- If the previous data only existed in a removed container filesystem, TempWatch cannot recover it.

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
- Manual sessions and background watch history use separate tables so passive rolling capture does not blur the manual diagnostic session model.

## Configuration

Copy `.env.example` to `.env` and adjust values as needed.

Common settings:

- `TEMPWATCH_DATABASE_URL`: SQLite path for the backend.
- `TEMPWATCH_SAMPLE_INTERVAL_SECONDS`: minimum gap between captured samples per manual session.
- `TEMPWATCH_RECORDING_LOOP_INTERVAL_SECONDS`: how often the backend scans active sessions and enabled watch configurations for due work.
- `TEMPWATCH_WATCH_POLL_INTERVAL_SECONDS`: fixed watch-mode sample interval. The current product decision keeps this at `2.0` seconds.
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
- Printer-side fault and state events are limited to what TempWatch already persists from the manual-session lifecycle.
- Background Watch currently stores rolling thermal snapshots, but it does not yet persist a separate printer-event timeline beyond the sample payload fields.
- Saved-session comparison currently focuses on nozzle and bed overlays using the existing inline SVG graphing path.
- Compose runtime validation still needs to be completed on a machine with Docker installed.
- Moonraker host-timezone detection is not implemented yet; the deployment currently uses the documented Eastern Time fallback for display.
