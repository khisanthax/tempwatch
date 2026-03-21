import type { PrinterConnectionCheck, PrinterCreateInput, PrinterProfile } from "../types/thermal";

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
