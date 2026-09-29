"""SMS gateway adapters. `console` logs instead of sending (default for dev)."""
import logging
from dataclasses import dataclass

import httpx

from app.core.config import get_settings

log = logging.getLogger(__name__)


@dataclass
class SendResult:
    phone: str
    ok: bool
    ref: str | None = None
    error: str | None = None


class ConsoleSms:
    name = "console"

    def send(self, phones: list[str], message: str) -> list[SendResult]:
        for p in phones:
            log.info("[SMS console] to=%s***%s: %s", p[:6], p[-2:], message)
        return [SendResult(p, True, "console") for p in phones]


class AfricasTalkingSms:
    """https://developers.africastalking.com/docs/sms/sending/bulk — sandbox when username == 'sandbox'."""

    name = "africastalking"

    def __init__(self):
        s = get_settings()
        self.username, self.api_key, self.sender = s.at_username, s.at_api_key, s.at_sender_id
        host = "api.sandbox.africastalking.com" if self.username == "sandbox" else "api.africastalking.com"
        self.url = f"https://{host}/version1/messaging"

    def send(self, phones: list[str], message: str) -> list[SendResult]:
        data = {"username": self.username, "to": ",".join(phones), "message": message}
        if self.sender:
            data["from"] = self.sender
        try:
            r = httpx.post(self.url, data=data, timeout=30,
                           headers={"apiKey": self.api_key, "Accept": "application/json"})
            r.raise_for_status()
            recipients = {x["number"]: x for x in r.json()["SMSMessageData"]["Recipients"]}
        except (httpx.HTTPError, KeyError, ValueError) as e:
            return [SendResult(p, False, error=str(e)) for p in phones]
        out = []
        for p in phones:
            x = recipients.get(p)
            ok = bool(x) and x.get("status") in ("Success", "Sent", "Queued")
            out.append(SendResult(p, ok, x.get("messageId") if x else None,
                                  None if ok else (x or {}).get("status", "no response")))
        return out


def get_provider():
    return AfricasTalkingSms() if get_settings().sms_provider == "africastalking" else ConsoleSms()
