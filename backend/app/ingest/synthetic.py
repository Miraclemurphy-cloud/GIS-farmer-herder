"""Synthetic demo data, used only when ACLED credentials are not configured.

Generates a self-exciting (Hawkes-like) weekly process per LGA with dry-season
seasonality, concentrated in LGAs that public reporting identifies as frequently
affected. Every record is flagged `synthetic=True` and the UI shows a banner.
It exists so the pipeline, hotspots and model can be exercised end to end; it
is NOT evidence about real events.
"""
import math
import random
from datetime import datetime, timedelta, timezone

from geoalchemy2.shape import to_shape
from shapely.geometry import Point
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.geo import cell_of
from app.models import (
    AdminArea,
    FeedEvent,
    Incident,
    IncidentSource,
    IncidentStatus,
    IncidentStatusEvent,
    Subscriber,
)
from app.services.incidents import Located, create_incident

# Relative baseline intensity for frequently affected LGAs; others get 0.05.
HOT_LGAS = {
    "Guma": 1.0, "Logo": 0.8, "Agatu": 0.9, "Gwer West": 0.7, "Makurdi": 0.4, "Kwande": 0.4,
    "Ukum": 0.3, "Apa": 0.35, "Katsina-Ala": 0.35, "Tarka": 0.2, "Otukpo": 0.2,
    "Bokkos": 0.9, "Barkin Ladi": 0.8, "Riyom": 0.8, "Bassa": 0.9, "Mangu": 0.7, "Jos South": 0.3,
    "Wase": 0.5, "Kanam": 0.2, "Langtang North": 0.3,
}
# Dry-season migration (Nov–Apr) raises encounter rates; peaks Feb–Apr.
SEASON = [1.3, 1.5, 1.6, 1.5, 1.1, 0.8, 0.6, 0.6, 0.7, 0.8, 1.0, 1.2]
SOURCES = [(IncidentSource.community_sms, 0.45), (IncidentSource.field_agent, 0.30),
           (IncidentSource.upload, 0.15), (IncidentSource.firms, 0.10)]
CAUSES = [("crop_destruction", 0.35), ("cattle_rustling", 0.22), ("reprisal", 0.25),
          ("land_dispute", 0.12), ("unknown", 0.06)]
TYPE_FOR_CAUSE = {"crop_destruction": "crop_destruction", "cattle_rustling": "cattle_rustling",
                  "reprisal": "reprisal", "land_dispute": "clash", "unknown": "attack"}


def _pick(rng: random.Random, weighted):
    r, acc = rng.random(), 0.0
    for v, w in weighted:
        acc += w
        if r <= acc:
            return v
    return weighted[-1][0]


def _point_in(rng: random.Random, poly, near: Point | None = None, spread: float = 0.05) -> Point:
    minx, miny, maxx, maxy = poly.bounds
    for _ in range(200):
        if near is not None:
            p = Point(near.x + rng.gauss(0, spread), near.y + rng.gauss(0, spread))
        else:
            p = Point(rng.uniform(minx, maxx), rng.uniform(miny, maxy))
        if poly.contains(p):
            return p
    return poly.representative_point()


def _poisson(rng: random.Random, lam: float) -> int:
    L, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= L:
            return k
        k += 1


def generate(db: Session, start: datetime = datetime(2018, 1, 1, tzinfo=timezone.utc),
             end: datetime | None = None, seed: int = 7) -> int:
    rng = random.Random(seed)
    end = end or datetime.now(timezone.utc)
    db.execute(delete(IncidentStatusEvent).where(IncidentStatusEvent.incident_id.in_(
        select(Incident.id).where(Incident.synthetic.is_(True)))))
    db.execute(delete(Incident).where(Incident.synthetic.is_(True)))
    db.execute(delete(FeedEvent).where(FeedEvent.dedupe_key.like("synthetic:%")))

    lgas = []
    for a in db.scalars(select(AdminArea).where(AdminArea.level == 2)):
        poly = to_shape(a.geom)
        villages = [_point_in(rng, poly) for _ in range(rng.randint(2, 4))]
        lgas.append((a, poly, villages, HOT_LGAS.get(a.name, 0.05)))

    excitement = {a.id: 0.0 for a, *_ in lgas}
    week, n = start, 0
    while week < end:
        season = SEASON[week.month - 1]
        # Slow multi-year trend: escalation 2018, lull, then renewed escalation from 2023.
        years = (week - start).days / 365.25
        trend = 1.0 + 0.35 * math.sin(years * 1.1) + (0.4 if week.year >= 2023 else 0.0)
        for a, poly, villages, base in lgas:
            lam = 0.07 * base * season * trend + 0.25 * excitement[a.id]
            k = _poisson(rng, lam)
            excitement[a.id] = excitement[a.id] * 0.6 + k
            for _ in range(k):
                when = week + timedelta(days=rng.uniform(0, 7))
                if when >= end:
                    continue
                n += 1
                _make_incident(db, rng, a, poly, villages, when, end)
        # Background agricultural burning (dry season) — the model must learn fires ≠ attacks.
        if week.month in (11, 12, 1, 2, 3):
            for a, poly, _, _ in rng.sample(lgas, k=min(len(lgas), 6)):
                when = week + timedelta(days=rng.uniform(0, 7))
                if when < end:
                    _fire(db, rng, _point_in(rng, poly), when, key=f"bg{n}-{a.id}-{week:%Y%m%d}")
        week += timedelta(days=7)
        if week.day <= 7 and week.month == 1:
            db.commit()
    db.commit()
    return n


def _make_incident(db, rng, area, poly, villages, when: datetime, now: datetime) -> None:
    p = _point_in(rng, poly, near=rng.choice(villages), spread=0.04)
    cause = _pick(rng, CAUSES)
    typ = TYPE_FOR_CAUSE[cause]
    deadly = typ in ("attack", "reprisal", "clash")
    fat = int(rng.expovariate(1 / 6)) if deadly and rng.random() < 0.7 else (1 if rng.random() < 0.15 else 0)
    src = _pick(rng, SOURCES)
    age = now - when
    reported_at = when + timedelta(hours=rng.uniform(1, 30))
    # Old records are closed; recent ones are spread across the operational pipeline.
    if age > timedelta(days=120):
        stages = [IncidentStatus.verified, IncidentStatus.responded, IncidentStatus.resolved, IncidentStatus.closed]
    else:
        stages = [IncidentStatus.verified, IncidentStatus.responded, IncidentStatus.resolved,
                  IncidentStatus.closed][: rng.choice([0, 0, 1, 1, 2, 2, 3, 4])]
    # Mean hours spent in the stage *before* each transition.
    mean_hours = {IncidentStatus.verified: 40, IncidentStatus.responded: 36,
                  IncidentStatus.resolved: 190, IncidentStatus.closed: 240}
    events, t = [], reported_at
    for s in stages:
        t = t + timedelta(hours=rng.expovariate(1 / mean_hours[s]))
        if t > now:
            break
        events.append((s, t))
    status = events[-1][0] if events else IncidentStatus.reported
    inc = create_incident(
        db, lat=p.y, lon=p.x, occurred_at=when, status=status, reported_at=reported_at, emit=False,
        located=Located(area.state, area.id, area.name),
        type=typ, cause=cause, fatalities=fat, injured=int(fat * rng.uniform(0.3, 1.5)),
        displaced=int(rng.expovariate(1 / 150)) if deadly else 0,
        source=src, source_ref=f"syn-{rng.getrandbits(48):x}", synthetic=True,
        confidence=round(rng.uniform(0.4, 0.95), 2),
        location_name=f"{area.name} (village {villages.index(min(villages, key=p.distance)) + 1})",
    )
    for s, at in events:
        inc.status_events.append(IncidentStatusEvent(status=s, at=at))
    if typ in ("attack", "reprisal") and rng.random() < 0.4:  # houses burned → satellite hotspot
        _fire(db, rng, p, when + timedelta(hours=rng.uniform(0, 20)), key=f"inc-{inc.source_ref}")


def _fire(db, rng, p: Point, when: datetime, key: str) -> None:
    db.add(FeedEvent(kind="fire", observed_at=when, lat=p.y, lon=p.x, h3_cell=cell_of(p.y, p.x),
                     value=round(rng.uniform(2, 40), 1), data={"confidence": rng.choice(["n", "h"]),
                                                               "satellite": "VIIRS (synthetic)"},
                     dedupe_key=f"synthetic:{key}"))


def demo_subscribers(db: Session, n: int = 120, seed: int = 11) -> int:
    """Fake subscribers with reserved test numbers (+234 800 000 xxxx) for alert demos."""
    from app.core.security import encrypt_phone, phone_hash

    rng = random.Random(seed)
    if db.scalar(select(Subscriber.id).limit(1)):
        return 0
    lgas = [(a, to_shape(a.geom)) for a in db.scalars(select(AdminArea).where(AdminArea.level == 2))
            if a.name in HOT_LGAS]
    for i in range(n):
        a, poly = rng.choice(lgas)
        p = _point_in(rng, poly)
        phone = f"+234800000{i:04d}"
        db.add(Subscriber(phone_enc=encrypt_phone(phone), phone_hash=phone_hash(phone), phone_last4=phone[-4:],
                          name=f"Demo subscriber {i + 1}", language=rng.choice(["en", "en", "ha", "tiv"]),
                          community=f"{a.name} community", state=a.state, lga_id=a.id, lat=p.y, lon=p.x))
    db.commit()
    return n
