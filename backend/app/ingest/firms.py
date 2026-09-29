"""NASA FIRMS VIIRS active-fire detections over the study area.

Burning settlements show up as thermal anomalies within hours of an attack; the
system uses them as a corroborating signal and model feature (not as proof —
most dry-season fires are agricultural).
Key: https://firms.modaps.eosdis.nasa.gov/api/map_key/
"""
import csv
import io
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.geo import STUDY_BBOX, cell_of
from app.models import FeedEvent

log = logging.getLogger(__name__)
URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{source}/{bbox}/{days}"


def ingest(db: Session, days: int = 3, source: str = "VIIRS_SNPP_NRT") -> int:
    key = get_settings().firms_map_key
    if not key:
        raise RuntimeError("FIRMS_MAP_KEY not configured")
    bbox = ",".join(str(v) for v in STUDY_BBOX)
    r = httpx.get(URL.format(key=key, source=source, bbox=bbox, days=days), timeout=120)
    r.raise_for_status()
    rows = list(csv.DictReader(io.StringIO(r.text)))
    n = 0
    for row in rows:
        lat, lon = float(row["latitude"]), float(row["longitude"])
        t = row["acq_time"].zfill(4)
        observed = datetime.strptime(f"{row['acq_date']} {t}", "%Y-%m-%d %H%M").replace(tzinfo=timezone.utc)
        stmt = insert(FeedEvent).values(
            kind="fire", observed_at=observed, lat=lat, lon=lon, h3_cell=cell_of(lat, lon),
            value=float(row.get("frp") or 0), data={"confidence": row.get("confidence"), "satellite": source},
            dedupe_key=f"firms:{source}:{row['acq_date']}:{t}:{lat:.4f}:{lon:.4f}",
        ).on_conflict_do_nothing(index_elements=["dedupe_key"])
        n += db.execute(stmt).rowcount
    db.commit()
    log.info("FIRMS: %d new detections (%d rows)", n, len(rows))
    return n
