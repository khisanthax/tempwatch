import { FormEvent, useEffect, useState } from "react";

import {
  checkPrinterConnection,
  createPrinter,
  deletePrinter,
  fetchPrinters,
  updateBackgroundWatchConfig,
  updatePrinter,
} from "../lib/api";
import type {
  PrinterConnectionCheck,
  PrinterCreateInput,
  PrinterProfile,
  WatchRetentionHours,
} from "../types/thermal";

const initialForm: PrinterCreateInput = {
  name: "",
  base_url: "http://moonraker.local",
  api_key: "",
  notes: "",
  is_enabled: true,
};

const WATCH_RETENTION_OPTIONS: WatchRetentionHours[] = [4, 8, 12, 24];

function sortPrinters(printers: PrinterProfile[]): PrinterProfile[] {
  return [...printers].sort((left, right) => left.name.localeCompare(right.name));
}

function buildWatchDrafts(printers: PrinterProfile[]): Record<number, { is_enabled: boolean; retention_hours: WatchRetentionHours }> {
  return Object.fromEntries(
    printers.map((printer) => [
      printer.id,
      {
        is_enabled: printer.watch_config?.is_enabled ?? false,
        retention_hours: printer.watch_config?.retention_hours ?? 4,
      },
    ]),
  );
}

export function PrintersPage() {
  const [printers, setPrinters] = useState<PrinterProfile[]>([]);
  const [form, setForm] = useState<PrinterCreateInput>(initialForm);
  const [editingPrinterId, setEditingPrinterId] = useState<number | null>(null);
  const [checks, setChecks] = useState<Record<number, PrinterConnectionCheck>>({});
  const [watchDrafts, setWatchDrafts] = useState<Record<number, { is_enabled: boolean; retention_hours: WatchRetentionHours }>>({});
  const [isChecking, setIsChecking] = useState<Record<number, boolean>>({});
  const [isSavingWatch, setIsSavingWatch] = useState<Record<number, boolean>>({});
  const [deletingPrinterId, setDeletingPrinterId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadPrinters();
  }, []);

  function resetForm() {
    setForm(initialForm);
    setEditingPrinterId(null);
  }

  async function loadPrinters() {
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchPrinters();
      const sorted = sortPrinters(data);
      setPrinters(sorted);
      setWatchDrafts(buildWatchDrafts(sorted));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load printers");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const payload: PrinterCreateInput = {
      ...form,
      api_key: form.api_key?.trim() || null,
      notes: form.notes?.trim() || null,
      base_url: form.base_url.trim(),
      name: form.name.trim(),
    };

    try {
      if (editingPrinterId === null) {
        const created = await createPrinter(payload);
        const next = sortPrinters([...printers, created]);
        setPrinters(next);
        setWatchDrafts(buildWatchDrafts(next));
      } else {
        const updated = await updatePrinter(editingPrinterId, payload);
        const next = sortPrinters(printers.map((printer) => (printer.id === updated.id ? updated : printer)));
        setPrinters(next);
        setWatchDrafts(buildWatchDrafts(next));
        setChecks((current) => {
          const nextChecks = { ...current };
          delete nextChecks[updated.id];
          return nextChecks;
        });
      }

      resetForm();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save printer");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleEdit(printer: PrinterProfile) {
    setEditingPrinterId(printer.id);
    setForm({
      name: printer.name,
      base_url: printer.base_url,
      api_key: printer.api_key ?? "",
      notes: printer.notes ?? "",
      is_enabled: printer.is_enabled,
    });
    setError(null);
  }

  async function handleDelete(printer: PrinterProfile) {
    const confirmed = window.confirm(`Delete printer profile "${printer.name}"? This is blocked if sessions already exist.`);
    if (!confirmed) {
      return;
    }

    setDeletingPrinterId(printer.id);
    setError(null);

    try {
      await deletePrinter(printer.id);
      const next = printers.filter((candidate) => candidate.id !== printer.id);
      setPrinters(next);
      setWatchDrafts(buildWatchDrafts(next));
      setChecks((current) => {
        const nextChecks = { ...current };
        delete nextChecks[printer.id];
        return nextChecks;
      });
      if (editingPrinterId === printer.id) {
        resetForm();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete printer");
    } finally {
      setDeletingPrinterId(null);
    }
  }

  async function handleConnectionCheck(printerId: number) {
    setIsChecking((current) => ({ ...current, [printerId]: true }));
    setError(null);

    try {
      const result = await checkPrinterConnection(printerId);
      setChecks((current) => ({ ...current, [printerId]: result }));
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "Connection check failed");
    } finally {
      setIsChecking((current) => ({ ...current, [printerId]: false }));
    }
  }

  async function handleSaveWatch(printer: PrinterProfile) {
    const draft = watchDrafts[printer.id];
    if (!draft) {
      return;
    }

    setIsSavingWatch((current) => ({ ...current, [printer.id]: true }));
    setError(null);

    try {
      const watchConfig = await updateBackgroundWatchConfig(printer.id, draft);
      const next = sortPrinters(
        printers.map((candidate) => (candidate.id === printer.id ? { ...candidate, watch_config: watchConfig } : candidate)),
      );
      setPrinters(next);
      setWatchDrafts(buildWatchDrafts(next));
    } catch (watchError) {
      setError(watchError instanceof Error ? watchError.message : "Failed to update watch settings");
    } finally {
      setIsSavingWatch((current) => ({ ...current, [printer.id]: false }));
    }
  }

  return (
    <section className="stack-lg">
      <header className="page-header">
        <div>
          <h2>Printers</h2>
          <p>Save Moonraker endpoints here, then decide whether each printer should also run passive rolling Background Watch.</p>
        </div>
        <button className="ghost-button" type="button" onClick={() => void loadPrinters()} disabled={isLoading}>
          Refresh
        </button>
      </header>

      {error ? <div className="alert">{error}</div> : null}

      <div className="printer-layout">
        <form className="panel stack-md" onSubmit={handleSubmit}>
          <div>
            <h3>{editingPrinterId === null ? "Add printer" : "Edit printer"}</h3>
            <p className="muted">
              {editingPrinterId === null ? "Profiles are local to this TempWatch instance." : "Update the Moonraker endpoint or metadata for this printer."}
            </p>
          </div>

          <label className="field">
            <span>Name</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Voron 2.4"
              required
            />
          </label>

          <label className="field">
            <span>Moonraker URL</span>
            <input
              value={form.base_url}
              onChange={(event) => setForm((current) => ({ ...current, base_url: event.target.value }))}
              placeholder="http://printer.local"
              required
            />
          </label>

          <label className="field">
            <span>API key</span>
            <input
              value={form.api_key ?? ""}
              onChange={(event) => setForm((current) => ({ ...current, api_key: event.target.value }))}
              placeholder="Optional"
            />
          </label>

          <label className="field">
            <span>Notes</span>
            <textarea
              value={form.notes ?? ""}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Location, hotend, known issues, or wiring notes"
              rows={4}
            />
          </label>

          <label className="checkbox-row">
            <input
              checked={form.is_enabled}
              onChange={(event) => setForm((current) => ({ ...current, is_enabled: event.target.checked }))}
              type="checkbox"
            />
            <span>Enable this printer for recording sessions</span>
          </label>

          <div className="card-actions">
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : editingPrinterId === null ? "Save printer" : "Update printer"}
            </button>
            {editingPrinterId !== null ? (
              <button className="ghost-button" type="button" onClick={resetForm} disabled={isSubmitting}>
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>

        <div className="stack-md">
          <div className="section-label">
            <h3>Saved printers</h3>
            <span>{printers.length} total</span>
          </div>

          {isLoading ? <div className="panel">Loading printers...</div> : null}

          {!isLoading && printers.length === 0 ? (
            <div className="panel empty-state">No printers saved yet. Add a Moonraker profile to get started.</div>
          ) : null}

          {!isLoading && printers.length > 0
            ? printers.map((printer) => {
                const check = checks[printer.id];
                const isDeleting = deletingPrinterId === printer.id;
                const isEditing = editingPrinterId === printer.id;
                const isSavingWatchSettings = Boolean(isSavingWatch[printer.id]);
                const watchDraft = watchDrafts[printer.id] ?? {
                  is_enabled: printer.watch_config?.is_enabled ?? false,
                  retention_hours: printer.watch_config?.retention_hours ?? 4,
                };
                return (
                  <article className="panel stack-sm" key={printer.id}>
                    <div className="printer-card-header">
                      <div>
                        <h4>{printer.name}</h4>
                        <p className="muted">{printer.base_url}</p>
                      </div>
                      <span className={printer.is_enabled ? "status-pill active" : "status-pill inactive"}>
                        {printer.is_enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>

                    {printer.notes ? <p>{printer.notes}</p> : <p className="muted">No notes yet.</p>}

                    <div className="watch-config-panel stack-sm">
                      <div>
                        <h5>Background Watch</h5>
                        <p className="muted">Rolling passive history is stored separately from manual sessions, polled every 2 seconds, and pruned to the selected window.</p>
                      </div>
                      <label className="checkbox-row">
                        <input
                          checked={watchDraft.is_enabled}
                          onChange={(event) =>
                            setWatchDrafts((current) => ({
                              ...current,
                              [printer.id]: { ...watchDraft, is_enabled: event.target.checked },
                            }))
                          }
                          type="checkbox"
                        />
                        <span>Enable Background Watch for this printer</span>
                      </label>
                      <label className="field field-inline">
                        <span>Retention window</span>
                        <select
                          value={watchDraft.retention_hours}
                          onChange={(event) =>
                            setWatchDrafts((current) => ({
                              ...current,
                              [printer.id]: { ...watchDraft, retention_hours: Number(event.target.value) as WatchRetentionHours },
                            }))
                          }
                        >
                          {WATCH_RETENTION_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option} hours
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="card-actions">
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => void handleSaveWatch(printer)}
                          disabled={isSavingWatchSettings || isDeleting}
                        >
                          {isSavingWatchSettings ? "Saving watch..." : "Apply watch settings"}
                        </button>
                      </div>
                    </div>

                    <div className="card-actions">
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => void handleConnectionCheck(printer.id)}
                        disabled={Boolean(isChecking[printer.id]) || isDeleting}
                      >
                        {isChecking[printer.id] ? "Checking..." : "Check connection"}
                      </button>
                      <button className="ghost-button" type="button" onClick={() => handleEdit(printer)} disabled={isDeleting}>
                        {isEditing ? "Editing" : "Edit"}
                      </button>
                      <button className="ghost-button" type="button" onClick={() => void handleDelete(printer)} disabled={isDeleting}>
                        {isDeleting ? "Deleting..." : "Delete"}
                      </button>
                    </div>

                    {check ? (
                      <div className={check.reachable ? "connection-result success" : "connection-result failure"}>
                        <strong>{check.reachable ? "Moonraker reachable" : "Moonraker unreachable"}</strong>
                        <span>{check.message}</span>
                        {check.moonraker_version ? <span>Version: {check.moonraker_version}</span> : null}
                        {check.klippy_state ? <span>Klippy: {check.klippy_state}</span> : null}
                      </div>
                    ) : null}
                  </article>
                );
              })
            : null}
        </div>
      </div>
    </section>
  );
}
