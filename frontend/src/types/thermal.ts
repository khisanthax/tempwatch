export interface PrinterProfile {
  id: number;
  name: string;
  base_url: string;
  api_key: string | null;
  notes: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface PrinterCreateInput {
  name: string;
  base_url: string;
  api_key?: string | null;
  notes?: string | null;
  is_enabled: boolean;
}

export interface PrinterConnectionCheck {
  printer_id: number;
  reachable: boolean;
  status_code: number | null;
  message: string;
  moonraker_version: string | null;
  klippy_state: string | null;
}

export type SessionStatus = "active" | "completed" | "saved" | "discarded";

export interface SessionRecord {
  id: number;
  printer_id: number;
  label: string | null;
  started_at: string;
  ended_at: string | null;
  status: SessionStatus;
  stop_reason: string | null;
  save_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemperatureSample {
  id: number;
  session_id: number;
  captured_at: string;
  nozzle_actual: number | null;
  nozzle_target: number | null;
  bed_actual: number | null;
  bed_target: number | null;
  chamber_actual: number | null;
  heater_power: number | null;
  fan_speed: number | null;
  print_state: string | null;
  source: string;
  raw_payload: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionCaptureResponse {
  session: SessionRecord;
  sample: TemperatureSample;
}
