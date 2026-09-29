"""Parse and validate coordinate uploads (CSV, GeoJSON, KML) before committing."""
import csv
import io
import json
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.geo import in_bbox
from app.models import IncidentType
from app.services.incidents import find_duplicate, locate

MAX_ROWS = 10_000
ALIASES = {
    "lat": ("lat", "latitude", "y"),
    "lon": ("lon", "lng", "long", "longitude", "x"),
    "occurred_at": ("occurred_at", "date", "event_date", "datetime", "time", "when"),
    "type": ("type", "incident_type", "event_type"),
    "cause": ("cause",),
    "fatalities": ("fatalities", "deaths", "killed"),
    "injured": ("injured",),
    "displaced": ("displaced",),
    "location_name": ("location_name", "location", "name", "village", "community"),
    "notes": ("notes", "description", "desc", "comment"),
}
DATE_FORMATS = ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M",
                "%d/%m/%Y", "%d/%m/%Y %H:%M", "%d-%m-%Y")


def _canon(record: dict) -> dict:
    lower = {str(k).strip().lower(): v for k, v in record.items()}
    out = {}
    for field, names in ALIASES.items():
        for n in names:
            if n in lower and lower[n] not in (None, ""):
                out[field] = lower[n]
                break
    return out


def parse_date(v) -> datetime:
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    s = str(v).strip().replace("Z", "+00:00")
    try:
        d = datetime.fromisoformat(s)
    except ValueError:
        for fmt in DATE_FORMATS:
            try:
                d = datetime.strptime(s, fmt)
                break
            except ValueError:
                continue
        else:
            raise ValueError(f"unrecognised date '{v}'")
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def read_records(filename: str, content: bytes) -> tuple[str, list[dict]]:
    name = filename.lower()
    text = content.decode("utf-8-sig", errors="replace")
    if name.endswith(".csv"):
        return "csv", list(csv.DictReader(io.StringIO(text)))
    if name.endswith((".geojson", ".json")):
        data = json.loads(text)
        feats = data.get("features", [data] if data.get("type") == "Feature" else [])
        recs = []
        for f in feats:
            g = f.get("geometry") or {}
            props = dict(f.get("properties") or {})
            if g.get("type") == "Point":
                props["lon"], props["lat"] = g["coordinates"][:2]
            else:
                props["_error"] = f"geometry type {g.get('type')} not supported (Point only)"
            recs.append(props)
        return "geojson", recs
    if name.endswith(".kml"):
        return "kml", _read_kml(text)
    raise ValueError("Unsupported file type; use .csv, .geojson/.json or .kml")


def _read_kml(text: str) -> list[dict]:
    root = ET.fromstring(text)
    ns = {"k": root.tag.split("}")[0].strip("{")} if root.tag.startswith("{") else {"k": ""}
    q = (lambda t: f"k:{t}") if ns["k"] else (lambda t: t)
    recs = []
    for pm in root.iter(f"{{{ns['k']}}}Placemark" if ns["k"] else "Placemark"):
        rec: dict = {}
        for tag in ("name", "description"):
            el = pm.find(q(tag), ns)
            if el is not None and el.text:
                rec[tag] = el.text.strip()
        when = pm.find(f".//{q('TimeStamp')}/{q('when')}", ns)
        if when is not None and when.text:
            rec["date"] = when.text.strip()
        for d in pm.findall(f".//{q('Data')}", ns):
            v = d.find(q("value"), ns)
            if v is not None and v.text:
                rec[d.get("name")] = v.text.strip()
        coords = pm.find(f".//{q('Point')}/{q('coordinates')}", ns)
        if coords is not None and coords.text:
            lon, lat, *_ = coords.text.strip().split(",")
            rec["lon"], rec["lat"] = lon, lat
        else:
            rec["_error"] = "Placemark has no Point"
        recs.append(rec)
    return recs


def validate(db: Session, records: list[dict]) -> tuple[list[dict], list[dict]]:
    """Return (rows, errors). Each row has `valid` and `duplicate_of` flags for the preview."""
    rows, errors = [], []
    if len(records) > MAX_ROWS:
        raise ValueError(f"Too many rows ({len(records)}); max {MAX_ROWS}")
    for i, raw in enumerate(records, start=1):
        rec = _canon(raw)
        problems = [raw["_error"]] if raw.get("_error") else []
        row = {"row": i, **{k: rec.get(k) for k in ("location_name", "notes", "cause")}}
        try:
            lat, lon = float(rec["lat"]), float(rec["lon"])
            row.update(lat=lat, lon=lon)
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                problems.append("coordinates out of range")
            elif not in_bbox(lon, lat):
                problems.append("outside Benue/Plateau area (check lat/lon order)")
        except (KeyError, TypeError, ValueError):
            problems.append("missing or invalid lat/lon")
        try:
            d = parse_date(rec["occurred_at"])
            if d > datetime.now(timezone.utc):
                problems.append("date is in the future")
            row["occurred_at"] = d.isoformat()
        except KeyError:
            problems.append("missing date")
        except ValueError as e:
            problems.append(str(e))
        t = str(rec.get("type", "attack")).strip().lower().replace(" ", "_")
        row["type"] = t if t in IncidentType.__members__ else IncidentType.other
        for k in ("fatalities", "injured", "displaced"):
            try:
                row[k] = max(0, int(float(rec.get(k) or 0)))
            except ValueError:
                problems.append(f"{k} is not a number")
        if not problems:
            loc = locate(db, row["lat"], row["lon"])
            if loc.state is None:
                problems.append("outside Benue/Plateau state boundaries")
            else:
                row.update(state=loc.state, lga=loc.lga_name, lga_id=loc.lga_id)
                row["duplicate_of"] = find_duplicate(db, row["lat"], row["lon"], parse_date(row["occurred_at"]))
        row["valid"] = not problems
        row["errors"] = problems
        if problems:
            errors.append({"row": i, "errors": problems})
        rows.append(row)
    return rows, errors
