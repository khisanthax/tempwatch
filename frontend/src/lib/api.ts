import type {
  BackgroundWatchConfig,
  BackgroundWatchConfigUpdate,
  BackgroundWatchPromoteInput,
  BackgroundWatchSample,
  PreservedWatchCapture,
  PreservedWatchSample,
  PreservedWatchTriggerEvent,
  PrinterConnectionCheck,
  PrinterCreateInput,
  PrinterProfile,
  SessionCaptureResponse,
  SessionRecord,
  SessionStatus,
  TemperatureSample,
  ThermalEvent,
  WatchRetentionHours,
} from "../types/thermal";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

async function buildError(response: Response): Promise<Error> {
  let detail = `Request failed with ${response.status}`;

  try {
    const payload = (await response.json()) as { detail?: string };
    if (payload.detail) {
      detail = payload.detail;
    }
  } catch {
    // Keep the fallback detail when the response body is not JSON.
  }

  return new Error(detail);
}

async function ensureSuccess(response: Response): Promise<void> {
  if (!response.ok) {
    throw await buildError(response);
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await buildError(response);
  }

  return (await response.json()) as T;
}

export async function fetchPrinters(): Promise<PrinterProfile[]> {
  const response = await fetch(`${apiBaseUrl}/printers`);
  return readJson<PrinterProfile[]>(response);
}

export async function createPrinter(payload: PrinterCreateInput): Promise<PrinterProfile> {
  const response = await fetch(`${apiBaseUrl}/printers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson<PrinterProfile>(response);
}

export async function updatePrinter(printerId: number, payload: PrinterCreateInput): Promise<PrinterProfile> {
  const response = await fetch(`${apiBaseUrl}/printers/${printerId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson<PrinterProfile>(response);
}

export async function deletePrinter(printerId: number): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/printers/${printerId}`, {
    method: "DELETE",
  });

  await ensureSuccess(response);
}

export async function checkPrinterConnection(printerId: number): Promise<PrinterConnectionCheck> {
  const response = await fetch(`${apiBaseUrl}/printers/${printerId}/connection-check`);
  return readJson<PrinterConnectionCheck>(response);
}

export async function updateBackgroundWatchConfig(
  printerId: number,
  payload: BackgroundWatchConfigUpdate,
): Promise<BackgroundWatchConfig> {
  const response = await fetch(`${apiBaseUrl}/printers/${printerId}/watch-config`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson<BackgroundWatchConfig>(response);
}

export async function fetchBackgroundWatchSamples(
  printerId: number,
  options?: { hours?: WatchRetentionHours },
): Promise<BackgroundWatchSample[]> {
  const params = new URLSearchParams();
  if (options?.hours !== undefined) {
    params.set("hours", String(options.hours));
  }

  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetch(`${apiBaseUrl}/printers/${printerId}/watch/samples${suffix}`);
  return readJson<BackgroundWatchSample[]>(response);
}

export async function promoteBackgroundWatchHistory(
  printerId: number,
  payload: BackgroundWatchPromoteInput,
): Promise<SessionRecord> {
  const response = await fetch(`${apiBaseUrl}/printers/${printerId}/watch/promote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      label: payload.label || null,
      save_notes: payload.save_notes || null,
      hours: payload.hours || null,
    }),
  });

  return readJson<SessionRecord>(response);
}

export async function fetchPreservedWatchCaptures(options?: { printerId?: number }): Promise<PreservedWatchCapture[]> {
  const params = new URLSearchParams();
  if (options?.printerId !== undefined) {
    params.set("printer_id", String(options.printerId));
  }

  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetch(`${apiBaseUrl}/preserved-watch-captures${suffix}`);
  return readJson<PreservedWatchCapture[]>(response);
}

export async function fetchPreservedWatchCapture(captureId: number): Promise<PreservedWatchCapture> {
  const response = await fetch(`${apiBaseUrl}/preserved-watch-captures/${captureId}`);
  return readJson<PreservedWatchCapture>(response);
}

export async function fetchPreservedWatchSamples(captureId: number): Promise<PreservedWatchSample[]> {
  const response = await fetch(`${apiBaseUrl}/preserved-watch-captures/${captureId}/samples`);
  return readJson<PreservedWatchSample[]>(response);
}

export async function fetchPreservedWatchTriggers(captureId: number): Promise<PreservedWatchTriggerEvent[]> {
  const response = await fetch(`${apiBaseUrl}/preserved-watch-captures/${captureId}/triggers`);
  return readJson<PreservedWatchTriggerEvent[]>(response);
}

export async function fetchSessions(options?: { printerId?: number; status?: SessionStatus }): Promise<SessionRecord[]> {
  const params = new URLSearchParams();
  if (options?.printerId !== undefined) {
    params.set("printer_id", String(options.printerId));
  }
  if (options?.status !== undefined) {
    params.set("status", options.status);
  }

  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetch(`${apiBaseUrl}/sessions${suffix}`);
  return readJson<SessionRecord[]>(response);
}

export async function fetchSession(sessionId: number): Promise<SessionRecord> {
  const response = await fetch(`${apiBaseUrl}/sessions/${sessionId}`);
  return readJson<SessionRecord>(response);
}

export async function startSession(printerId: number, label: string): Promise<SessionRecord> {
  const response = await fetch(`${apiBaseUrl}/printers/${printerId}/sessions/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ label: label || null }),
  });

  return readJson<SessionRecord>(response);
}

export async function stopSession(sessionId: number, stopReason?: string): Promise<SessionRecord> {
  const response = await fetch(`${apiBaseUrl}/sessions/${sessionId}/stop`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ stop_reason: stopReason || null }),
  });

  return readJson<SessionRecord>(response);
}

export async function saveSession(sessionId: number, saveNotes?: string): Promise<SessionRecord> {
  const response = await fetch(`${apiBaseUrl}/sessions/${sessionId}/save`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ save_notes: saveNotes || null }),
  });

  return readJson<SessionRecord>(response);
}

export async function discardSession(sessionId: number): Promise<SessionRecord> {
  const response = await fetch(`${apiBaseUrl}/sessions/${sessionId}/discard`, {
    method: "POST",
  });

  return readJson<SessionRecord>(response);
}

export async function fetchSamples(sessionId: number): Promise<TemperatureSample[]> {
  const response = await fetch(`${apiBaseUrl}/sessions/${sessionId}/samples`);
  return readJson<TemperatureSample[]>(response);
}

export async function fetchSessionEvents(sessionId: number): Promise<ThermalEvent[]> {
  const response = await fetch(`${apiBaseUrl}/sessions/${sessionId}/events`);
  return readJson<ThermalEvent[]>(response);
}

export async function captureSample(sessionId: number): Promise<SessionCaptureResponse> {
  const response = await fetch(`${apiBaseUrl}/sessions/${sessionId}/samples/capture`, {
    method: "POST",
  });

  return readJson<SessionCaptureResponse>(response);
}
