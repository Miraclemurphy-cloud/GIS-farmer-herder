"""Aggregates behind each dashboard card."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import current_user
from app.models import STATUS_FLOW, Alert, AlertStatus, Incident, IncidentStatus, ModelRun, RiskScore, User

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

ACTIVE = (IncidentStatus.reported, IncidentStatus.verified, IncidentStatus.responded)


def _window(months: int, state: str | None):
    start = datetime.now(timezone.utc) - timedelta(days=int(months * 30.44))
    conds = [Incident.occurred_at >= start, Incident.status != IncidentStatus.dismissed]
    if state:
        conds.append(Incident.state == state)
    return start, and_(*conds)


@router.get("/dashboard")
def dashboard(months: int = Query(6, ge=1, le=120), state: str | None = None,
              db: Session = Depends(get_db), _: User = Depends(current_user)):
    start, where = _window(months, state)
    affected = Incident.fatalities + Incident.injured + Incident.displaced

    # --- Incident pipeline: count + people affected + mean hours spent in each stage ---
    counts = {r.status: (r.n, r.people) for r in db.execute(
        select(Incident.status, func.count().label("n"), func.coalesce(func.sum(affected), 0).label("people"))
        .where(where).group_by(Incident.status))}
    stage_hours = {r.status: r.hours for r in db.execute(text("""
        SELECT e.status, AVG(EXTRACT(EPOCH FROM (e.next_at - e.at)) / 3600.0) AS hours
        FROM (SELECT ise.status, ise.at,
                     LEAD(ise.at) OVER (PARTITION BY ise.incident_id ORDER BY ise.at) AS next_at
              FROM incident_status_events ise
              JOIN incidents i ON i.id = ise.incident_id
              WHERE i.occurred_at >= :start AND (CAST(:state AS text) IS NULL OR i.state = :state)) e
        WHERE e.next_at IS NOT NULL
        GROUP BY e.status"""), {"start": start, "state": state})}
    pipeline = [{"status": s.value, "count": counts.get(s, (0, 0))[0], "people_affected": int(counts.get(s, (0, 0))[1]),
                 "avg_hours_in_stage": round(stage_hours[s], 1) if stage_hours.get(s) is not None else None}
                for s in STATUS_FLOW]

    # --- Report sources (three metrics for the toggle chips) ---
    sources = [{"source": r.source, "reports": r.reports, "verified": r.verified, "fatalities": int(r.fatalities)}
               for r in db.execute(
                   select(Incident.source, func.count().label("reports"),
                          func.count().filter(Incident.status != IncidentStatus.reported).label("verified"),
                          func.coalesce(func.sum(Incident.fatalities), 0).label("fatalities"))
                   .where(where).group_by(Incident.source).order_by(func.count().desc()))]

    # --- Causes ---
    cause_rows = db.execute(select(func.coalesce(Incident.cause, "unknown").label("cause"), func.count().label("n"))
                            .where(where).group_by("cause").order_by(func.count().desc())).all()
    total = sum(r.n for r in cause_rows) or 1
    causes = [{"cause": r.cause, "count": r.n, "pct": round(100 * r.n / total, 1)} for r in cause_rows]

    # --- KPIs ---
    s = get_settings()
    latest_week = db.scalar(select(func.max(RiskScore.week_start)))
    active_model = db.scalar(select(ModelRun).where(ModelRun.active.is_(True)))
    high_risk = 0
    if latest_week and active_model:
        high_risk = db.scalar(select(func.count()).where(
            RiskScore.week_start == latest_week, RiskScore.model_version == active_model.version,
            RiskScore.probability >= s.risk_alert_threshold))
    verify_hours = stage_hours.get(IncidentStatus.reported)
    totals = db.execute(select(func.count(), func.coalesce(func.sum(Incident.fatalities), 0),
                               func.coalesce(func.sum(Incident.displaced), 0)).where(where)).one()
    return {
        "window": {"months": months, "start": start, "state": state},
        "active_incidents": sum(counts.get(st, (0, 0))[0] for st in ACTIVE),
        "pipeline": pipeline,
        "sources": sources,
        "causes": causes,
        "kpis": {
            "total_incidents": totals[0],
            "fatalities": int(totals[1]),
            "displaced": int(totals[2]),
            "avg_hours_to_verify": round(verify_hours, 1) if verify_hours else None,
            "high_risk_cells": high_risk,
            "risk_week": latest_week,
            "alerts_pending": db.scalar(select(func.count()).where(Alert.status == AlertStatus.draft)),
            "alerts_sent_window": db.scalar(select(func.count()).where(Alert.status == AlertStatus.sent,
                                                                       Alert.sent_at >= start)),
        },
        "synthetic_data": bool(db.scalar(select(Incident.id).where(Incident.synthetic.is_(True)).limit(1))),
    }


@router.get("/trend")
def trend(months: int = Query(6, ge=1, le=120), state: str | None = None,
          db: Session = Depends(get_db), _: User = Depends(current_user)):
    """Monthly incidents and fatalities per state (the two-line tracking chart)."""
    _, where = _window(120, state)
    now = datetime.now(timezone.utc)
    start_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    for _ in range(months - 1):
        start_month = (start_month - timedelta(days=1)).replace(day=1)
    month = func.date_trunc("month", Incident.occurred_at).label("month")
    rows = db.execute(
        select(month, Incident.state, func.count().label("incidents"),
               func.coalesce(func.sum(Incident.fatalities), 0).label("fatalities"))
        .where(where, Incident.occurred_at >= start_month).group_by(month, Incident.state).order_by(month)).all()
    series: dict[str, dict] = {}
    m = start_month
    while m <= now:
        series[m.strftime("%Y-%m")] = {"month": m.strftime("%Y-%m"), "Benue": 0, "Plateau": 0,
                                       "Benue_fatalities": 0, "Plateau_fatalities": 0}
        m = (m + timedelta(days=32)).replace(day=1)
    for r in rows:
        key = r.month.strftime("%Y-%m")
        if key in series and r.state in ("Benue", "Plateau"):
            series[key][r.state] = r.incidents
            series[key][f"{r.state}_fatalities"] = int(r.fatalities)
    points = list(series.values())
    return {
        "points": points,
        "total_incidents": sum(p["Benue"] + p["Plateau"] for p in points),
        "total_fatalities": sum(p["Benue_fatalities"] + p["Plateau_fatalities"] for p in points),
    }


@router.get("/lga")
def by_lga(months: int = Query(6, ge=1, le=120), state: str | None = None,
           db: Session = Depends(get_db), _: User = Depends(current_user)):
    from app.models import AdminArea

    _, where = _window(months, state)
    rows = db.execute(
        select(AdminArea.name, AdminArea.state, func.count(Incident.id).label("incidents"),
               func.coalesce(func.sum(Incident.fatalities), 0).label("fatalities"))
        .join(Incident, Incident.lga_id == AdminArea.id).where(where)
        .group_by(AdminArea.name, AdminArea.state).order_by(func.count(Incident.id).desc()).limit(15)).all()
    return [{"lga": r.name, "state": r.state, "incidents": r.incidents, "fatalities": int(r.fatalities)} for r in rows]
