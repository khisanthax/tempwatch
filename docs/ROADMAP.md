# TempWatch Roadmap

## Project Overview

TempWatch is a local-first web app for recording and analyzing 3D printer thermal behavior from Moonraker/Klipper printers. The app supports multiple printer profiles, manual recording sessions, SQLite-backed persistence, saved-session review, and staged diagnostic tooling for common thermal failures such as heater weakness, fan interference, PID instability, and wiring faults.

## Goals

- Provide a maintainable local web app with a FastAPI backend and React frontend.
- Support multiple Moonraker/Klipper printers with saved connection profiles.
- Allow manual start/stop temperature recording, limited to one active session per printer.
- Enforce a hard cap of 4 days per recording session.
- Persist completed sessions so users can save or discard them after review.
- Enable later comparison of saved sessions and diagnostic workflows.
- Keep local installation straightforward with both direct dev and Docker Compose run paths.

## Non-Goals

- Cloud-hosted telemetry or always-on fleet monitoring.
- Full printer management beyond thermal observation and diagnostics.
- Auto-starting recordings without explicit user action.
- Supporting more than one active recording session per printer at a time.

## Architecture Plan

### Backend

- FastAPI application under `backend/`.
- SQLAlchemy ORM with SQLite for local persistence.
- Service layer for printer profiles, manual-session lifecycle, background watch lifecycle, and Moonraker integration.
- In-process recording loop for active session polling while the backend is running.
- Background connection components for Moonraker websocket ingestion during active sessions.
- Pydantic settings for environment-driven configuration.

### Frontend

- React + TypeScript application under `frontend/`.
- Vite for local development/build.
- React Router for app structure.
- Feature-oriented UI modules for printers, manual sessions, background watch history, live charts, saved-session review, and diagnostics.
- API client layer targeting local FastAPI endpoints.
- Inline SVG charts reused across live review and saved-session comparison to stay dependency-light.

### Storage

- SQLite database initialized from SQLAlchemy metadata on backend startup.
- Current tables: `printer_profiles`, `recording_sessions`, `temperature_samples`, `thermal_events`.
- Next tables for this slice: dedicated background-watch configuration and rolling watch-sample tables, plus any promotion metadata needed to move watch windows into manual sessions later.
- Planned tables: analyzer outputs and any future diagnostic metadata that needs separate persistence.
- Docker deployments must keep the SQLite file on a persistent mounted path that survives container replacement.
- Docker Compose now targets an explicit named volume so Portainer redeploys reuse a stable SQLite location.

### Moonraker Strategy

- Current baseline: HTTP connectivity check against `server/info`.
- Active-session sample capture uses HTTP object queries against `printer/objects/query`.
- Automated recording uses an in-process polling loop to capture roughly one sample per second for active sessions.
- Websocket ingestion is intentionally deferred until background watch mode and the current local review workflows are complete and stable.
- Normalize nozzle, bed, chamber, target, power, fan, and state metadata where available.

## Priority Order

### Current Required Slice: Background Watch Mode

This is the active implementation priority and must stay ahead of websocket work.

1. Add a separate per-printer background watch configuration model with enable/disable state and a rolling retention window of `4h`, `8h`, `12h`, or `24h`.
2. Store rolling watch samples separately from manual-session samples so intentional diagnostics and passive watch history remain distinct concepts.
3. Run background watch polling at a fixed 2-second interval for enabled printers and continuously prune samples older than the selected retention window.
4. Add printer-management UI for watch enable/disable and retention selection without changing the manual-session flow.
5. Add a recent watch-history view for a selected printer so rolling data can be inspected without promoting it to a manual session first.
6. Add an initial backend/data-model hook to promote a recent watch window into a saved manual session later if practical in this slice.
7. Update docs so manual sessions vs watch mode are clearly distinguished and websocket ingestion remains deferred.

### Deferred Until After The Above Slice

- Moonraker websocket ingestion.
- First diagnostic helpers.
- Data retention / cleanup flows.
- Additional UX polish and resilience work.

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
- Enforce one active session per printer while allowing different printers to record concurrently.
- Enforce 4-day maximum session duration across active recordings.
- Persist samples and notable thermal events.
- Live recording page with streaming graph.

### Phase 3: Session Review And Packaging

1. Save/discard completed sessions.
2. Saved sessions browser and filters.
3. Session detail and comparison views.
4. Event markers in live and saved-session graphs.
5. Docker Compose local run path and setup documentation.
6. Persistence hardening for Docker / Portainer redeploys.
7. Stable sample-table scrolling and timestamp rendering in the chosen deployment timezone.

### Phase 4: Background Watch Mode

- Per-printer background watch configuration.
- Rolling watch-sample persistence with fixed 2-second polling.
- Retention-window pruning for 4 / 8 / 12 / 24 hour histories.
- Recent watch-history view and first promotion hook into manual sessions.

### Phase 5: Reliability And Diagnostics

- Moonraker websocket ingestion.
- Heat-Up Analyzer.
- Heater Power Diagnostic.
- Cooling Impact Test Mode.
- Data-retention and cleanup flow.

### Phase 6: Diagnostic Tools II

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
- [x] Save/discard session flow implemented.
- [x] Saved sessions browser implemented.
- [x] Session comparison view implemented.
- [x] Event markers on graphs implemented.
- [x] Docker Compose local run path implemented.
- [x] Printer edit/delete UI implemented.
- [x] Frontend timezone rendering implemented.
- [x] Docker persistence hardening for Portainer redeploys implemented.
- [x] Sample table visible row limit control implemented.
- [ ] Background watch mode implemented.
- [ ] Websocket ingestion implemented.
- [ ] First diagnostic features implemented.

## Current Status

- Repository is initialized on `main` and pushed to GitHub.
- Backend FastAPI app runs from `backend/app` with config, SQLAlchemy setup, automatic table creation, and an in-process recording loop.
- Frontend React app includes printer management with edit/delete actions, live session control, a saved sessions browser, a first comparison workflow, horizontal primary navigation, and a review-first sessions layout.
- Printer profile CRUD endpoints, safe printer deletion, and session lifecycle endpoints exist.
- Session states support `active`, `completed`, `saved`, and `discarded`.
- TempWatch supports multiple active sessions across different printers, but still limits each printer to one active session and keeps the UI centered on one selected session at a time.
- Completed sessions can be saved with notes or discarded from the session detail flow.
- Saved sessions can be filtered by printer, reviewed with notes/sample counts, and compared two-at-a-time with elapsed or absolute alignment.
- Session and comparison graphs render persisted lifecycle events as markers using the stored `thermal_events` timeline, with explicit time-on-x and temperature-on-y axis framing.
- Active sessions capture normalized Moonraker temperature snapshots into persistent sample rows manually or through the background polling loop.
- Stale active sessions are automatically completed once they exceed the 4-day cap.
- If the backend restarts while a session is still active, the session remains active in SQLite and automated sampling resumes when the backend comes back up.
- Docker packaging mounts `/data`, points SQLite at `/data/tempwatch.db`, and now pins the named volume to `tempwatch_data` so Portainer redeploys reuse the same database location.
- Session detail now supports a user-selectable 5 / 10 / 25 visible-row limit with a sticky-header scrolling sample pane during auto-refresh.
- Frontend API configuration defaults to relative `/api/v1` calls so the same build works for Vite development and the Nginx reverse-proxy Docker path.
- API datetimes are now serialized as UTC with explicit `Z` suffixes, and the frontend currently renders all user-facing times in the deterministic `America/New_York` deployment timezone while Moonraker-host timezone discovery remains deferred.
- Docker CLI is not installed in this workspace, so the Compose files can only be statically validated here.
- Built frontend output has been verified to contain the updated horizontal navigation, axis-labelled chart, and deterministic Eastern-time formatting, but live Docker/Portainer rendering still requires verification on the deployment host.
- Background watch mode backend foundations now exist: dedicated watch config/sample tables, fixed 2-second polling hooks, rolling pruning, and promotion APIs are implemented, but the dedicated watch UI is still pending.

## Decision Log / Technical Notes

### 2026-03-21 to 2026-03-22

- Chosen repository roadmap file: `docs/ROADMAP.md`.
- Project started directly on `main` because the changes are incremental and locally reviewable.
- Frontend uses TypeScript to keep data contracts explicit across API boundaries.
- SQLite schema creation currently uses SQLAlchemy metadata on app startup; migrations can be added once schemas stabilize.
- Initial Moonraker integration is intentionally limited to HTTP connectivity checks and HTTP object queries before websocket recording is introduced.
- Snapshot ingestion started with HTTP object queries so data normalization and session persistence could be validated before websocket complexity.
- Automated recording uses an in-process polling loop because it fits the current single-backend deployment and keeps restart recovery straightforward.
- Thermal events are reserved for meaningful lifecycle/state transitions rather than every captured sample to avoid unbounded event noise.
- Graphing and comparison continue to use inline SVG so the review workflow stays dependency-light and easy to reason about.
- Main temperature traces must keep time on the horizontal axis and temperature on the vertical axis; event markers attach to the time axis so review and comparison match Klipper-style expectations.
- Saved-session review and comparison reuse the existing `recording_sessions`, `temperature_samples`, and `thermal_events` tables rather than introducing a second review-specific data model.
- Frontend API calls default to `/api/v1`, with Vite proxying local development traffic and Nginx proxying Docker traffic, so one frontend build target works across both run modes.
- Docker host port defaults were moved off the common `8080`/`8000` pair to `8480`/`8008` to reduce local conflicts during testing.
- Printer deletion is intentionally blocked once sessions exist so recorded diagnostics cannot be removed accidentally through profile cleanup.
- SQLite-backed datetimes are serialized back out of the API as explicit UTC `Z` timestamps to avoid timezone ambiguity at the frontend boundary.
- TempWatch currently uses a deterministic `America/New_York` display timezone in the frontend because Moonraker-host timezone discovery is not implemented yet.
- Portainer redeploy testing showed stack-scoped volume naming was not reliable enough, so the Docker volume name is now pinned explicitly for redeploy stability.

## Known Risks / Open Questions

- Automated sampling currently depends on the FastAPI process staying alive; a separate worker or websocket-driven path may still be needed later for stronger resilience.
- Moonraker websocket ingestion is still missing and intentionally lower priority than the current persistence and session-review slice.
- Moonraker field availability varies by printer setup; sample normalization will need defensive handling for custom chamber sensors and alternate object names.
- Printers with recorded sessions cannot be deleted, so long-term cleanup still needs a separate archive or purge flow for old data.
- Existing Docker-backed data created before the persistence hardening change may live in an old stack-scoped volume and may not carry over automatically once the persistence target is changed.
- Existing SQLite files created before future schema changes will eventually need a migration path.

## What Changed From The Original Plan

- The first implementation chunk combined scaffolding and the first backend domain slice instead of stopping after directory setup.
- SQLite bootstrap was implemented immediately because printer/session APIs depend on real persistence.
- Frontend printer management landed before deeper Moonraker work so local profile handling could be exercised end to end.
- Initial Moonraker work started with a narrow connectivity check rather than jumping straight to websocket streaming.
- Sample ingestion started with HTTP snapshot capture instead of websocket streaming so the storage layer could be validated with a simpler execution path.
- Session UI landed before automatic recording loops so manual capture and persisted sample review could be exercised from the browser first.
- Automated recording started with an in-process polling loop rather than a separate worker so the app stays simple and locally runnable.
- Save/review/comparison builds on the current session/sample/event tables instead of introducing separate comparison storage.
- Background watch mode is being introduced as a separate rolling-history model instead of overloading manual sessions, because unexpected passive capture and intentional diagnostic recordings have different lifecycle rules.
- Docker support ships as a reverse-proxy frontend plus backend API pair rather than trying to serve the built frontend directly from FastAPI.
- Websocket ingestion is explicitly deferred until after the current persistence, session-review, row-limit, and timezone slice is closed.

## Next Steps

1. Add printer UI controls for watch enable/disable and retention window selection using the new backend watch-config endpoints.
2. Add a first recent-history watch view for a selected printer and expose the initial watch-to-session promotion path if it stays clean in the UI.
3. Update README and environment docs so manual sessions versus background watch mode are clearly separated before closing the slice.
4. Only after background watch mode is complete, return to live deployment validation gaps and then websocket ingestion.

## Recent Completed Work Log

- 2026-03-21: Created the initial living roadmap and documented project phases.
- 2026-03-21: Initialized the repository, added setup docs, and scaffolded backend/frontend structure.
- 2026-03-21: Implemented SQLite-backed printer profile CRUD and session lifecycle endpoints.
- 2026-03-21: Added Moonraker connectivity diagnostics, printer uniqueness checks, and automatic stale-session cap enforcement.
- 2026-03-21: Added persistent temperature samples, thermal events, and HTTP snapshot capture/list endpoints for active sessions.
- 2026-03-21: Added a frontend sessions page for manual session control and sample inspection.
- 2026-03-21: Added an automated polling loop that resumes active-session sample capture when the backend is running.
- 2026-03-21: Added a first live session detail view with elapsed time, current readings, auto-refresh, and an inline SVG temperature graph.
- 2026-03-22: Added save/discard actions, a saved sessions browser, comparison overlays, and event markers.
- 2026-03-22: Added Dockerfiles, a root Compose stack, frontend proxy-aware API defaults, and setup documentation for local Docker-based runs.
- 2026-03-22: Added printer edit/delete flows, backend delete guards, and frontend profile editing controls.
- 2026-03-22: Fixed frontend timestamp localization to use the browser timezone and bounded the live sample table with scrolling.
- 2026-03-22: Pinned the Docker SQLite volume name and documented Portainer persistence and migration expectations.
- 2026-03-22: Added a selectable 5 / 10 / 25 visible-row limit for the live sample table and locked it to a stable scrolling pane during auto-refresh.
- 2026-03-22: Clarified the main temperature graph with explicit time and temperature axes so live and comparison traces read in the expected Klipper-style orientation.
- 2026-03-22: Reworked the sessions review layout so Start Session and Recent Sessions sit side by side on wider screens and Session Detail remains below as the primary review surface.
- 2026-03-22: Switched user-facing timestamp rendering to a deterministic Eastern Time fallback and added explicit UTC `Z` serialization for API datetime fields.
- 2026-03-22: Verified the built frontend bundle contains the updated navigation, chart, and timestamp logic, then hardened Docker frontend serving with no-store HTML headers and `pull_policy: build` to reduce stale Portainer deployments.
- 2026-03-22: Re-prioritized the roadmap around a separate Background Watch Mode slice that keeps passive rolling watch history distinct from manual sessions.
- 2026-03-22: Added the backend Background Watch Mode foundation with separate watch tables, rolling poll/prune behavior, and promotion APIs.

## Upcoming Commit Targets

- Commit 15: Add session sample-table row limits with stable scrolling during auto-refresh.
- Commit 16: Validate Docker persistence on a machine with Docker installed and close any packaging gaps in the current slice.
- Commit 17: Moonraker websocket ingestion baseline.