import { Dispatch, SetStateAction, useEffect, useMemo, useState } from "react";

import { TemperatureChart } from "../components/TemperatureChart";
import {
  fetchPreservedWatchCaptures,
  fetchPreservedWatchSamples,
  fetchPreservedWatchTriggers,
  fetchPrinters,
} from "../lib/api";
import { DISPLAY_TIMEZONE, formatDisplayDateTime, getTimestampMs } from "../lib/time";
import type {
  PreservedWatchCapture,
  PreservedWatchSample,
  PreservedWatchTriggerEvent,
  PrinterProfile,
  ThermalEvent,
} from "../types/thermal";

export function PreservedCapturesPage() {
  const [printers, setPrinters] = useState<PrinterProfile[]>([]);
  const [captures, setCaptures] = useState<PreservedWatchCapture[]>([]);
  const [filterPrinterId, setFilterPrinterId] = useState<number | "">("");
  const [selectedCaptureId, setSelectedCaptureId] = useState<number | "">("");
  const [samples, setSamples] = useState<PreservedWatchSample[]>([]);
  const [triggers, setTriggers] = useState<PreservedWatchTriggerEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void loadPreservedCaptures();
  }, []);

  useEffect(() => {
    if (selectedCaptureId === "") {
      setSamples([]);
      setTriggers([]);
      return;
    }

    void loadCaptureAssets(selectedCaptureId, setSamples, setTriggers);
  }, [selectedCaptureId]);

  async function loadPreservedCaptures() {
    setIsLoading(true);
    setError(null);

    try {
      const [printerData, captureData] = await Promise.all([fetchPrinters(), fetchPreservedWatchCaptures()]);
      setPrinters(printerData);
      setCaptures(captureData);
      if (captureData.length > 0 && selectedCaptureId === "") {
        setSelectedCaptureId(captureData[0].id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load preserved captures");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadCaptureAssets(
    captureId: number,
    setCaptureSamples: Dispatch<SetStateAction<PreservedWatchSample[]>>,
    setCaptureTriggers: Dispatch<SetStateAction<PreservedWatchTriggerEvent[]>>,
  ) {
    try {
      const [sampleData, triggerData] = await Promise.all([
        fetchPreservedWatchSamples(captureId),
        fetchPreservedWatchTriggers(captureId),
      ]);
      setCaptureSamples(sampleData);
      setCaptureTriggers(triggerData);
    } catch (assetError) {
      setError(assetError instanceof Error ? assetError.message : "Failed to load preserved capture details");
    }
  }

  const filteredCaptures = captures.filter((capture) => filterPrinterId === "" || capture.printer_id === filterPrinterId);
  const selectedCapture = filteredCaptures.find((capture) => capture.id === selectedCaptureId) ?? null;
  const chartEvents = useMemo<ThermalEvent[]>(() => {
    if (selectedCapture === null) {
      return [];
    }

    return triggers.map((trigger) => ({
      id: trigger.id,
      session_id: selectedCapture.id,
      event_type: trigger.trigger_rule,
      message: trigger.trigger_reason,
      event_time: trigger.event_time,
      metadata_json: trigger.metadata_json,
      created_at: trigger.created_at,
      updated_at: trigger.updated_at,
    }));
  }, [selectedCapture, triggers]);

  function printerName(printerId: number): string {
    return printers.find((printer) => printer.id === printerId)?.name ?? `Printer ${printerId}`;
  }

  return (
    <section className="stack-lg">
      <header className="page-header page-header-wrap">
        <div>
          <h2>Preserved watch captures</h2>
          <p>Review fault windows that TempWatch auto-preserved from Background Watch after a trigger rule fired.</p>
        </div>
        <button className="ghost-button" type="button" onClick={() => void loadPreservedCaptures()} disabled={isLoading}>
          Refresh
        </button>
      </header>

      <p className="muted page-note">
        Times are shown in {DISPLAY_TIMEZONE}. These records are auto-preserved from watch mode and are not pruned by normal rolling watch cleanup.
      </p>

      {error ? <div className="alert">{error}</div> : null}

      <div className="panel stack-md">
        <div className="section-label">
          <h3>Preserved list</h3>
          <span>{filteredCaptures.length} shown</span>
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

        {isLoading ? <p>Loading preserved captures...</p> : null}
        {!isLoading && filteredCaptures.length === 0 ? <p className="muted">No preserved watch captures yet.</p> : null}

        {filteredCaptures.length > 0 ? (
          <div className="saved-session-list">
            {filteredCaptures.map((capture) => (
              <button
                className={`panel inset-panel stack-sm capture-card${capture.id === selectedCaptureId ? " selected" : ""}`}
                key={capture.id}
                type="button"
                onClick={() => setSelectedCaptureId(capture.id)}
              >
                <div className="printer-card-header">
                  <div>
                    <h4>{capture.trigger_reason}</h4>
                    <p className="muted">{printerName(capture.printer_id)}</p>
                  </div>
                  <span className={capture.status === "finalized" ? "status-pill inactive" : "status-pill active"}>
                    {capture.status}
                  </span>
                </div>
                <p className="muted">Rule: {capture.trigger_rule}</p>
                <p className="muted">Triggered: {formatDisplayDateTime(capture.trigger_time)}</p>
                <p className="muted">Window: {formatDisplayDateTime(capture.capture_start_at)} to {formatDisplayDateTime(capture.capture_end_at)}</p>
                <p className="muted">Samples: {capture.sample_count} � Trigger events: {capture.trigger_count}</p>
                <p className="capture-label">Auto-preserved from Background Watch</p>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {selectedCapture ? (
        <div className="panel stack-md">
          <div className="section-label">
            <h3>Preserved detail</h3>
            <span>{selectedCapture.status === "finalized" ? "Frozen" : "Collecting post-trigger window"}</span>
          </div>

          <div className="summary-grid">
            <article className="metric-card">
              <span className="metric-label">Printer</span>
              <strong>{printerName(selectedCapture.printer_id)}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Triggered</span>
              <strong>{formatDisplayDateTime(selectedCapture.trigger_time)}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Samples</span>
              <strong>{selectedCapture.sample_count}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Status</span>
              <strong>{selectedCapture.status}</strong>
            </article>
          </div>

          {samples.length > 1 ? (
            <TemperatureChart
              primary={{
                label: `${printerName(selectedCapture.printer_id)} preserved`,
                colorClass: "primary",
                samples,
                events: chartEvents,
              }}
            />
          ) : (
            <p className="muted">Preserved sample data is still being collected for this capture.</p>
          )}

          <div className="panel inset-panel stack-sm">
            <h4>Trigger events</h4>
            {triggers.length === 0 ? <p className="muted">No trigger events recorded for this preserved capture.</p> : null}
            {triggers.map((trigger) => (
              <div className="trigger-event" key={trigger.id}>
                <strong>{trigger.trigger_rule}</strong>
                <span>{formatDisplayDateTime(trigger.event_time)}</span>
                <p>{trigger.trigger_reason}</p>
              </div>
            ))}
          </div>

          <p className="muted">
            Duration covered: {formatDuration(selectedCapture.capture_start_at, selectedCapture.finalized_at ?? selectedCapture.capture_end_at)}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function formatDuration(startedAt: string, endedAt: string): string {
  const totalSeconds = Math.max(0, Math.floor((getTimestampMs(endedAt) - getTimestampMs(startedAt)) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
