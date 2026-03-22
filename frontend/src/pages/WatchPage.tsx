import { FormEvent, useEffect, useMemo, useState } from "react";

import { TemperatureChart } from "../components/TemperatureChart";
import { fetchBackgroundWatchSamples, fetchPrinters, promoteBackgroundWatchHistory } from "../lib/api";
import { DISPLAY_TIMEZONE, formatDisplayDateTime, formatDisplayTime } from "../lib/time";
import type { BackgroundWatchSample, PrinterProfile } from "../types/thermal";

const WATCH_TABLE_HEADER_HEIGHT_PX = 46;
const WATCH_ROW_HEIGHT_PX = 52;
const WATCH_ROW_GAP_PX = 6;
const DEFAULT_VISIBLE_ROWS = 10;
const WATCH_ROW_LIMIT_OPTIONS = [5, 10, 25] as const;
const WATCH_REFRESH_INTERVAL_MS = 4000;

export function WatchPage() {
  const [printers, setPrinters] = useState<PrinterProfile[]>([]);
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | "">("");
  const [watchSamples, setWatchSamples] = useState<BackgroundWatchSample[]>([]);
  const [promotionLabel, setPromotionLabel] = useState("");
  const [promotionNotes, setPromotionNotes] = useState("");
  const [visibleRows, setVisibleRows] = useState<number>(DEFAULT_VISIBLE_ROWS);
  const [isLoading, setIsLoading] = useState(true);
  const [isPromoting, setIsPromoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadPrinters();
  }, []);

  const selectedPrinter = printers.find((printer) => printer.id === selectedPrinterId) ?? null;
  const watchConfig = selectedPrinter?.watch_config ?? null;
  const sampleTableScrollMaxHeight = useMemo(() => {
    return WATCH_TABLE_HEADER_HEIGHT_PX + visibleRows * WATCH_ROW_HEIGHT_PX + Math.max(0, visibleRows - 1) * WATCH_ROW_GAP_PX;
  }, [visibleRows]);

  useEffect(() => {
    if (selectedPrinterId === "") {
      setWatchSamples([]);
      return;
    }

    void loadWatchSamples(selectedPrinterId);
  }, [selectedPrinterId, printers]);

  useEffect(() => {
    if (selectedPrinterId === "" || selectedPrinter?.watch_config?.is_enabled !== true) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadWatchSamples(selectedPrinterId, { silent: true });
    }, WATCH_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [selectedPrinter, selectedPrinterId]);

  async function loadPrinters() {
    setIsLoading(true);
    setError(null);

    try {
      const printerData = await fetchPrinters();
      setPrinters(printerData);
      if (printerData.length > 0 && selectedPrinterId === "") {
        setSelectedPrinterId(printerData[0].id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load printers");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadWatchSamples(printerId: number, options?: { silent?: boolean }) {
    if (!options?.silent) {
      setError(null);
      setMessage(null);
    }

    try {
      const printer = printers.find((candidate) => candidate.id === printerId);
      const hours = printer?.watch_config?.retention_hours;
      const sampleData = await fetchBackgroundWatchSamples(printerId, hours ? { hours } : undefined);
      setWatchSamples(sampleData);
    } catch (loadError) {
      if (!options?.silent) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load watch history");
      }
    }
  }

  async function handlePromote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedPrinterId === "" || watchConfig === null) {
      return;
    }

    setIsPromoting(true);
    setError(null);
    setMessage(null);

    try {
      const session = await promoteBackgroundWatchHistory(selectedPrinterId, {
        label: promotionLabel.trim() || null,
        save_notes: promotionNotes.trim() || null,
        hours: watchConfig.retention_hours,
      });
      setMessage(`Created saved session "${session.label || `Session ${session.id}`}" from the current watch window.`);
      setPromotionLabel("");
      setPromotionNotes("");
    } catch (promotionError) {
      setError(promotionError instanceof Error ? promotionError.message : "Failed to promote watch history");
    } finally {
      setIsPromoting(false);
    }
  }

  return (
    <section className="stack-lg">
      <header className="page-header page-header-wrap">
        <div>
          <h2>Background watch</h2>
          <p>Review passive rolling watch history that runs independently from intentional manual diagnostic sessions.</p>
        </div>
        <button className="ghost-button" type="button" onClick={() => void loadPrinters()} disabled={isLoading}>
          Refresh
        </button>
      </header>

      <p className="muted page-note">Times are shown in {DISPLAY_TIMEZONE}. Background watch polls every 2 seconds, and this page refreshes retained history automatically while a watched printer stays enabled.</p>

      {error ? <div className="alert">{error}</div> : null}
      {message ? <div className="connection-result success">{message}</div> : null}

      <div className="panel stack-md">
        <label className="field field-inline">
          <span>Printer</span>
          <select value={selectedPrinterId} onChange={(event) => setSelectedPrinterId(event.target.value ? Number(event.target.value) : "")}>
            <option value="">Select a printer</option>
            {printers.map((printer) => (
              <option key={printer.id} value={printer.id}>
                {printer.name}
              </option>
            ))}
          </select>
        </label>

        {selectedPrinter ? (
          <div className="summary-grid">
            <article className="metric-card">
              <span className="metric-label">Watch mode</span>
              <strong>{watchConfig?.is_enabled ? "Enabled" : "Disabled"}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Retention</span>
              <strong>{watchConfig ? `${watchConfig.retention_hours} hours` : "-"}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Recent samples</span>
              <strong>{watchSamples.length}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Latest sample</span>
              <strong>{watchSamples.length > 0 ? formatDisplayDateTime(watchSamples[watchSamples.length - 1].captured_at) : "No data"}</strong>
            </article>
          </div>
        ) : null}

        {!selectedPrinter && !isLoading ? <p className="muted">Select a printer to inspect rolling watch history.</p> : null}
        {selectedPrinter && watchConfig?.is_enabled !== true ? (
          <p className="muted">Background Watch is currently disabled for this printer. Enable it on the Printers page to begin collecting rolling history.</p>
        ) : null}
        {selectedPrinter && watchConfig?.is_enabled === true && watchSamples.length === 0 ? (
          <p className="muted">No watch samples are stored in the current rolling window for this printer yet.</p>
        ) : null}

        {selectedPrinter && watchSamples.length > 0 ? (
          <TemperatureChart
            primary={{
              label: `${selectedPrinter.name} watch`,
              colorClass: "primary",
              samples: watchSamples,
              events: [],
            }}
          />
        ) : null}

        {selectedPrinter && watchConfig ? (
          <form className="panel inset-panel stack-md" onSubmit={handlePromote}>
            <div>
              <h3>Promote current watch window</h3>
              <p className="muted">Create a saved manual-session record from the current {watchConfig.retention_hours}-hour watch window.</p>
            </div>
            <label className="field">
              <span>Session label</span>
              <input
                value={promotionLabel}
                onChange={(event) => setPromotionLabel(event.target.value)}
                placeholder="Unexpected thermal fault window"
              />
            </label>
            <label className="field">
              <span>Save notes</span>
              <textarea
                rows={3}
                value={promotionNotes}
                onChange={(event) => setPromotionNotes(event.target.value)}
                placeholder="Why this rolling watch window matters"
              />
            </label>
            <div className="card-actions">
              <button className="primary-button" type="submit" disabled={isPromoting || watchSamples.length === 0}>
                {isPromoting ? "Promoting..." : `Promote ${watchConfig.retention_hours}h window`}
              </button>
            </div>
          </form>
        ) : null}

        {selectedPrinter && watchSamples.length > 0 ? (
          <div className="sample-table">
            <div className="section-label sample-table-toolbar">
              <h3>Recent watch samples</h3>
              <div className="sample-table-toolbar-actions">
                <label className="field field-inline sample-row-limit-control">
                  <span>Visible rows</span>
                  <select value={visibleRows} onChange={(event) => setVisibleRows(Number(event.target.value))}>
                    {WATCH_ROW_LIMIT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <span>{watchSamples.length} retained</span>
              </div>
            </div>
            <div className="sample-table-scroll" style={{ maxHeight: `${sampleTableScrollMaxHeight}px` }}>
              <div className="sample-table-header">
                <span>Time</span>
                <span>Nozzle</span>
                <span>Bed</span>
                <span>Fan</span>
                <span>State</span>
              </div>
              <div className="sample-table-body">
                {watchSamples.map((sample) => (
                  <div className="sample-table-row" key={sample.id}>
                    <span>{formatDisplayTime(sample.captured_at)}</span>
                    <span>{formatTemperature(sample.nozzle_actual, sample.nozzle_target)}</span>
                    <span>{formatTemperature(sample.bed_actual, sample.bed_target)}</span>
                    <span>{formatPercent(sample.fan_speed)}</span>
                    <span>{sample.print_state ?? "unknown"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
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

function formatPercent(value: number | null | undefined): string {
  if (value == null) {
    return "-";
  }

  return `${Math.round(value * 100)}%`;
}
