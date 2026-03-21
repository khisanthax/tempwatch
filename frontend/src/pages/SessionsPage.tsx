import { FormEvent, useEffect, useMemo, useState } from "react";

import { captureSample, fetchPrinters, fetchSamples, fetchSessions, startSession, stopSession } from "../lib/api";
import type { PrinterProfile, SessionRecord, TemperatureSample } from "../types/thermal";

const ACTIVE_REFRESH_MS = 2000;
const CLOCK_REFRESH_MS = 1000;
const CHART_WIDTH = 720;
const CHART_HEIGHT = 240;

export function SessionsPage() {
  const [printers, setPrinters] = useState<PrinterProfile[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [samples, setSamples] = useState<TemperatureSample[]>([]);
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | "">("");
  const [sessionLabel, setSessionLabel] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionSessionId, setActionSessionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (selectedSessionId === null) {
      setSamples([]);
      return;
    }

    void loadSamples(selectedSessionId);
  }, [selectedSessionId]);

  const enabledPrinters = printers.filter((printer) => printer.is_enabled);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;
  const latestSample = samples[samples.length - 1] ?? null;
  const isSelectedSessionActive = selectedSession?.status === "active";

  useEffect(() => {
    if (!isSelectedSessionActive || selectedSessionId === null) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void refreshActiveSession(selectedSessionId);
    }, ACTIVE_REFRESH_MS);

    return () => window.clearInterval(intervalId);
  }, [isSelectedSessionActive, selectedSessionId]);

  useEffect(() => {
    if (!isSelectedSessionActive) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, CLOCK_REFRESH_MS);

    return () => window.clearInterval(intervalId);
  }, [isSelectedSessionActive]);

  async function loadData() {
    setIsLoading(true);
    setError(null);

    try {
      const [printerData, sessionData] = await Promise.all([fetchPrinters(), fetchSessions()]);
      setPrinters(printerData);
      setSessions(sessionData);
      if (printerData.length > 0 && selectedPrinterId === "") {
        const firstEnabled = printerData.find((printer) => printer.is_enabled) ?? printerData[0];
        setSelectedPrinterId(firstEnabled.id);
      }
      if (sessionData.length > 0 && selectedSessionId === null) {
        setSelectedSessionId(sessionData[0].id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load sessions");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadSamples(sessionId: number) {
    try {
      const sampleData = await fetchSamples(sessionId);
      setSamples(sampleData);
    } catch (sampleError) {
      setError(sampleError instanceof Error ? sampleError.message : "Failed to load samples");
    }
  }

  async function refreshActiveSession(sessionId: number) {
    try {
      const [sessionData, sampleData] = await Promise.all([fetchSessions(), fetchSamples(sessionId)]);
      setSessions(sessionData);
      setSamples(sampleData);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Failed to refresh active session");
    }
  }

  async function handleStartSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedPrinterId === "") {
      setError("Choose a printer before starting a session");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const session = await startSession(selectedPrinterId, sessionLabel.trim());
      setSessions((current) => [session, ...current].sort((left, right) => right.started_at.localeCompare(left.started_at)));
      setSelectedSessionId(session.id);
      setSessionLabel("");
      await loadSamples(session.id);
      setNow(Date.now());
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to start session");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCaptureSample(sessionId: number) {
    setActionSessionId(sessionId);
    setError(null);

    try {
      const result = await captureSample(sessionId);
      setSessions((current) =>
        current.map((session) => (session.id === result.session.id ? result.session : session)).sort((left, right) => right.started_at.localeCompare(left.started_at)),
      );
      if (selectedSessionId === sessionId) {
        setSamples((current) => [...current, result.sample].sort((left, right) => left.captured_at.localeCompare(right.captured_at)));
      }
      setNow(Date.now());
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : "Failed to capture sample");
    } finally {
      setActionSessionId(null);
    }
  }

  async function handleStopSession(sessionId: number) {
    setActionSessionId(sessionId);
    setError(null);

    try {
      const session = await stopSession(sessionId, "manual-stop");
      setSessions((current) => current.map((item) => (item.id === session.id ? session : item)));
      if (selectedSessionId === sessionId) {
        await loadSamples(sessionId);
      }
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : "Failed to stop session");
    } finally {
      setActionSessionId(null);
    }
  }

  function printerName(printerId: number): string {
    return printers.find((printer) => printer.id === printerId)?.name ?? `Printer ${printerId}`;
  }

  return (
    <section className="stack-lg">
      <header className="page-header">
        <div>
          <h2>Sessions</h2>
          <p>Start a manual recording session, inspect current readings, and review persisted temperature traces.</p>
        </div>
        <button className="ghost-button" type="button" onClick={() => void loadData()} disabled={isLoading}>
          Refresh
        </button>
      </header>

      {error ? <div className="alert">{error}</div> : null}

      <div className="session-layout">
        <div className="stack-md">
          <form className="panel stack-md" onSubmit={handleStartSession}>
            <div>
              <h3>Start session</h3>
              <p className="muted">Only one active session is allowed per printer.</p>
            </div>

            <label className="field">
              <span>Printer</span>
              <select
                value={selectedPrinterId}
                onChange={(event) => setSelectedPrinterId(event.target.value ? Number(event.target.value) : "")}
              >
                <option value="">Select a printer</option>
                {enabledPrinters.map((printer) => (
                  <option key={printer.id} value={printer.id}>
                    {printer.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Label</span>
              <input value={sessionLabel} onChange={(event) => setSessionLabel(event.target.value)} placeholder="PID tuning check" />
            </label>

            <button className="primary-button" type="submit" disabled={isSubmitting || enabledPrinters.length === 0}>
              {isSubmitting ? "Starting..." : "Start session"}
            </button>
          </form>

          <div className="panel stack-md">
            <div className="section-label">
              <h3>Recent sessions</h3>
              <span>{sessions.length} total</span>
            </div>

            {isLoading ? <p>Loading sessions...</p> : null}
            {!isLoading && sessions.length === 0 ? <p className="muted">No sessions yet.</p> : null}

            {!isLoading && sessions.length > 0
              ? sessions.map((session) => (
                  <article
                    className={session.id === selectedSessionId ? "session-card selected" : "session-card"}
                    key={session.id}
                    onClick={() => setSelectedSessionId(session.id)}
                  >
                    <div className="printer-card-header">
                      <div>
                        <h4>{session.label || "Untitled session"}</h4>
                        <p className="muted">{printerName(session.printer_id)}</p>
                      </div>
                      <span className={`status-pill ${session.status === "active" ? "active" : "inactive"}`}>{session.status}</span>
                    </div>
                    <p className="muted">Started: {new Date(session.started_at).toLocaleString()}</p>
                    <div className="card-actions">
                      {session.status === "active" ? (
                        <>
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleCaptureSample(session.id);
                            }}
                            disabled={actionSessionId === session.id}
                          >
                            {actionSessionId === session.id ? "Working..." : "Capture sample"}
                          </button>
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleStopSession(session.id);
                            }}
                            disabled={actionSessionId === session.id}
                          >
                            Stop
                          </button>
                        </>
                      ) : null}
                    </div>
                  </article>
                ))
              : null}
          </div>
        </div>

        <div className="stack-md">
          <div className="panel stack-md">
            <div className="section-label">
              <h3>Session detail</h3>
              <span>{samples.length} recorded</span>
            </div>

            {!selectedSession ? <p className="muted">Select a session to inspect captured samples.</p> : null}

            {selectedSession ? (
              <>
                <div className="sample-summary">
                  <div>
                    <strong>{selectedSession.label || "Untitled session"}</strong>
                    <p className="muted">{printerName(selectedSession.printer_id)}</p>
                  </div>
                  <span className={`status-pill ${selectedSession.status === "active" ? "active" : "inactive"}`}>{selectedSession.status}</span>
                </div>

                <div className="summary-grid">
                  <article className="metric-card">
                    <span className="metric-label">Elapsed</span>
                    <strong>{formatElapsed(selectedSession.started_at, selectedSession.ended_at, now)}</strong>
                  </article>
                  <article className="metric-card">
                    <span className="metric-label">Nozzle</span>
                    <strong>{formatMetric(latestSample?.nozzle_actual, latestSample?.nozzle_target, "C")}</strong>
                  </article>
                  <article className="metric-card">
                    <span className="metric-label">Bed</span>
                    <strong>{formatMetric(latestSample?.bed_actual, latestSample?.bed_target, "C")}</strong>
                  </article>
                  <article className="metric-card">
                    <span className="metric-label">Fan</span>
                    <strong>{formatPercent(latestSample?.fan_speed)}</strong>
                  </article>
                </div>

                {selectedSession.status === "active" ? <p className="muted">Active sessions auto-refresh every 2 seconds while this page is open.</p> : null}

                <TemperatureChart samples={samples} />

                {samples.length === 0 ? <p className="muted">No samples captured yet for this session.</p> : null}

                {samples.length > 0 ? (
                  <div className="sample-table">
                    <div className="sample-table-header">
                      <span>Time</span>
                      <span>Nozzle</span>
                      <span>Bed</span>
                      <span>Fan</span>
                      <span>State</span>
                    </div>
                    {samples.map((sample) => (
                      <div className="sample-table-row" key={sample.id}>
                        <span>{new Date(sample.captured_at).toLocaleTimeString()}</span>
                        <span>{formatTemperature(sample.nozzle_actual, sample.nozzle_target)}</span>
                        <span>{formatTemperature(sample.bed_actual, sample.bed_target)}</span>
                        <span>{formatPercent(sample.fan_speed)}</span>
                        <span>{sample.print_state ?? "unknown"}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function TemperatureChart({ samples }: { samples: TemperatureSample[] }) {
  const chartData = useMemo(() => buildChartData(samples), [samples]);

  if (chartData === null) {
    return <div className="chart-empty muted">Capture at least two samples to render the temperature graph.</div>;
  }

  return (
    <div className="chart-card">
      <div className="section-label">
        <h3>Temperature trace</h3>
        <div className="chart-legend">
          <span><i className="legend-swatch nozzle" />Nozzle</span>
          <span><i className="legend-swatch bed" />Bed</span>
        </div>
      </div>
      <svg className="temperature-chart" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label="Session temperature graph">
        {chartData.gridLines.map((line) => (
          <line key={line.y} x1="0" y1={line.y} x2={CHART_WIDTH} y2={line.y} className="chart-grid" />
        ))}
        <polyline className="chart-line nozzle" fill="none" points={chartData.nozzlePoints} />
        <polyline className="chart-line bed" fill="none" points={chartData.bedPoints} />
      </svg>
      <div className="chart-scale muted">
        <span>{chartData.minLabel}</span>
        <span>{chartData.maxLabel}</span>
      </div>
    </div>
  );
}

function buildChartData(samples: TemperatureSample[]) {
  const plotted = samples.filter((sample) => sample.nozzle_actual !== null || sample.bed_actual !== null);
  if (plotted.length < 2) {
    return null;
  }

  const timestamps = plotted.map((sample) => new Date(sample.captured_at).getTime());
  const values = plotted.flatMap((sample) => [sample.nozzle_actual, sample.bed_actual].filter((value): value is number => value !== null));
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const paddedMin = Math.max(0, Math.floor(minValue - 5));
  const paddedMax = Math.ceil(maxValue + 5);
  const valueRange = Math.max(1, paddedMax - paddedMin);
  const timeRange = Math.max(1, maxTime - minTime);

  function toPoint(timestamp: number, value: number | null) {
    const x = ((timestamp - minTime) / timeRange) * CHART_WIDTH;
    const yValue = value ?? paddedMin;
    const y = CHART_HEIGHT - ((yValue - paddedMin) / valueRange) * CHART_HEIGHT;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }

  const nozzlePoints = plotted.map((sample) => toPoint(new Date(sample.captured_at).getTime(), sample.nozzle_actual)).join(" ");
  const bedPoints = plotted.map((sample) => toPoint(new Date(sample.captured_at).getTime(), sample.bed_actual)).join(" ");
  const gridLines = Array.from({ length: 5 }, (_, index) => ({ y: (CHART_HEIGHT / 4) * index }));

  return {
    nozzlePoints,
    bedPoints,
    gridLines,
    minLabel: `${paddedMin}C`,
    maxLabel: `${paddedMax}C`,
  };
}

function formatTemperature(actual: number | null, target: number | null): string {
  if (actual === null && target === null) {
    return "-";
  }

  const actualText = actual === null ? "-" : `${actual.toFixed(1)}C`;
  const targetText = target === null ? "-" : `${target.toFixed(1)}C`;
  return `${actualText} / ${targetText}`;
}

function formatMetric(actual: number | null | undefined, target: number | null | undefined, unit: string): string {
  if (actual == null && target == null) {
    return "-";
  }

  const actualText = actual == null ? "-" : `${actual.toFixed(1)}${unit}`;
  const targetText = target == null ? "-" : `${target.toFixed(1)}${unit}`;
  return `${actualText} / ${targetText}`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) {
    return "-";
  }

  return `${Math.round(value * 100)}%`;
}

function formatElapsed(startedAt: string, endedAt: string | null, now: number): string {
  const startMs = new Date(startedAt).getTime();
  const endMs = endedAt ? new Date(endedAt).getTime() : now;
  const totalSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}