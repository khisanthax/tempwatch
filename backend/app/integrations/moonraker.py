from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen
import json

from app.models import PrinterProfile


class MoonrakerClient:
    def __init__(self, timeout_seconds: float = 5.0):
        self.timeout_seconds = timeout_seconds

    def check_connection(self, printer: PrinterProfile) -> dict[str, str | int | bool | None]:
        request = Request(
            urljoin(f"{printer.base_url.rstrip('/')}/", "server/info"),
            headers={
                "Accept": "application/json",
                **({"X-Api-Key": printer.api_key} if printer.api_key else {}),
            },
        )

        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
                result = payload.get("result", {})
                klippy_state = result.get("klippy_state")
                if klippy_state is None:
                    klippy_state = "connected" if result.get("klippy_connected") else "disconnected"

                return {
                    "reachable": True,
                    "status_code": response.status,
                    "message": "Moonraker responded successfully",
                    "moonraker_version": result.get("moonraker_version") or result.get("version"),
                    "klippy_state": klippy_state,
                }
        except HTTPError as exc:
            return {
                "reachable": False,
                "status_code": exc.code,
                "message": f"Moonraker returned HTTP {exc.code}",
                "moonraker_version": None,
                "klippy_state": None,
            }
        except URLError as exc:
            return {
                "reachable": False,
                "status_code": None,
                "message": str(exc.reason),
                "moonraker_version": None,
                "klippy_state": None,
            }
