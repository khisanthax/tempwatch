import { FormEvent, useEffect, useState } from "react";

import { createPrinter, fetchPrinters } from "../lib/api";
import type { PrinterCreateInput, PrinterProfile } from "../types/thermal";

const initialForm: PrinterCreateInput = {
  name: "",
  base_url: "http://moonraker.local",
  api_key: "",
  notes: "",
  is_enabled: true,
};

export function PrintersPage() {
  const [printers, setPrinters] = useState<PrinterProfile[]>([]);
  const [form, setForm] = useState<PrinterCreateInput>(initialForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadPrinters();
  }, []);

  async function loadPrinters() {
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchPrinters();
      setPrinters(data);
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

    try {
      const created = await createPrinter({
        ...form,
        api_key: form.api_key?.trim() || null,
        notes: form.notes?.trim() || null,
        base_url: form.base_url.trim(),
        name: form.name.trim(),
      });

      setPrinters((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name)));
      setForm(initialForm);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save printer");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="stack-lg">
      <header className="page-header">
        <div>
          <h2>Printers</h2>
          <p>Save Moonraker endpoints here so manual recording sessions can target the right printer.</p>
        </div>
        <button className="ghost-button" type="button" onClick={() => void loadPrinters()} disabled={isLoading}>
          Refresh
        </button>
      </header>

      {error ? <div className="alert">{error}</div> : null}

      <div className="printer-layout">
        <form className="panel stack-md" onSubmit={handleSubmit}>
          <div>
            <h3>Add printer</h3>
            <p className="muted">Profiles are local to this TempWatch instance.</p>
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

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save printer"}
          </button>
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
            ? printers.map((printer) => (
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
                </article>
              ))
            : null}
        </div>
      </div>
    </section>
  );
}
