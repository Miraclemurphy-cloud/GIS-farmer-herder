"""Unauthenticated endpoints for the public landing page.

Aggregates only: no coordinates, risk cells, incident details or personal data are exposed here.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models import (
    AdminArea,
    Alert,
    AlertStatus,
    Incident,
    IncidentStatus,
    ModelRun,
    Subscriber,
)

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/summary")
def summary(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "public, max-age=300"
    since = datetime.now(timezone.utc) - timedelta(days=365)
    counted = (Incident.occurred_at >= since) & (Incident.status != IncidentStatus.dismissed)
    run = db.scalar(select(ModelRun).where(ModelRun.active.is_(True)))
    return {
        "incidents_12m": db.scalar(select(func.count()).where(counted)),
        "lgas_covered": db.scalar(select(func.count()).where(AdminArea.level == 2)),
        "subscribers": db.scalar(select(func.count()).where(Subscriber.opted_in.is_(True))),
        "alerts_sent": db.scalar(select(func.count()).where(Alert.status == AlertStatus.sent)),
        "forecast_top5_capture": (run.metrics.get("summary", {}).get("model_top5_capture") if run else None),
        "synthetic_data": bool(db.scalar(select(Incident.id).where(Incident.synthetic.is_(True)).limit(1))),
        "updated_at": datetime.now(timezone.utc),
    }
