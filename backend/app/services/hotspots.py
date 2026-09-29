"""Hotspot detection.

Two complementary views:
* HDBSCAN on incident coordinates (haversine) → cluster outlines of where incidents concentrate.
* Getis-Ord Gi* on H3 cell counts → cells whose neighbourhood has significantly more
  incidents than the study-area average (z ≥ 1.65 / 1.96 / 2.58 ≈ 90 / 95 / 99 % confidence).
"""
import math
from datetime import datetime, timedelta, timezone

import h3
import numpy as np
from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPoint
from sklearn.cluster import HDBSCAN
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.events import publish
from app.core.geo import cell_polygon
from app.models import H3Cell, Hotspot, Incident, IncidentStatus

Z_LEVELS = [(2.58, "99%"), (1.96, "95%"), (1.65, "90%")]


def getis_ord_gi_star(counts: dict[str, float], cells: list[str], k: int = 1) -> dict[str, float]:
    """Gi* z-score per cell with binary weights over the k-ring (self included)."""
    idx = {c: i for i, c in enumerate(cells)}
    x = np.array([counts.get(c, 0.0) for c in cells], dtype=float)
    n = len(x)
    if n < 3 or x.sum() == 0:
        return {c: 0.0 for c in cells}
    mean = x.mean()
    s = math.sqrt((x ** 2).mean() - mean ** 2)
    if s == 0:
        return {c: 0.0 for c in cells}
    z = {}
    for c in cells:
        nbrs = [idx[j] for j in h3.grid_disk(c, k) if j in idx]
        w = len(nbrs)
        num = x[nbrs].sum() - mean * w
        den = s * math.sqrt((n * w - w ** 2) / (n - 1))
        z[c] = float(num / den) if den > 0 else 0.0
    return z


def cluster_incidents(coords: np.ndarray, min_cluster_size: int = 6) -> np.ndarray:
    """HDBSCAN labels for (lat, lon) degrees; -1 = noise."""
    if len(coords) < min_cluster_size:
        return np.full(len(coords), -1)
    model = HDBSCAN(min_cluster_size=min_cluster_size, metric="haversine", algorithm="ball_tree", copy=True)
    return model.fit_predict(np.radians(coords))


def recompute(db: Session, months: int = 12, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    start = now - timedelta(days=int(months * 30.44))
    rows = db.execute(select(Incident.lat, Incident.lon, Incident.fatalities, Incident.h3_cell)
                      .where(Incident.occurred_at >= start, Incident.occurred_at <= now,
                             Incident.status != IncidentStatus.dismissed)).all()
    db.execute(delete(Hotspot))

    # Clusters
    n_clusters = 0
    if rows:
        coords = np.array([(r.lat, r.lon) for r in rows])
        labels = cluster_incidents(coords)
        for lab in sorted(set(labels) - {-1}):
            members = [rows[i] for i in np.where(labels == lab)[0]]
            hull = MultiPoint([(r.lon, r.lat) for r in members]).convex_hull.buffer(0.03)
            n_clusters += 1
            db.add(Hotspot(kind="cluster", label=f"Cluster {n_clusters}", geom=from_shape(hull, srid=4326),
                           incident_count=len(members), fatalities=sum(r.fatalities for r in members),
                           period_start=start, period_end=now))

    # Gi*
    cells = list(db.scalars(select(H3Cell.cell)))
    counts: dict[str, float] = {}
    fat: dict[str, int] = {}
    for r in rows:
        counts[r.h3_cell] = counts.get(r.h3_cell, 0) + 1
        fat[r.h3_cell] = fat.get(r.h3_cell, 0) + r.fatalities
    z = getis_ord_gi_star(counts, cells)
    n_gi = 0
    for c, score in z.items():
        level = next((lbl for thr, lbl in Z_LEVELS if score >= thr), None)
        if level:
            n_gi += 1
            db.add(Hotspot(kind="gi", label=level, geom=from_shape(cell_polygon(c), srid=4326),
                           incident_count=int(counts.get(c, 0)), fatalities=fat.get(c, 0), z_score=score,
                           period_start=start, period_end=now))
    db.commit()
    publish("hotspots", {"clusters": n_clusters, "gi_cells": n_gi})
    return {"clusters": n_clusters, "gi_cells": n_gi, "incidents": len(rows)}


def hotspots_geojson(db: Session, kind: str | None = None) -> dict:
    stmt = select(Hotspot, func.ST_AsGeoJSON(Hotspot.geom).label("gj"))
    if kind:
        stmt = stmt.where(Hotspot.kind == kind)
    import json

    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": json.loads(gj),
         "properties": {"id": h.id, "kind": h.kind, "label": h.label, "incident_count": h.incident_count,
                        "fatalities": h.fatalities, "z_score": h.z_score,
                        "period_start": h.period_start.isoformat(), "period_end": h.period_end.isoformat()}}
        for h, gj in db.execute(stmt)]}
