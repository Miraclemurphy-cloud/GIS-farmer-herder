"""Historical seed from ACLED (Armed Conflict Location & Event Data).

Only events plausibly linked to farmer-herder conflict are imported. Actor and
notes text is used *only to select* relevant events; no identity attribute is
stored as a model feature.
"""
import logging
import re
from datetime import date, datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.geo import STATES
from app.models import Incident, IncidentSource, IncidentStatus, IncidentStatusEvent
from app.services.incidents import create_incident

log = logging.getLogger(__name__)
TOKEN_URL = "https://acleddata.com/oauth/token"
READ_URL = "https://acleddata.com/api/acled/read"
FIELDS = "event_id_cnty|event_date|event_type|sub_event_type|admin1|admin2|location|latitude|longitude|geo_precision|actor1|actor2|fatalities|notes"

RELEVANT = re.compile(r"herd|pastoral|farmer|cattle|cow|graz|livestock|rustl|communal militia|ethnic militia", re.I)
CAUSES = [
    ("cattle_rustling", re.compile(r"rustl|stole .*cattle|cattle theft|stolen cows", re.I)),
    ("crop_destruction", re.compile(r"crop|farmland|destroy.* farm|graz(ed|ing) on", re.I)),
    ("reprisal", re.compile(r"reprisal|retaliat|revenge", re.I)),
    ("land_dispute", re.compile(r"land dispute|boundary|grazing route|encroach", re.I)),
]


def classify(ev: dict) -> tuple[str, str]:
    text = f"{ev.get('notes', '')} {ev.get('sub_event_type', '')}"
    cause = next((c for c, rx in CAUSES if rx.search(text)), "unknown")
    if cause == "cattle_rustling":
        typ = "cattle_rustling"
    elif cause == "crop_destruction" and not ev.get("fatalities"):
        typ = "crop_destruction"
    elif cause == "reprisal":
        typ = "reprisal"
    elif ev.get("sub_event_type") == "Armed clash":
        typ = "clash"
    else:
        typ = "attack"
    return typ, cause


def is_relevant(ev: dict) -> bool:
    if ev.get("event_type") not in ("Violence against civilians", "Battles", "Riots"):
        return False
    return bool(RELEVANT.search(f"{ev.get('actor1', '')} {ev.get('actor2', '')} {ev.get('notes', '')}"))


def _token(client: httpx.Client) -> str:
    s = get_settings()
    r = client.post(TOKEN_URL, data={"username": s.acled_email, "password": s.acled_password,
                                     "grant_type": "password", "client_id": "acled", "scope": "authenticated"})
    r.raise_for_status()
    return r.json()["access_token"]


def fetch(start: date, end: date) -> list[dict]:
    events: list[dict] = []
    with httpx.Client(timeout=120) as client:
        headers = {"Authorization": f"Bearer {_token(client)}"}
        for state in STATES:
            page = 1
            while True:
                r = client.get(READ_URL, headers=headers, params={
                    "_format": "json", "country": "Nigeria", "admin1": state,
                    "event_date": f"{start.isoformat()}|{end.isoformat()}", "event_date_where": "BETWEEN",
                    "fields": FIELDS, "limit": 5000, "page": page,
                })
                r.raise_for_status()
                batch = r.json().get("data", [])
                events += batch
                if len(batch) < 5000:
                    break
                page += 1
    return events


def ingest(db: Session, start: date = date(2015, 1, 1), end: date | None = None) -> int:
    s = get_settings()
    if not (s.acled_email and s.acled_password):
        raise RuntimeError("ACLED_EMAIL / ACLED_PASSWORD not configured")
    end = end or date.today()
    existing = set(db.scalars(select(Incident.source_ref).where(Incident.source == IncidentSource.acled)))
    n = 0
    for ev in fetch(start, end):
        ref = ev["event_id_cnty"]
        if ref in existing or not is_relevant(ev):
            continue
        typ, cause = classify(ev)
        occurred = datetime.fromisoformat(ev["event_date"]).replace(tzinfo=timezone.utc)
        inc = create_incident(
            db, lat=float(ev["latitude"]), lon=float(ev["longitude"]), occurred_at=occurred,
            status=IncidentStatus.closed, reported_at=occurred, emit=False,
            type=typ, cause=cause, fatalities=int(ev.get("fatalities") or 0),
            location_name=ev.get("location", ""), source=IncidentSource.acled, source_ref=ref,
            # geo_precision 1 = exact town, 2 = near town, 3 = admin-2 centroid
            confidence={"1": 0.9, "2": 0.7, "3": 0.5}.get(str(ev.get("geo_precision")), 0.5),
            notes=ev.get("notes", ""),
        )
        inc.state = inc.state or ev.get("admin1")  # simplified boundaries can miss edge points
        inc.status_events.append(IncidentStatusEvent(status=IncidentStatus.closed, at=occurred))
        existing.add(ref)
        n += 1
        if n % 500 == 0:
            db.commit()
    db.commit()
    log.info("ACLED: imported %d events", n)
    return n
