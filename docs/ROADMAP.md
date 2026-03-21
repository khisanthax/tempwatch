# TempWatch Roadmap

## Project Overview

TempWatch is a local-first web app for recording and analyzing 3D printer thermal behavior from Moonraker/Klipper printers. The app supports multiple printer profiles, manual recording sessions, SQLite-backed persistence, and staged diagnostic tooling for common thermal failures such as heater weakness, fan interference, PID instability, and wiring faults.

## Goals

- Provide a maintainable local web app with a FastAPI backend and React frontend.
- Support multiple Moonraker/Klipper printers with saved connection profiles.
- Allow manual start/stop temperature recording, limited to one active session per printer.
- Enforce a hard cap of 4 days per recording session.
- Persist completed sessions so users can save or discard them after review.
- Enable later comparison of saved sessions and diagnostic workflows.

## Non-Goals

- Cloud-hosted telemetry or always-on fleet monitoring.
- Full printer management beyond thermal observation and diagnostics.
- Auto-starting recordings without explicit user action.
- Supporting more than one active recording session per printer at a time.

## Architecture Plan

### Backend

- FastAPI application under `backend/`.
- SQLAlchemy ORM with SQLite for local persistence.
- Service layer for printer profiles, session lifecycle, and Moonraker integration.
- In-process recording loop for active session polling while the backend is running.
- Background connection components for Moonraker websocket ingestion during active sessions.
- Pydantic settings for environment-driven configuration.

### Frontend

- React + TypeScript application under `frontend/`.
- Vite for local development/build.
- React Router for app structure.
- Feature-oriented UI modules for printers, sessions, live charts, and diagnostics.
- API client layer targeting local FastAPI endpoints.

### Storage

- SQLite database initialized from SQLAlchemy metadata on backend startup.
- Current tables: `printer_profiles`, `recording_sessions`, `temperature_samples`, `thermal_events`.
- Planned tables: comparison metadata and analyzer outputs if diagnostics need their own persistence.

### Moonraker Strategy

- Current baseline: HTTP connectivity check against `server/info`.
- Active-session sample capture uses HTTP object queries against `printer/objects/query`.
- Automated recording uses an in-process polling loop to capture roughly one sample per second for active sessions.
- Follow-up: extend the Moonraker client into websocket-backed live ingestion once the polling-based recording path is stable.
- Normalize nozzle, bed, chamber, target, power, fan, and state metadata where available.

## Phased Implementation Plan

### Phase 1: Foundation

- Repository structure and top-level documentation.
- Backend scaffold with app factory, config, and database bootstrap.
- Frontend scaffold with routing and shell layout.
- Shared local development conventions and environment examples.
- SQLite initialization strategy.
- Moonraker client interface and connection plan.

### Phase 2: Core Recording

- Printer profile CRUD.
- Manual session start/stop flow.
- Enforce one active session per printer.
- Enforce 4-day maximum session duration across active recordings.
- Persist samples and notable thermal events.
- Live recording page with streaming graph.

### Phase 3: Session Management

- Save/discard completed sessions.
- Saved session browser and filters.
- Session detail view with timeline and metadata.
- Comparison view for two sessions.

### Phase 4: Diagnostic Tools I

- Heat-Up Analyzer.
- Heater Power Diagnostic.
- Cooling Impact Test Mode.

### Phase 5: Diagnostic Tools II

- Smart PID Assistant.
- Diagnosis Engine.
- UX polish, resilience, and expanded error handling.

## Milestone Checklist

- [x] Create living roadmap.
- [x] Initialize repository structure.
- [x] Backend scaffold implemented.
- [x] Frontend scaffold implemented.
- [x] SQLite bootstrap implemented.
- [x] Initial Moonraker connectivity check implemented.
- [x] Printer profile CRUD implemented.
- [x] Session lifecycle foundation implemented.
- [x] Sample persistence implemented.
- [x] Automated active-session capture implemented.
- [ ] Saved/comparison flows implemented.
- [ ] First diagnostic features implemented.

## Current Status

- Repository is initialized on `main` and pushed to GitHub.
- Backend FastAPI app runs from `backend/app` with config, SQLAlchemy setup, automatic table creation, and an in-process recording loop.
- Frontend React app includes printer management plus a session workflow page.
- Printer profile CRUD endpoints and session lifecycle endpoints exist.
- Session states currently support `active`, `completed`, `saved`, and `discarded`.
- Stale active sessions are automatically completed once they exceed the 4-day cap.
- Active sessions can capture normalized Moonraker temperature snapshots into persistent sample rows manually or through the background polling loop.
- If the backend restarts while a session is still active, the session remains active in SQLite and automated sampling resumes when the backend comes back up.
- The frontend can start sessions, stop active sessions, capture manual samples, and inspect captured sample rows for a selected session.
- Moonraker websocket streaming/data ingestion has not started yet.

## Decision Log / Technical Notes

### 2026-03-21

- Chosen repository roadmap file: `docs/ROADMAP.md`.
- Project will start directly on `main` unless a later change is large or experimental.
- Frontend uses TypeScript to keep data contracts explicit across API boundaries.
- First implementation chunk expanded beyond pure scaffold to include the initial backend domain model so the app has a usable API baseline immediately.
- SQLite schema creation currently uses SQLAlchemy metadata on app startup; migrations can be added once schemas stabilize.
- Frontend JSON/TOML-related config files were rewritten without a BOM after build/install validation exposed parsing issues.
- Local backend validation is using the system Python installation because the generated `.venv` did not include a working `pip` in this environment.
- Generated install/build artifacts are now excluded from version control; the first commit included some generated files, and a follow-up commit removed them.
- SQLite returns naive datetimes for stored timestamps in this setup, so session cap enforcement now coerces database values to UTC before comparison.
- Initial Moonraker integration is intentionally limited to an HTTP `server/info` connectivity check before websocket recording is introduced.
- Snapshot ingestion uses Moonraker HTTP object queries first so data normalization and session persistence can be exercised before websocket complexity is added.
- The next automated recording step uses an in-process polling loop because it fits the current single-backend deployment and keeps restart recovery straightforward.
- Thermal events are reserved for meaningful lifecycle/state transitions rather than every captured sample to avoid unbounded event noise.
- The first session UI intentionally focuses on operator control and inspection rather than live charting so the persisted sample flow can be verified end to end.`r`n- The first graphing slice will render persisted samples with inline SVG and periodic refresh instead of adding a charting dependency this early.

## Known Risks / Open Questions

- Automated sampling currently depends on the FastAPI process staying alive; a separate worker or websocket-driven path may still be needed for stronger resilience later.
- Moonraker websocket ingestion and live graph updates are still missing.
- Moonraker field availability varies by printer setup; sample normalization will need defensive handling for custom chamber sensors and alternate object names.
- Session retention rules for unsaved completed sessions still need a product decision.
- Session UI now supports start/stop/capture/list plus a basic graph, but save/discard actions and richer metadata views are still pending.
- Existing SQLite files created before future schema changes will eventually need a migration path.

## What Changed From The Original Plan

- The first implementation chunk combined scaffolding and the first backend domain slice instead of stopping after directory setup.
- SQLite bootstrap was implemented immediately because printer/session APIs depend on real persistence.
- Frontend printer management landed before deeper Moonraker work so local profile handling could be exercised end to end.
- Repository hygiene cleanup became its own follow-up task after validation generated files that should not remain tracked.
- Initial Moonraker work started with a narrow connectivity check rather than jumping straight to websocket streaming.
- Sample ingestion is starting with HTTP snapshot capture instead of websocket streaming so the storage layer can be validated with a simpler execution path.
- Session UI landed before automatic recording loops so manual capture and persisted sample review can be exercised from the browser first.
- Automated recording is starting with an in-process polling loop rather than a separate worker so the app stays simple and locally runnable.

## Next Steps

1. Build a first live/recent sample graph view on top of persisted session samples and auto-refresh it for active sessions.
2. Add save/discard actions and saved-session browsing/comparison flows.
3. Extend printer management with edit/delete actions and richer printer status views.
4. Evaluate when to replace or augment the polling loop with websocket-based ingestion.

## Recent Completed Work Log

- 2026-03-21: Created the initial living roadmap and documented project phases.
- 2026-03-21: Initialized the repository, added setup docs, and scaffolded backend/frontend structure.
- 2026-03-21: Implemented SQLite-backed printer profile CRUD and session lifecycle endpoints.
- 2026-03-21: Verified backend imports/database initialization and produced a successful frontend production build.
- 2026-03-21: Wired the frontend printers page to the backend and removed generated artifacts from version control.
- 2026-03-21: Added Moonraker connectivity diagnostics, printer uniqueness checks, and automatic stale-session cap enforcement.
- 2026-03-21: Added persistent temperature samples, thermal events, and HTTP snapshot capture/list endpoints for active sessions.
- 2026-03-21: Added a frontend sessions page for manual session control and sample inspection.
- 2026-03-21: Added an automated polling loop that resumes active-session sample capture when the backend is running.`r`n- 2026-03-21: Added a first live session detail view with elapsed time, current readings, auto-refresh, and an inline SVG temperature graph.

## Upcoming Commit Targets

- Commit 1: Foundation scaffold, setup docs, backend persistence baseline, printer/session API foundation.
- Commit 2: Frontend printer management wired to the backend plus generated-file cleanup.
- Commit 3: Moonraker diagnostics, backend validation hardening, and active-session cap enforcement improvements.
- Commit 4: Snapshot-based sample persistence and session capture foundations.
- Commit 5: Session UI, sample visibility, and live-recording follow-up.
- Commit 6: Automated recording loop for active sessions.
- Commit 7: First live graphing slice and session detail polish.