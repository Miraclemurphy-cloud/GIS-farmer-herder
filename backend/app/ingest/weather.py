"""Weekly rainfall per LGA from Open-Meteo (ERA5 archive; no key required).

Rainfall onset/failure drives herd movement and farm-grazing overlap, so the
weekly total and its anomaly vs. the same week in other years are model features.
"""
import logging
from datetime import date, datetime, timedelta, timezone

import httpx
from geoalchemy2.shape import to_shape
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.geo import cell_of
from app.models import AdminArea, FeedEvent

log = logging.getLogger(__name__)
URL = "https://archive-api.open-meteo.com/v1/archive"
BATCH = 20  # Open-Meteo accepts comma-separated coordinate lists


def ingest(db: Session, start: date = date(2018, 1, 1), end: date | None = None) -> int:
    end = end or date.today() - timedelta(days=6)  # archive lags ~5 days
    lgas = list(db.scalars(select(AdminArea).where(AdminArea.level == 2)))
    points = []
    for a in lgas:
        c = to_shape(a.geom).representative_point()
        points.append((a, c.y, c.x))
    n = 0
    with httpx.Client(timeout=180) as client:
        for i in range(0, len(points), BATCH):
            chunk = points[i:i + BATCH]
            r = client.get(URL, params={
                "latitude": ",".join(f"{p[1]:.4f}" for p in chunk),
                "longitude": ",".join(f"{p[2]:.4f}" for p in chunk),
                "start_date": start.isoformat(), "end_date": end.isoformat(),
                "daily": "precipitation_sum", "timezone": "Africa/Lagos",
            })
            r.raise_for_status()
            payload = r.json()
            payload = payload if isinstance(payload, list) else [payload]
            for (area, lat, lon), loc in zip(chunk, payload):
                weekly: dict[date, float] = {}
                for d, mm in zip(loc["daily"]["time"], loc["daily"]["precipitation_sum"]):
                    day = date.fromisoformat(d)
                    wk = day - timedelta(days=day.weekday())
                    weekly[wk] = weekly.get(wk, 0.0) + (mm or 0.0)
                for wk, mm in weekly.items():
                    stmt = insert(FeedEvent).values(
                        kind="weather", observed_at=datetime.combine(wk, datetime.min.time(), timezone.utc),
                        lat=lat, lon=lon, h3_cell=cell_of(lat, lon), value=round(mm, 1),
                        data={"lga_id": area.id, "lga": area.name, "metric": "precip_week_mm"},
                        dedupe_key=f"weather:{area.id}:{wk.isoformat()}",
                    ).on_conflict_do_update(index_elements=["dedupe_key"], set_={"value": round(mm, 1)})
                    db.execute(stmt)
                    n += 1
            db.commit()
    log.info("weather: %d LGA-weeks upserted", n)
    return n
