import { Dispatch, SetStateAction, useEffect, useState } from "react";

import { TemperatureChart } from "../components/TemperatureChart";
import { fetchPrinters, fetchSamples, fetchSessionEvents, fetchSessions } from "../lib/api";
import type { ComparisonAlignment, PrinterProfile, SessionRecord, TemperatureSample, ThermalEvent } from "../types/thermal";

export function SavedSessionsPage() {
  const [printers, setPrinters] = useState<PrinterProfile[]>([]);
  const [savedSessions, setSavedSessions] = useState<SessionRecord[]>([]);
  const [filterPrinterId, setFilterPrinterId] = useState<number | "">("");
  const [primarySessionId, setPrimarySessionId] = useState<number | "">("");
  const [secondarySessionId, setSecondarySessionId] = useState<number | "">("");
  const [primarySamples, setPrimarySamples] = useState<TemperatureSample[]>([]);
  const [secondarySamples, setSecondarySamples] = useState<TemperatureSample[]>([]);
  const [primaryEvents, setPrimaryEvents] = useState<ThermalEvent[]>([]);
  const [secondaryEvents, setSecondaryEvents] = useState<ThermalEvent[]>([]);
  const [alignment, setAlignment] = useState<ComparisonAlignment>("elapsed");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void loadSavedSessions();
  }, []);

  useEffect(() => {
    if (primarySessionId === "") {
      setPrimarySamples([]);
      setPrimaryEvents([]);
      return;
    }

    void loadSessionAssets(primarySessionId, setPrimarySamples, setPrimaryEvents);
  }, [primarySessionId]);

  useEffect(() => {
    if (secondarySessionId === "") {
      setSecondarySamples([]);
      setSecondaryEvents([]);
      return;
    }

    void loadSessionAssets(secondarySessionId, setSecondarySamples, setSecondaryEvents);
  }, [secondarySessionId]);

  async function loadSavedSessions() {
    setIsLoading(true);
    setError(null);

    try {
      const [printerData, sessionData] = await Promise.all([fetchPrinters(), fetchSessions({ status: "saved" })]);
      setPrinters(printerData);
      setSavedSessions(sessionData);
      if (sessionData.length > 0 && primarySessionId === "") {
        setPrimarySessionId(sessionData[0].id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load saved sessions");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadSessionAssets(
    sessionId: number,
    setSamples: Dispatch<SetStateAction<TemperatureSample[]>>,
    setEvents: Dispatch<SetStateAction<ThermalEvent[]>>,
  ) {
    try {
      const [sampleData, eventData] = await Promise.all([fetchSamples(sessionId), fetchSessionEvents(sessionId)]);
      setSamples(sampleData);
      setEvents(eventData);
    } catch (assetError) {
      setError(assetError instanceof Error ? assetError.message : "Failed to load session assets");
    }
  }

  const filteredSessions = savedSessions.filter((session) => filterPrinterId === "" || session.printer_id === filterPrinterId);
  const primarySession = filteredSessions.find((session) => session.id === primarySessionId) ?? null;
  const secondarySession = filteredSessions.find((session) => session.id === secondarySessionId) ?? null;

  function printerName(printerId: number): string {
    return printers.find((printer) => printer.id === printerId)?.name ?? `Printer ${printerId}`;
  }

  return (
    <section className="stack-lg">
      <header className="page-header">
        <div>
          <h2>Saved sessions</h2>
          <p>Review completed sessions that were kept for diagnostics and compare two runs from the same printer.</p>
        </div>
        <button className="ghost-button" type="button" onClick={() => void loadSavedSessions()} disabled={isLoading}>
          Refresh
        </button>
      </header>

      {error ? <div className="alert">{error}</div> : null}

      <div className="panel stack-md">
        <div className="section-label">
          <h3>Saved browser</h3>
          <span>{filteredSessions.length} shown</span>
        </div>
        <label className="field field-inline">
          <span>Filter by printer</span>
          <select value={filterPrinterId} onChange={(event) => setFilterPrinterId(event.target.value ? Number(event.target.value) : "") }>
            <option value="">All printers</option>
            {printers.map((printer) => (
              <option key={printer.id} value={printer.id}>
                {printer.name}
              </option>
            ))}
          </select>
        </label>

        {isLoading ? <p>Loading saved sessions...</p> : null}
        {!isLoading && filteredSessions.length === 0 ? <p className="muted">No saved sessions yet.</p> : null}

        {filteredSessions.length > 0 ? (
          <div className="saved-session-list">
            {filteredSessions.map((session) => (
              <article className="panel inset-panel stack-sm" key={session.id}>
                <div className="printer-card-header">
                  <div>
                    <h4>{session.label || "Untitled session"}</h4>
                    <p className="muted">{printerName(session.printer_id)}</p>
                  </div>
                  <span className="status-pill inactive">saved</span>
                </div>
                <p className="muted">{new Date(session.started_at).toLocaleString()} to {session.ended_at ? new Date(session.ended_at).toLocaleString() : "in progress"}</p>
                <p className="muted">Duration: {formatDuration(session.started_at, session.ended_at)}</p>
                <p className="muted">Samples: {session.sample_count}</p>
                <p>{session.save_notes || "No notes recorded."}</p>
              </article>
            ))}
          </div>
        ) : null}
      </div>

      <div className="panel stack-md">
        <div className="section-label">
          <h3>Compare sessions</h3>
          <span>{alignment === "elapsed" ? "Elapsed alignment" : "Absolute alignment"}</span>
        </div>

        <div className="comparison-controls">
          <label className="field">
            <span>Session A</span>
            <select value={primarySessionId} onChange={(event) => setPrimarySessionId(event.target.value ? Number(event.target.value) : "") }>
              <option value="">Select a saved session</option>
              {filteredSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {printerName(session.printer_id)} - {session.label || `Session ${session.id}`}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Session B</span>
            <select value={secondarySessionId} onChange={(event) => setSecondarySessionId(event.target.value ? Number(event.target.value) : "") }>
              <option value="">Select a second saved session</option>
              {filteredSessions
                .filter((session) => primarySession === null || session.printer_id === primarySession.printer_id)
                .filter((session) => session.id !== primarySessionId)
                .map((session) => (
                  <option key={session.id} value={session.id}>
                    {printerName(session.printer_id)} - {session.label || `Session ${session.id}`}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>Alignment</span>
            <select value={alignment} onChange={(event) => setAlignment(event.target.value as ComparisonAlignment)}>
              <option value="elapsed">Elapsed time</option>
              <option value="absolute">Absolute timestamp</option>
            </select>
          </label>
        </div>

        {primarySession && secondarySession ? (
          <TemperatureChart
            alignment={alignment}
            primary={{
              label: primarySession.label || `Session ${primarySession.id}`,
              colorClass: "primary",
              samples: primarySamples,
              events: primaryEvents,
            }}
            secondary={{
              label: secondarySession.label || `Session ${secondarySession.id}`,
              colorClass: "secondary",
              samples: secondarySamples,
              events: secondaryEvents,
            }}
          />
        ) : (
          <p className="muted">Select two saved sessions from the same printer to compare nozzle and bed traces.</p>
        )}
      </div>
    </section>
  );
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  const endMs = endedAt ? new Date(endedAt).getTime() : Date.now();
  const totalSeconds = Math.max(0, Math.floor((endMs - new Date(startedAt).getTime()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}