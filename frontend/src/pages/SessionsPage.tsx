import { FormEvent, useEffect, useState } from "react";

import { captureSample, fetchPrinters, fetchSamples, fetchSessions, startSession, stopSession } from "../lib/api";
import type { PrinterProfile, SessionRecord, TemperatureSample } from "../types/thermal";

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

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;

  return (
    <section className="stack-lg">
      <header className="page-header">
        <div>
          <h2>Sessions</h2>
          <p>Start a manual recording session, capture Moonraker snapshots on demand, and inspect stored samples.</p>
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

        <div className="panel stack-md">
          <div className="section-label">
            <h3>Session samples</h3>
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
    </section>
  );
}

function formatTemperature(actual: number | null, target: number | null): string {
  if (actual === null && target === null) {
    return "-";
  }

  const actualText = actual === null ? "-" : `${actual.toFixed(1)}C`;
  const targetText = target === null ? "-" : `${target.toFixed(1)}C`;
  return `${actualText} / ${targetText}`;
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return "-";
  }

  return `${Math.round(value * 100)}%`;
}