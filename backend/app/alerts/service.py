"""Alert lifecycle: rules create drafts → a human approves → SMS is sent.

There is deliberately no path from a rule to an SMS without an approval step:
false alarms cause panic and can themselves trigger reprisals.
"""
import logging
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.alerts.sms import get_provider
from app.core.config import get_settings
from app.core.events import publish
from app.core.geo import haversine_km
from app.core.security import decrypt_phone
from app.models import (
    AdminArea,
    Alert,
    AlertDelivery,
    AlertStatus,
    FeedEvent,
    H3Cell,
    Incident,
    IncidentStatus,
    ModelRun,
    RiskScore,
    Subscriber,
    User,
)

log = logging.getLogger(__name__)

# Hausa drafts need review by a native speaker before production use; Tiv templates
# must be supplied by community translators (falls back to English until then).
TEMPLATES = {
    "risk": {
        "en": "ALERT ({sev}): Elevated risk of violence around {area} in the next 2 weeks. Stay alert, avoid isolated farms/routes at night, report threats to {contact}. Reply STOP to opt out.",
        "ha": "GARGADI ({sev}): Akwai hadarin tashin hankali a kewayen {area} cikin makonni 2 masu zuwa. Ku kasance a fadake, ku guji gonaki ko hanyoyi na kadaici da dare, ku kai rahoto ga {contact}. Aika STOP don dainawa.",
    },
    "incident": {
        "en": "ALERT ({sev}): A violent incident was confirmed near {area}. Move to safe areas if advised, avoid the location, report to {contact}. Reply STOP to opt out.",
        "ha": "GARGADI ({sev}): An tabbatar da tashin hankali kusa da {area}. Ku koma wurare masu aminci idan an shawarta, ku guji wurin, ku kai rahoto ga {contact}. Aika STOP don dainawa.",
    },
    "fire": {
        "en": "ALERT ({sev}): Satellite detected fires near {area} close to recent incidents. Stay alert and report what you see to {contact}. Reply STOP to opt out.",
        "ha": "GARGADI ({sev}): Tauraron dan adam ya gano gobara kusa da {area} inda aka samu tashin hankali kwanan nan. Ku kasance a fadake, ku kai rahoto ga {contact}. Aika STOP don dainawa.",
    },
}
DEFAULT_CONTACT = "local security desk"


class AlertStateError(Exception):
    pass


def render(trigger: str, area: str, severity: str, contact: str = DEFAULT_CONTACT) -> dict:
    t = TEMPLATES.get(trigger, TEMPLATES["risk"])
    msgs = {lang: tpl.format(sev=severity.upper(), area=area, contact=contact) for lang, tpl in t.items()}
    msgs["tiv"] = msgs["en"]
    return msgs


def _draft(db: Session, *, trigger: str, severity: str, title: str, area: str, lat: float, lon: float,
           radius_km: float, dedupe_key: str, context: dict, user: User | None = None) -> Alert | None:
    if db.scalar(select(Alert.id).where(Alert.dedupe_key == dedupe_key)):
        return None
    a = Alert(trigger=trigger, severity=severity, title=title, area_name=area, center_lat=lat, center_lon=lon,
              radius_km=radius_km, messages=render(trigger, area, severity), context=context,
              dedupe_key=dedupe_key, created_by=user.id if user else None)
    db.add(a)
    db.flush()
    publish("alert_draft", {"id": a.id, "title": a.title, "severity": a.severity})
    return a


def run_rules(db: Session, now: datetime | None = None) -> list[int]:
    now = now or datetime.now(timezone.utc)
    s = get_settings()
    created: list[Alert | None] = []

    # 1) Model risk: group high-risk cells of the latest scored week by LGA.
    run = db.scalar(select(ModelRun).where(ModelRun.active.is_(True)))
    if run:
        week = db.scalar(select(func.max(RiskScore.week_start)).where(RiskScore.model_version == run.version))
        if week:
            rows = db.execute(
                select(RiskScore.probability, H3Cell.lat, H3Cell.lon, AdminArea.id, AdminArea.name, AdminArea.state)
                .join(H3Cell, H3Cell.cell == RiskScore.cell).join(AdminArea, AdminArea.id == H3Cell.lga_id)
                .where(RiskScore.week_start == week, RiskScore.model_version == run.version,
                       RiskScore.probability >= s.risk_alert_threshold)).all()
            by_lga: dict[int, list] = {}
            for r in rows:
                by_lga.setdefault(r.id, []).append(r)
            for lga_id, rs in by_lga.items():
                pmax = max(r.probability for r in rs)
                sev = "high" if pmax >= 2 * s.risk_alert_threshold else "medium"
                created.append(_draft(
                    db, trigger="risk", severity=sev, title=f"Elevated risk: {rs[0].name} LGA",
                    area=f"{rs[0].name}, {rs[0].state}", lat=sum(r.lat for r in rs) / len(rs),
                    lon=sum(r.lon for r in rs) / len(rs), radius_km=20,
                    dedupe_key=f"risk:{lga_id}:{week.date().isoformat()}",
                    context={"week_start": week.isoformat(), "cells": len(rs), "max_probability": round(pmax, 3),
                             "model_version": run.version}))

    # 2) Verified violent incident in the last 48 h.
    for inc in db.scalars(select(Incident).where(
            Incident.occurred_at >= now - timedelta(hours=48),
            Incident.status.in_([IncidentStatus.verified, IncidentStatus.responded]),
            (Incident.fatalities > 0) | Incident.type.in_(["attack", "reprisal", "clash"]))):
        sev = "high" if inc.fatalities >= 3 else "medium"
        created.append(_draft(
            db, trigger="incident", severity=sev, title=f"Confirmed incident near {inc.location_name or inc.state}",
            area=inc.location_name or inc.state or "your area", lat=inc.lat, lon=inc.lon,
            radius_km=s.incident_alert_radius_km, dedupe_key=f"incident:{inc.id}",
            context={"incident_id": inc.id, "fatalities": inc.fatalities}))

    # 3) Satellite fire in the last 24 h within 10 km of an incident in the last 30 days.
    recent = db.execute(select(Incident.lat, Incident.lon, Incident.location_name)
                        .where(Incident.occurred_at >= now - timedelta(days=30))).all()
    for f in db.scalars(select(FeedEvent).where(FeedEvent.kind == "fire",
                                                FeedEvent.observed_at >= now - timedelta(hours=24))):
        near = [r for r in recent if haversine_km(f.lat, f.lon, r.lat, r.lon) <= 10]
        if near:
            created.append(_draft(
                db, trigger="fire", severity="medium", title=f"Fire detected near {near[0].location_name}",
                area=near[0].location_name or "your area", lat=f.lat, lon=f.lon, radius_km=10,
                dedupe_key=f"fire:{f.h3_cell}:{f.observed_at.date().isoformat()}",
                context={"feed_event_id": f.id, "frp": f.value, "nearby_incidents": len(near)}))
    db.commit()
    return [a.id for a in created if a]


def recipients(db: Session, alert: Alert) -> list[Subscriber]:
    subs = db.scalars(select(Subscriber).where(Subscriber.opted_in.is_(True))).all()
    return [s for s in subs if s.lat is not None
            and haversine_km(alert.center_lat, alert.center_lon, s.lat, s.lon) <= alert.radius_km]


def approve(db: Session, alert: Alert, user: User) -> None:
    if alert.status != AlertStatus.draft:
        raise AlertStateError(f"Cannot approve an alert in status '{alert.status}'")
    alert.status, alert.approved_by, alert.approved_at = AlertStatus.approved, user.id, datetime.now(timezone.utc)


def reject(db: Session, alert: Alert, user: User) -> None:
    if alert.status != AlertStatus.draft:
        raise AlertStateError(f"Cannot reject an alert in status '{alert.status}'")
    alert.status, alert.approved_by = AlertStatus.rejected, user.id


def send(db: Session, alert: Alert) -> dict:
    if alert.status != AlertStatus.approved:
        raise AlertStateError("Alert must be approved before sending")
    provider = get_provider()
    rate = max(1, get_settings().sms_rate_per_minute)
    by_lang: dict[str, list[Subscriber]] = {}
    for sub in recipients(db, alert):
        by_lang.setdefault(sub.language if sub.language in alert.messages else "en", []).append(sub)
    sent = failed = 0
    batch_no = 0
    for lang, subs in by_lang.items():
        for i in range(0, len(subs), rate):
            if batch_no:
                time.sleep(60 if provider.name != "console" else 0)
            batch_no += 1
            chunk = subs[i:i + rate]
            phones = {decrypt_phone(s.phone_enc): s for s in chunk}
            for res in provider.send(list(phones), alert.messages[lang]):
                ok = res.ok
                sent += ok
                failed += not ok
                db.add(AlertDelivery(alert_id=alert.id, subscriber_id=phones[res.phone].id,
                                     status="sent" if ok else "failed", provider_ref=res.ref, error=res.error,
                                     sent_at=datetime.now(timezone.utc)))
    alert.status, alert.sent_at = AlertStatus.sent, datetime.now(timezone.utc)
    db.commit()
    publish("alert_sent", {"id": alert.id, "sent": sent, "failed": failed})
    return {"sent": sent, "failed": failed, "provider": provider.name}
