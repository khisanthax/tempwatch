# TempWatch Roadmap

## Project Overview

TempWatch is a local-first web app for recording and analyzing 3D printer thermal behavior from Moonraker/Klipper printers. The app supports multiple printer profiles, manual recording sessions, rolling background watch history, SQLite-backed persistence, saved-session review, and staged diagnostic tooling for common thermal failures such as heater weakness, fan interference, PID instability, and wiring faults.

## Goals

- Provide a maintainable local web app with a FastAPI backend and React frontend.
- Support multiple Moonraker/Klipper printers with saved connection profiles.
- Allow manual start/stop temperature recording, limited to one active session per printer.
- Enforce a hard cap of 4 days per recording session.
- Persist completed sessions so users can save or discard them after review.
- Add optional per-printer rolling watch capture for unexpected thermal issues.
- Enable later comparison of saved sessions and diagnostic workflows.
- Keep local installation straightforward with both direct dev and Docker Compose run paths.

## Non-Goals

- Cloud-hosted telemetry or always-on fleet monitoring.
- Full printer management beyond thermal observation and diagnostics.
- Auto-starting manual recordings without explicit user action.
- Supporting more than one active manual recording session per printer at a time.

## Architecture Plan

### Backend

- FastAPI application under `backend/`.
- SQLAlchemy ORM with SQLite for local persistence.
- Service layer for printer profiles, manual-session lifecycle, background watch lifecycle, and Moonraker integration.
- In-process recording loop for active manual sessions and enabled watch-mode printers while the backend is running.
- Pydantic settings for environment-driven configuration.

### Frontend

- React + TypeScript application under `frontend/`.
- Vite for local development/build.
- React Router for app structure.
- Feature-oriented UI modules for printers, manual sessions, background watch history, live charts, saved-session review, and diagnostics.
- API client layer targeting local FastAPI endpoints.
- Inline SVG charts reused across live review, background watch history, and saved-session comparison to stay dependency-light.

### Storage

- SQLite database initialized from SQLAlchemy metadata on backend startup.
- Current tables: `printer_profiles`, `recording_sessions`, `temperature_samples`, `thermal_events`, `background_watch_configs`, `background_watch_samples`.
- Manual sessions and background watch histories are intentionally stored separately so passive rolling capture does not blur intentional diagnostic recording lifecycles.
- Planned tables: analyzer outputs and any future diagnostic metadata that needs separate persistence.
- Docker deployments keep the SQLite file on a persistent mounted path that survives container replacement.
- Docker Compose targets an explicit named volume so Portainer redeploys reuse a stable SQLite location.

### Moonraker Strategy

- Current baseline: HTTP connectivity check against `server/info`.
- Manual-session and watch-mode sample capture uses HTTP object queries against `printer/objects/query`.
- Automated recording uses an in-process polling loop to capture roughly one sample per second for active manual sessions and every two seconds for enabled watch-mode printers.
- Websocket ingestion is intentionally deferred until the current watch-mode and reliability slices are complete and stable.
- Normalize nozzle, bed, chamber, target, power, fan, and state metadata where available.

## Priority Order

### Current Active Slice: Smart Watch Mode

Background Watch and event-triggered preservation are implemented. The next session-focused enhancement is Smart Watch: automatic full-print session capture tied to Moonraker/Klipper print lifecycle while keeping manual sessions, rolling watch history, and auto-preserved captures as separate concepts.

1. Add a per-printer Smart Watch enable/disable control separate from Background Watch.
2. Detect print lifecycle using explicit Moonraker print state and filename metadata where available.
3. Automatically create a recording session when a print starts and avoid duplicates if a session already exists for that printer.
4. Keep the same session through pause/resume and stop plus save it on terminal print states such as completed, canceled, or error/shutdown when distinguishable.
5. Keep Smart Watch sessions clearly distinguishable from manual sessions and preserved watch captures in both storage and UI.
6. Keep websocket ingestion deferred unless this slice proves it is strictly necessary later.

### Next Priority Slice

1. Validate Docker and Portainer runtime behavior end to end on a host with Docker installed, including persistence across redeploys.
2. Add reliability hardening around Moonraker outages, watch-mode status reporting, and Smart Watch observability.
3. Only after that, return to Moonraker websocket ingestion.
4. Then begin first diagnostic helpers.

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

### Phase 5: Event-Triggered Preservation

- Rule-based anomaly detection during Background Watch polling.
- Auto-preserved fault captures that survive rolling watch pruning.
- Trigger metadata persistence and review UI.
- First preserved-capture graph/detail workflow.

### Phase 6: Smart Watch Mode

- Per-printer Smart Watch configuration.
- Print lifecycle detection using Moonraker print state and filename metadata.
- Automatic session start on print begin and automatic stop plus save on terminal states.
- Collision handling with existing manual sessions and safe restart behavior.
- Smart Watch session metadata and UI labeling that stay separate from manual sessions and preserved watch captures.

### Phase 7: Reliability And Diagnostics

- Docker / Portainer runtime validation on a real host.
- Moonraker websocket ingestion.
- Heat-Up Analyzer.
- Heater Power Diagnostic.
- Cooling Impact Test Mode.
- Data-retention and cleanup flow.

### Phase 8: Diagnostic Tools II

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
- [x] Background watch mode fully verified and complete.
- [x] Event-triggered preservation implemented.
- [ ] Smart Watch mode implemented.
- [ ] Docker runtime redeploy validation completed on a real host.
- [ ] Websocket ingestion implemented.
- [ ] First diagnostic features implemented.

## Current Status

- Repository is initialized on `main` and pushed to GitHub.
- Backend FastAPI app runs from `backend/app` with config, SQLAlchemy setup, automatic table creation, and an in-process recording loop.
- Frontend React app includes printer management with edit/delete actions, live session control, a saved sessions browser, a first comparison workflow, horizontal primary navigation, a review-first sessions layout, and a dedicated Background Watch page.
- Printer profile CRUD endpoints, safe printer deletion, manual-session lifecycle endpoints, and per-printer watch configuration endpoints exist.
- Session states support `active`, `completed`, `saved`, and `discarded`.
- TempWatch supports multiple active manual sessions across different printers, but still limits each printer to one active manual session and keeps the UI centered on one selected session at a time.
- Background Watch is optional per printer, uses fixed 2-second polling, and stores rolling watch samples separately from manual sessions.
- Watch history pruning is verified: stale rows are deleted by timestamp for all configured printers every backend loop cycle, even when no new watch sample is captured.
- Retention-window changes prune existing watch rows immediately, and restart-safe polling avoids duplicate watch samples inside the configured 2-second interval.
- Backend restart resumes watch mode from persisted configuration, but TempWatch does not backfill samples that were missed while the backend process was offline.
- Event-triggered preservation is now available end to end with backend trigger detection, preserved-capture persistence, preserved-capture APIs, and a dedicated review page in the frontend.
- Smart Watch is the active implementation slice. Backend lifecycle handling is implemented, while per-printer controls and session metadata still need the frontend pass.
- The polling loop now uses Moonraker `print_stats` state plus filename transitions to auto-create Smart Watch sessions, keep them active through pauses, auto-stop plus save them on terminal states, and suppress duplicates when another active session already exists for that printer.
- The Watch page can inspect recent rolling history for a selected printer, auto-refresh retained samples, and promote the current watch window into a saved manual session.
- Completed manual sessions can be saved with notes or discarded from the session detail flow.
- Saved sessions can be filtered by printer, reviewed with notes/sample counts, and compared two-at-a-time with elapsed or absolute alignment.
- Session and comparison graphs render persisted lifecycle events as markers using the stored `thermal_events` timeline, with explicit time-on-x and temperature-on-y axis framing.
- Active manual sessions capture normalized Moonraker temperature snapshots into persistent sample rows manually or through the background polling loop.
- If the backend restarts while a manual session is still active or watch mode is enabled on a printer, SQLite retains that state and automated sampling resumes when the backend comes back up.
- Docker packaging mounts `/data`, points SQLite at `/data/tempwatch.db`, and pins the named volume to `tempwatch_data` so Portainer redeploys reuse the same database location.
- Session detail supports a user-selectable 5 / 10 / 25 visible-row limit with a sticky-header scrolling sample pane during auto-refresh.
- Frontend API configuration defaults to relative `/api/v1` calls so the same build works for Vite development and the Nginx reverse-proxy Docker path.
- API datetimes are serialized as UTC with explicit `Z` suffixes, and the frontend currently renders all user-facing times in the deterministic `America/New_York` deployment timezone while Moonraker-host timezone discovery remains deferred.
- Docker CLI is not installed in this workspace, so the Compose files can only be statically validated here.

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
- Background Watch uses separate `background_watch_configs` and `background_watch_samples` tables rather than overloading manual sessions, because passive rolling capture and intentional diagnostics have different lifecycle rules.
- TempWatch allows multiple active manual sessions across different printers, but the UI remains optimized for reviewing one selected printer/session at a time.
- Frontend API calls default to `/api/v1`, with Vite proxying local development traffic and Nginx proxying Docker traffic, so one frontend build target works across both run modes.
- Docker host port defaults were moved off the common `8080`/`8000` pair to `8480`/`8008` to reduce local conflicts during testing.
- Printer deletion is intentionally blocked once sessions exist so recorded diagnostics cannot be removed accidentally through profile cleanup.
- SQLite-backed datetimes are serialized back out of the API as explicit UTC `Z` timestamps to avoid timezone ambiguity at the frontend boundary.
- TempWatch currently uses a deterministic `America/New_York` display timezone in the frontend because Moonraker-host timezone discovery is not implemented yet.
- Portainer redeploy testing showed stack-scoped volume naming was not reliable enough, so the Docker volume name is now pinned explicitly for redeploy stability.
- Background Watch window promotion creates a saved manual session copy instead of mutating watch data so rolling history stays disposable and the promoted diagnostic artifact becomes a normal saved session.
- Background Watch pruning now runs independently of successful sample capture so disabled printers, transient Moonraker failures, and loop restarts do not allow stale watch rows to accumulate indefinitely.
- SQLite row retention is bounded by the watch window, but the physical database file may not shrink on every prune because SQLite reuses freed pages.
- Event-triggered preservation should stay rule-based and explicit in its first version; do not introduce heuristic scoring or ML-style classification until the preserved-capture workflow is stable.
- Smart Watch should reuse the session model where practical, but its metadata and lifecycle must stay distinct from both manual sessions and watch preservation.
- The first Smart Watch implementation should stay explicit and inspectable: use Moonraker `print_stats` state and filename transitions, not inferred heuristics.

## Known Risks / Open Questions

- Automated sampling currently depends on the FastAPI process staying alive; a separate worker or websocket-driven path may still be needed later for stronger resilience.
- Moonraker websocket ingestion is still missing and intentionally lower priority than the current watch-mode and runtime-validation slice.
- Moonraker field availability varies by printer setup; sample normalization will need defensive handling for custom chamber sensors and alternate object names.
- Printers with recorded sessions cannot be deleted, so long-term cleanup still needs a separate archive or purge flow for old data.
- Existing Docker-backed data created before the persistence hardening change may live in an old stack-scoped volume and may not carry over automatically once the persistence target is changed.
- Existing SQLite files created before future schema changes will eventually need a migration path.
- Background Watch currently stores rolling samples but not a separate persisted event timeline beyond the sample payload fields.
- Missed watch samples during backend downtime are not backfilled; only duplicate-safe resume behavior is currently implemented.
- Event-triggered preservation thresholds are intentionally hardcoded in code and documented in README until a minimal configuration layer proves necessary.
- Smart Watch needs honest restart semantics; automatic recovery is valuable, but missing pre-restart print history should be documented if the first version cannot reattach perfectly.

## What Changed From The Original Plan

- The first implementation chunk combined scaffolding and the first backend domain slice instead of stopping after directory setup.
- SQLite bootstrap was implemented immediately because printer/session APIs depend on real persistence.
- Frontend printer management landed before deeper Moonraker work so local profile handling could be exercised end to end.
- Initial Moonraker work started with a narrow connectivity check rather than jumping straight to websocket streaming.
- Sample ingestion started with HTTP snapshot capture instead of websocket streaming so the storage layer could be validated with a simpler execution path.
- Session UI landed before automatic recording loops so manual capture and persisted sample review could be exercised from the browser first.
- Automated recording started with an in-process polling loop rather than a separate worker so the app stays simple and locally runnable.
- Save/review/comparison builds on the current session/sample/event tables instead of introducing separate comparison storage.
- Background Watch was introduced as a separate rolling-history model instead of overloading manual sessions, because unexpected passive capture and intentional diagnostic recordings have different lifecycle rules.
- Docker support ships as a reverse-proxy frontend plus backend API pair rather than trying to serve the built frontend directly from FastAPI.
- Websocket ingestion remains explicitly deferred until after the current watch-mode and runtime-validation work is closed.

## Next Steps

1. Add per-printer Smart Watch controls and make Smart Watch sessions visibly distinct in existing session review flows.
2. Surface Smart Watch metadata such as filename, recovery start, and auto-stop reason in session detail and saved-session views.
3. Document Smart Watch print-state detection, pause behavior, collision handling, and restart limitations honestly.
4. Only after that, return to Docker runtime validation and then websocket ingestion.

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
- 2026-03-22: Fixed frontend timestamp localization and bounded the live sample table with scrolling.
- 2026-03-22: Pinned the Docker SQLite volume name and documented Portainer persistence and migration expectations.
- 2026-03-22: Added a selectable 5 / 10 / 25 visible-row limit for the live sample table and locked it to a stable scrolling pane during auto-refresh.
- 2026-03-22: Clarified the main temperature graph with explicit time and temperature axes so live and comparison traces read in the expected Klipper-style orientation.
- 2026-03-22: Reworked the sessions review layout so Start Session and Recent Sessions sit side by side on wider screens and Session Detail remains below as the primary review surface.
- 2026-03-22: Switched user-facing timestamp rendering to a deterministic Eastern Time fallback and added explicit UTC `Z` serialization for API datetime fields.
- 2026-03-22: Verified the built frontend bundle contains the updated navigation, chart, and timestamp logic, then hardened Docker frontend serving with no-store HTML headers and `pull_policy: build` to reduce stale Portainer deployments.
- 2026-03-22: Re-prioritized the roadmap around a separate Background Watch Mode slice that keeps passive rolling watch history distinct from manual sessions.
- 2026-03-22: Added the backend Background Watch Mode foundation with separate watch tables, rolling poll/prune behavior, and promotion APIs.
- 2026-03-22: Added the first watch-mode frontend slice with per-printer watch controls, a dedicated watch history page, rolling history auto-refresh, and documentation updates.
- 2026-03-22: Re-opened the watch-mode slice to verify and harden rolling retention before marking the feature complete.
- 2026-03-22: Verified Background Watch retention with backend tests and loop-level cleanup so stale watch rows are pruned continuously without contaminating manual-session storage.
- 2026-03-22: Re-prioritized the roadmap so Event-Triggered Preservation becomes the next Background Watch enhancement.
- 2026-03-22: Added backend event-triggered preservation with rule-based watch triggers, preserved capture tables, and backend verification that preserved rows survive rolling watch pruning.
- 2026-03-22: Added the preserved-capture frontend review page, trigger markers, and documentation for the first end-to-end event-triggered preservation flow.
- 2026-04-02: Re-prioritized the roadmap so Smart Watch becomes the next session-lifecycle enhancement after Background Watch and preserved captures.
- 2026-04-02: Clarified that the first Smart Watch implementation should use explicit `print_stats` lifecycle detection, separate Smart Watch metadata, and no heuristic trigger logic.
- 2026-04-02: Added backend Smart Watch lifecycle handling with separate config/session metadata, automatic start/save on print-state transitions, pause-safe continuity, and duplicate-session collision protection.

## Upcoming Commit Targets

- Commit 17: Add Smart Watch controls and session visibility in the UI.
- Commit 18: Document Smart Watch behavior and then validate Docker and Portainer runtime behavior on a host with Docker installed.
