import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.geo import cell_polygon
from app.core.security import current_user, require
from app.models import AdminArea, H3Cell, Incident, ModelRun, RiskScore, Role, User
from app.services import hotspots

router = APIRouter(prefix="/api/geo", tags=["geo"])


@router.get("/admin-areas")
def admin_areas(level: int = 2, db: Session = Depends(get_db), _: User = Depends(current_user)):
    rows = db.execute(select(AdminArea.id, AdminArea.name, AdminArea.state,
                             func.ST_AsGeoJSON(func.ST_SimplifyPreserveTopology(AdminArea.geom, 0.003)).label("gj"))
                      .where(AdminArea.level == level).order_by(AdminArea.state, AdminArea.name)).all()
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": json.loads(r.gj), "properties": {"id": r.id, "name": r.name, "state": r.state}}
        for r in rows]}


@router.get("/lgas")
def lgas(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return [{"id": a.id, "name": a.name, "state": a.state}
            for a in db.scalars(select(AdminArea).where(AdminArea.level == 2).order_by(AdminArea.state, AdminArea.name))]


@router.get("/hotspots")
def get_hotspots(kind: str | None = None, db: Session = Depends(get_db), _: User = Depends(current_user)):
    return hotspots.hotspots_geojson(db, kind)


@router.post("/hotspots/recompute")
def recompute_hotspots(months: int = Query(12, ge=1, le=120), db: Session = Depends(get_db),
                       _: User = Depends(require(Role.analyst))):
    return hotspots.recompute(db, months)


@router.get("/risk/weeks")
def risk_weeks(db: Session = Depends(get_db), _: User = Depends(current_user)):
    run = db.scalar(select(ModelRun).where(ModelRun.active.is_(True)))
    if not run:
        return {"model": None, "weeks": []}
    weeks = db.scalars(select(RiskScore.week_start).where(RiskScore.model_version == run.version)
                       .distinct().order_by(RiskScore.week_start)).all()
    return {"model": {"version": run.version, "metrics": run.metrics, "trained_through": run.trained_through,
                      "created_at": run.created_at}, "weeks": weeks}


@router.get("/risk")
def risk(week: datetime | None = None, min_probability: float = 0.02,
         db: Session = Depends(get_db), _: User = Depends(current_user)):
    """Risk hexes for a week, with the incidents that actually happened (for backtest weeks)."""
    run = db.scalar(select(ModelRun).where(ModelRun.active.is_(True)))
    if not run:
        raise HTTPException(404, "No active model")
    week = week or db.scalar(select(func.max(RiskScore.week_start)).where(RiskScore.model_version == run.version))
    rows = db.execute(select(RiskScore.cell, RiskScore.probability, H3Cell.state)
                      .join(H3Cell, H3Cell.cell == RiskScore.cell)
                      .where(RiskScore.week_start == week, RiskScore.model_version == run.version,
                             RiskScore.probability >= min_probability)).all()
    from datetime import timedelta

    actual = dict(db.execute(select(Incident.h3_cell, func.count())
                             .where(Incident.occurred_at >= week, Incident.occurred_at < week + timedelta(days=14))
                             .group_by(Incident.h3_cell)).all())
    feats = []
    for r in rows:
        feats.append({"type": "Feature", "geometry": cell_polygon(r.cell).__geo_interface__,
                      "properties": {"cell": r.cell, "p": round(r.probability, 4), "state": r.state,
                                     "actual": actual.get(r.cell, 0)}})
    return {"type": "FeatureCollection", "week": week, "model_version": run.version, "features": feats,
            "actual_total": sum(actual.values()),
            "actual_in_shown": sum(actual.get(r.cell, 0) for r in rows)}


@router.get("/cells/{cell}")
def cell_detail(cell: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    c = db.get(H3Cell, cell)
    if not c:
        raise HTTPException(404)
    history = db.execute(select(RiskScore.week_start, RiskScore.probability).where(RiskScore.cell == cell)
                         .order_by(RiskScore.week_start)).all()
    return {"cell": cell, "state": c.state, "lat": c.lat, "lon": c.lon,
            "risk_history": [{"week_start": w, "p": p} for w, p in history],
            "incidents_total": db.scalar(select(func.count()).where(Incident.h3_cell == cell))}
