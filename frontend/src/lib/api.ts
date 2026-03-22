import type {
  PrinterConnectionCheck,
  PrinterCreateInput,
  PrinterProfile,
  SessionCaptureResponse,
  SessionRecord,
  SessionStatus,
  TemperatureSample,
  ThermalEvent,
} from "../types/thermal";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `Request failed with ${response.status}`;

    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) {
        detail = payload.detail;
      }
    } catch {
      // Keep the fallback detail when the response body is not JSON.
    }

    throw new Error(detail);
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

export async function checkPrinterConnection(printerId: number): Promise<PrinterConnectionCheck> {
  const response = await fetch(`${apiBaseUrl}/printers/${printerId}/connection-check`);
  return readJson<PrinterConnectionCheck>(response);
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