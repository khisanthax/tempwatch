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
