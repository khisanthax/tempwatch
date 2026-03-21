import json
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from fastapi import HTTPException, status

from app.models import PrinterProfile


class MoonrakerClient:
    def __init__(self, timeout_seconds: float = 5.0):
        self.timeout_seconds = timeout_seconds

    def check_connection(self, printer: PrinterProfile) -> dict[str, str | int | bool | None]:
        payload = self._get_json(printer, "server/info")
        result = payload.get("result", {})
        klippy_state = result.get("klippy_state")
        if klippy_state is None:
            klippy_state = "connected" if result.get("klippy_connected") else "disconnected"

        return {
            "reachable": True,
            "status_code": 200,
            "message": "Moonraker responded successfully",
            "moonraker_version": result.get("moonraker_version") or result.get("version"),
            "klippy_state": klippy_state,
        }

    def fetch_temperature_snapshot(self, printer: PrinterProfile) -> dict[str, object]:
        payload = self._get_json(printer, "printer/objects/query?extruder&heater_bed&fan&print_stats")
        status_payload = payload.get("result", {}).get("status", {})

        extruder = status_payload.get("extruder", {})
        bed = status_payload.get("heater_bed", {})
        fan = status_payload.get("fan", {})
        print_stats = status_payload.get("print_stats", {})

        snapshot = {
            "nozzle_actual": self._to_float(extruder.get("temperature")),
            "nozzle_target": self._to_float(extruder.get("target")),
            "bed_actual": self._to_float(bed.get("temperature")),
            "bed_target": self._to_float(bed.get("target")),
            "chamber_actual": self._extract_chamber_temperature(status_payload),
            "heater_power": self._to_float(extruder.get("power")),
            "fan_speed": self._to_float(fan.get("speed")),
            "print_state": print_stats.get("state"),
            "raw_payload": json.dumps(payload),
            "source": "moonraker-http",
        }

        if all(snapshot[key] is None for key in ("nozzle_actual", "bed_actual", "chamber_actual", "fan_speed", "heater_power")):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Moonraker responded but did not include usable temperature data",
            )

        return snapshot

    def _get_json(self, printer: PrinterProfile, path: str) -> dict[str, object]:
        request = Request(
            urljoin(f"{printer.base_url.rstrip('/')}/", path),
            headers={
                "Accept": "application/json",
                **({"X-Api-Key": printer.api_key} if printer.api_key else {}),
            },
        )

        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Moonraker returned HTTP {exc.code}",
            ) from exc
        except URLError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Moonraker connection failed: {exc.reason}",
            ) from exc

    @staticmethod
    def _to_float(value: object) -> float | None:
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @classmethod
    def _extract_chamber_temperature(cls, status_payload: dict[str, object]) -> float | None:
        for key, value in status_payload.items():
            if not isinstance(value, dict):
                continue
            if "temperature" not in value:
                continue
            if "chamber" not in key and "enclosure" not in key:
                continue
            return cls._to_float(value.get("temperature"))
        return None
