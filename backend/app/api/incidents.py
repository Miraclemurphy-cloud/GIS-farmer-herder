from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.db import get_db
from app.core.geo import in_bbox
from app.core.security import audit, current_user, require
from app.models import Incident, IncidentSource, IncidentStatus, IncidentType, Role, User
from app.services.incidents import create_incident, set_status

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


class IncidentIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    occurred_at: datetime
    type: IncidentType = IncidentType.attack
    cause: str | None = None
    fatalities: int = Field(0, ge=0)
    injured: int = Field(0, ge=0)
    displaced: int = Field(0, ge=0)
    location_name: str = ""
    notes: str = ""
    source: IncidentSource = IncidentSource.field_agent


class StatusIn(BaseModel):
    status: IncidentStatus
    note: str = ""


def serialize(i: Incident, detail: bool = False) -> dict:
    d = {
        "id": i.id, "lat": i.lat, "lon": i.lon, "h3_cell": i.h3_cell, "occurred_at": i.occurred_at,
        "state": i.state, "lga": i.lga.name if i.lga else None, "location_name": i.location_name,
        "type": i.type, "cause": i.cause, "fatalities": i.fatalities, "injured": i.injured,
        "displaced": i.displaced, "source": i.source, "status": i.status, "confidence": i.confidence,
        "synthetic": i.synthetic, "created_at": i.created_at,
    }
    if detail:
        d["notes"] = i.notes
        d["timeline"] = [{"status": e.status, "at": e.at, "note": e.note, "by_user": e.by_user}
                         for e in i.status_events]
    return d


def filtered(stmt, start, end, state, status, source, bbox):
    if start:
        stmt = stmt.where(Incident.occurred_at >= start)
    if end:
        stmt = stmt.where(Incident.occurred_at < end)
    if state:
        stmt = stmt.where(Incident.state == state)
    if status:
        stmt = stmt.where(Incident.status.in_(status.split(",")))
    if source:
        stmt = stmt.where(Incident.source.in_(source.split(",")))
    if bbox:
        x0, y0, x1, y1 = (float(v) for v in bbox.split(","))
        stmt = stmt.where(Incident.lon.between(x0, x1), Incident.lat.between(y0, y1))
    return stmt


@router.get("")
def list_incidents(
    start: datetime | None = None, end: datetime | None = None, state: str | None = None,
    status: str | None = None, source: str | None = None, bbox: str | None = None,
    q: str | None = None, limit: int = Query(50, le=500), offset: int = 0,
    db: Session = Depends(get_db), _: User = Depends(current_user),
):
    stmt = filtered(select(Incident), start, end, state, status, source, bbox)
    if q:
        stmt = stmt.where(Incident.location_name.ilike(f"%{q}%") | Incident.notes.ilike(f"%{q}%"))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.options(selectinload(Incident.lga)).order_by(Incident.occurred_at.desc())
                      .limit(limit).offset(offset)).all()
    return {"total": total, "items": [serialize(i) for i in rows]}


@router.get("/geojson")
def incidents_geojson(
    start: datetime | None = None, end: datetime | None = None, state: str | None = None,
    status: str | None = None, source: str | None = None, bbox: str | None = None,
    db: Session = Depends(get_db), _: User = Depends(current_user),
):
    stmt = filtered(select(Incident.id, Incident.lat, Incident.lon, Incident.occurred_at, Incident.type,
                           Incident.fatalities, Incident.status, Incident.source, Incident.location_name),
                    start, end, state, status, source, bbox).limit(20000)
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [r.lon, r.lat]},
         "properties": {"id": r.id, "occurred_at": r.occurred_at.isoformat(), "type": r.type,
                        "fatalities": r.fatalities, "status": r.status, "source": r.source,
                        "location_name": r.location_name}}
        for r in db.execute(stmt)]}


@router.get("/{incident_id}")
def get_incident(incident_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    inc = db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404)
    return serialize(inc, detail=True)


@router.post("", status_code=201)
def create(body: IncidentIn, db: Session = Depends(get_db), user: User = Depends(require(Role.field_agent))):
    if not in_bbox(body.lon, body.lat):
        raise HTTPException(422, "Coordinates are outside the Benue/Plateau study area")
    inc = create_incident(db, user=user, **body.model_dump())
    audit(db, user, "create", "incident", inc.id)
    db.commit()
    return serialize(inc, detail=True)


@router.post("/{incident_id}/status")
def change_status(incident_id: int, body: StatusIn, db: Session = Depends(get_db),
                  user: User = Depends(require(Role.analyst))):
    inc = db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404)
    old = inc.status
    set_status(db, inc, body.status, user, body.note)
    audit(db, user, "status", "incident", inc.id, old=old, new=body.status)
    db.commit()
    return serialize(inc, detail=True)
