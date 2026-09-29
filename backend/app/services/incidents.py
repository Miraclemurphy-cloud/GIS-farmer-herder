"""Single write path for incidents: geocoding to LGA/H3, status history, live events."""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.events import publish
from app.core.geo import cell_of
from app.models import STATUS_FLOW, AdminArea, Incident, IncidentStatus, IncidentStatusEvent, User

DUPLICATE_RADIUS_M = 500
DUPLICATE_WINDOW = timedelta(hours=24)


@dataclass
class Located:
    state: str | None
    lga_id: int | None
    lga_name: str | None


def locate(db: Session, lat: float, lon: float) -> Located:
    """Return the study-area LGA containing the point, or Nones if outside Benue/Plateau."""
    pt = func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326)
    row = db.execute(
        select(AdminArea.id, AdminArea.name, AdminArea.state)
        .where(AdminArea.level == 2, func.ST_Contains(AdminArea.geom, pt))
        .limit(1)
    ).first()
    if row:
        return Located(row.state, row.id, row.name)
    return Located(None, None, None)


def find_duplicate(db: Session, lat: float, lon: float, occurred_at: datetime) -> int | None:
    geog = func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326)
    return db.scalar(
        select(Incident.id).where(
            func.ST_DWithin(func.Geography(Incident.geom), func.Geography(geog), DUPLICATE_RADIUS_M),
            Incident.occurred_at.between(occurred_at - DUPLICATE_WINDOW, occurred_at + DUPLICATE_WINDOW),
        ).limit(1)
    )


def create_incident(db: Session, *, lat: float, lon: float, occurred_at: datetime, user: User | None = None,
                    status: str = IncidentStatus.reported, located: Located | None = None,
                    reported_at: datetime | None = None, emit: bool = True, **fields) -> Incident:
    if occurred_at.tzinfo is None:
        occurred_at = occurred_at.replace(tzinfo=timezone.utc)
    loc = located or locate(db, lat, lon)
    inc = Incident(
        lat=lat, lon=lon, geom=from_shape(Point(lon, lat), srid=4326), h3_cell=cell_of(lat, lon),
        occurred_at=occurred_at, state=loc.state, lga_id=loc.lga_id, status=status,
        created_by=user.id if user else None, **fields,
    )
    if not inc.location_name and loc.lga_name:
        inc.location_name = loc.lga_name
    inc.status_events.append(IncidentStatusEvent(status=IncidentStatus.reported, at=reported_at or datetime.now(timezone.utc),
                                                 by_user=user.id if user else None))
    db.add(inc)
    db.flush()
    if emit:
        publish("incident", incident_summary(inc))
    return inc


def set_status(db: Session, inc: Incident, status: IncidentStatus, user: User | None, note: str = "") -> None:
    if status == inc.status:
        return
    if status not in (IncidentStatus.dismissed, *STATUS_FLOW):
        raise ValueError(status)
    inc.status = status
    inc.status_events.append(IncidentStatusEvent(status=status, by_user=user.id if user else None, note=note))
    db.flush()
    publish("incident_status", {"id": inc.id, "status": status})


def incident_summary(inc: Incident) -> dict:
    return {
        "id": inc.id, "lat": inc.lat, "lon": inc.lon, "occurred_at": inc.occurred_at.isoformat(),
        "state": inc.state, "location_name": inc.location_name, "type": inc.type,
        "fatalities": inc.fatalities, "source": inc.source, "status": inc.status,
    }
