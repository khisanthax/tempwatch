export type WatchRetentionHours = 4 | 8 | 12 | 24;

export interface BackgroundWatchConfig {
  id: number;
  printer_id: number;
  is_enabled: boolean;
  retention_hours: WatchRetentionHours;
  poll_interval_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface PrinterProfile {
  id: number;
  name: string;
  base_url: string;
  api_key: string | null;
  notes: string | null;
  is_enabled: boolean;
  watch_config: BackgroundWatchConfig | null;
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

export interface BackgroundWatchConfigUpdate {
  is_enabled?: boolean;
  retention_hours?: WatchRetentionHours;
}

export interface BackgroundWatchPromoteInput {
  label?: string | null;
  save_notes?: string | null;
  hours?: WatchRetentionHours | null;
}

export type SessionStatus = "active" | "completed" | "saved" | "discarded";
export type ComparisonAlignment = "elapsed" | "absolute";

export interface SessionRecord {
  id: number;
  printer_id: number;
  label: string | null;
  started_at: string;
  ended_at: string | null;
  status: SessionStatus;
  stop_reason: string | null;
  save_notes: string | null;
  sample_count: number;
  created_at: string;
  updated_at: string;
}

export interface TemperatureTraceSample {
  id: number;
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

export interface TemperatureSample extends TemperatureTraceSample {
  session_id: number;
}

export interface BackgroundWatchSample extends TemperatureTraceSample {
  printer_id: number;
}

export interface ThermalEvent {
  id: number;
  session_id: number;
  event_type: string;
  message: string;
  event_time: string;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionCaptureResponse {
  session: SessionRecord;
  sample: TemperatureSample;
}
