"""Surveillance: operator-registered camera feeds + satellite fire and rainfall panels."""
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import audit, current_user, require
from app.models import Feed, FeedEvent, Role, User

router = APIRouter(prefix="/api/feeds", tags=["feeds"])


class FeedIn(BaseModel):
    name: str
    kind: str  # hls | mjpeg | image | embed
    url: str
    lat: float | None = None
    lon: float | None = None
    license_note: str

    @field_validator("kind")
    @classmethod
    def _kind(cls, v):
        if v not in ("hls", "mjpeg", "image", "embed"):
            raise ValueError("kind must be hls, mjpeg, image or embed")
        return v

    @field_validator("url")
    @classmethod
    def _url(cls, v):
        if urlparse(v).scheme != "https":
            raise ValueError("feed URL must be https")
        return v

    @field_validator("license_note")
    @classmethod
    def _license(cls, v):
        # Only feeds the operator is entitled to use: public-by-design streams or own cameras.
        if len(v.strip()) < 10:
            raise ValueError("state the source and the permission/licence for this feed")
        return v


def feed_out(f: Feed) -> dict:
    return {"id": f.id, "name": f.name, "kind": f.kind, "url": f.url, "lat": f.lat, "lon": f.lon,
            "license_note": f.license_note, "active": f.active}


@router.get("/cameras")
def cameras(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return [feed_out(f) for f in db.scalars(select(Feed).where(Feed.active.is_(True)).order_by(Feed.name))]


@router.post("/cameras", status_code=201)
def add_camera(body: FeedIn, db: Session = Depends(get_db), user: User = Depends(require(Role.admin))):
    f = Feed(**body.model_dump())
    db.add(f)
    db.flush()
    audit(db, user, "create", "feed", f.id, url=body.url)
    db.commit()
    return feed_out(f)


@router.delete("/cameras/{feed_id}", status_code=204)
def remove_camera(feed_id: int, db: Session = Depends(get_db), user: User = Depends(require(Role.admin))):
    f = db.get(Feed, feed_id)
    if not f:
        raise HTTPException(404)
    f.active = False
    audit(db, user, "deactivate", "feed", feed_id)
    db.commit()


@router.get("/fires")
def fires(days: int = Query(7, ge=1, le=90), db: Session = Depends(get_db), _: User = Depends(current_user)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = db.scalars(select(FeedEvent).where(FeedEvent.kind == "fire", FeedEvent.observed_at >= since)
                      .order_by(FeedEvent.observed_at.desc()).limit(5000)).all()
    latest = db.scalar(select(func.max(FeedEvent.observed_at)).where(FeedEvent.kind == "fire"))
    return {"latest_observation": latest, "type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [f.lon, f.lat]},
         "properties": {"id": f.id, "observed_at": f.observed_at.isoformat(), "frp": f.value, **(f.data or {})}}
        for f in rows]}


@router.get("/fires/daily")
def fires_daily(days: int = Query(60, ge=7, le=365), db: Session = Depends(get_db), _: User = Depends(current_user)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    day = func.date_trunc("day", FeedEvent.observed_at).label("day")
    rows = db.execute(select(day, func.count()).where(FeedEvent.kind == "fire", FeedEvent.observed_at >= since)
                      .group_by(day).order_by(day)).all()
    return [{"day": d.date().isoformat(), "count": n} for d, n in rows]


@router.get("/rainfall")
def rainfall(weeks: int = Query(26, ge=4, le=260), db: Session = Depends(get_db), _: User = Depends(current_user)):
    """Weekly mean LGA rainfall per state."""
    since = datetime.now(timezone.utc) - timedelta(weeks=weeks)
    rows = db.execute(select(FeedEvent.observed_at, FeedEvent.value, FeedEvent.data)
                      .where(FeedEvent.kind == "weather", FeedEvent.observed_at >= since)).all()
    from app.models import AdminArea

    state_of = dict(db.execute(select(AdminArea.id, AdminArea.state).where(AdminArea.level == 2)).all())
    agg: dict[str, dict[str, list[float]]] = {}
    for at, v, data in rows:
        k = at.date().isoformat()
        st = state_of.get((data or {}).get("lga_id"))
        if st:
            agg.setdefault(k, {}).setdefault(st, []).append(v or 0.0)
    return [{"week": k, **{st: round(sum(vs) / len(vs), 1) for st, vs in d.items()}} for k, d in sorted(agg.items())]
