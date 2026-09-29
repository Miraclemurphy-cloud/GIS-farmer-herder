import re
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, Query
from geoalchemy2.shape import to_shape
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.alerts import service
from app.core.config import get_settings
from app.core.db import SessionLocal, get_db
from app.core.security import audit, current_user, encrypt_phone, normalize_phone, phone_hash, require
from app.models import (
    AdminArea,
    Alert,
    AlertDelivery,
    AlertStatus,
    InboundSms,
    IncidentSource,
    Role,
    Subscriber,
    User,
)
from app.services.incidents import Located, create_incident

router = APIRouter(prefix="/api", tags=["alerts"])


class AlertIn(BaseModel):
    title: str
    area_name: str
    center_lat: float
    center_lon: float
    radius_km: float = Field(15, gt=0, le=100)
    severity: str = "medium"
    trigger: str = "manual"
    messages: dict[str, str] | None = None


class AlertEdit(BaseModel):
    messages: dict[str, str] | None = None
    radius_km: float | None = Field(None, gt=0, le=100)
    severity: str | None = None


class SubscriberIn(BaseModel):
    phone: str
    name: str = ""
    language: str = "en"
    community: str = ""
    lga_id: int | None = None
    lat: float | None = None
    lon: float | None = None


def alert_out(db: Session, a: Alert) -> dict:
    stats = dict(db.execute(select(AlertDelivery.status, func.count()).where(AlertDelivery.alert_id == a.id)
                            .group_by(AlertDelivery.status)).all())
    return {
        "id": a.id, "status": a.status, "trigger": a.trigger, "severity": a.severity, "title": a.title,
        "area_name": a.area_name, "center_lat": a.center_lat, "center_lon": a.center_lon,
        "radius_km": a.radius_km, "messages": a.messages, "context": a.context,
        "created_at": a.created_at, "approved_at": a.approved_at, "sent_at": a.sent_at,
        "recipients_estimate": len(service.recipients(db, a)) if a.status in ("draft", "approved") else None,
        "deliveries": stats,
    }


@router.get("/alerts")
def list_alerts(status: str | None = None, limit: int = Query(50, le=200),
                db: Session = Depends(get_db), _: User = Depends(current_user)):
    stmt = select(Alert).order_by(Alert.created_at.desc()).limit(limit)
    if status:
        stmt = stmt.where(Alert.status.in_(status.split(",")))
    return [alert_out(db, a) for a in db.scalars(stmt)]


@router.post("/alerts", status_code=201)
def create_alert(body: AlertIn, db: Session = Depends(get_db), user: User = Depends(require(Role.analyst))):
    a = Alert(**body.model_dump(exclude={"messages"}), created_by=user.id,
              messages=body.messages or service.render("risk", body.area_name, body.severity))
    db.add(a)
    db.flush()
    audit(db, user, "create", "alert", a.id)
    db.commit()
    return alert_out(db, a)


@router.patch("/alerts/{alert_id}")
def edit_alert(alert_id: int, body: AlertEdit, db: Session = Depends(get_db),
               user: User = Depends(require(Role.analyst))):
    a = db.get(Alert, alert_id)
    if not a:
        raise HTTPException(404)
    if a.status != AlertStatus.draft:
        raise HTTPException(409, "Only drafts can be edited")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(a, k, v)
    audit(db, user, "edit", "alert", a.id)
    db.commit()
    return alert_out(db, a)


@router.post("/alerts/run-rules")
def run_rules(db: Session = Depends(get_db), user: User = Depends(require(Role.analyst))):
    ids = service.run_rules(db)
    audit(db, user, "run_rules", "alert", None, created=ids)
    db.commit()
    return {"created": ids}


def _transition(db: Session, alert_id: int, user: User, fn, action: str) -> Alert:
    a = db.get(Alert, alert_id)
    if not a:
        raise HTTPException(404)
    try:
        fn(db, a, user)
    except service.AlertStateError as e:
        raise HTTPException(409, str(e))
    audit(db, user, action, "alert", a.id)
    db.commit()
    return a


@router.post("/alerts/{alert_id}/approve")
def approve(alert_id: int, db: Session = Depends(get_db), user: User = Depends(require(Role.analyst))):
    return alert_out(db, _transition(db, alert_id, user, service.approve, "approve"))


@router.post("/alerts/{alert_id}/reject")
def reject(alert_id: int, db: Session = Depends(get_db), user: User = Depends(require(Role.analyst))):
    return alert_out(db, _transition(db, alert_id, user, service.reject, "reject"))


def _send_bg(alert_id: int) -> None:
    with SessionLocal() as db:
        service.send(db, db.get(Alert, alert_id))


@router.post("/alerts/{alert_id}/send", status_code=202)
def send(alert_id: int, bg: BackgroundTasks, db: Session = Depends(get_db),
         user: User = Depends(require(Role.analyst))):
    a = db.get(Alert, alert_id)
    if not a:
        raise HTTPException(404)
    if a.status != AlertStatus.approved:
        raise HTTPException(409, "Alert must be approved before sending")
    audit(db, user, "send", "alert", a.id, recipients=len(service.recipients(db, a)))
    db.commit()
    bg.add_task(_send_bg, a.id)
    return {"queued": True}


# ---------------- Subscribers ----------------

def sub_out(s: Subscriber) -> dict:
    return {"id": s.id, "phone": f"•••• {s.phone_last4}", "name": s.name, "language": s.language,
            "community": s.community, "state": s.state, "lga": s.lga.name if s.lga else None,
            "lat": s.lat, "lon": s.lon, "opted_in": s.opted_in, "created_at": s.created_at}


@router.get("/subscribers")
def list_subscribers(q: str | None = None, limit: int = Query(100, le=500), offset: int = 0,
                     db: Session = Depends(get_db), _: User = Depends(require(Role.analyst))):
    stmt = select(Subscriber)
    if q:
        stmt = stmt.where(Subscriber.name.ilike(f"%{q}%") | Subscriber.community.ilike(f"%{q}%"))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    by_lang = dict(db.execute(select(Subscriber.language, func.count()).where(Subscriber.opted_in.is_(True))
                              .group_by(Subscriber.language)).all())
    items = db.scalars(stmt.order_by(Subscriber.id.desc()).limit(limit).offset(offset)).all()
    return {"total": total, "by_language": by_lang, "items": [sub_out(s) for s in items]}


@router.post("/subscribers", status_code=201)
def create_subscriber(body: SubscriberIn, db: Session = Depends(get_db), user: User = Depends(require(Role.analyst))):
    phone = normalize_phone(body.phone)
    if len(phone) < 12:
        raise HTTPException(422, "Invalid phone number")
    if db.scalar(select(Subscriber.id).where(Subscriber.phone_hash == phone_hash(phone))):
        raise HTTPException(409, "Phone already subscribed")
    lat, lon, state = body.lat, body.lon, None
    if body.lga_id:
        lga = db.get(AdminArea, body.lga_id)
        if not lga:
            raise HTTPException(422, "Unknown LGA")
        state = lga.state
        if lat is None:
            c = to_shape(lga.geom).representative_point()
            lat, lon = c.y, c.x
    s = Subscriber(phone_enc=encrypt_phone(phone), phone_hash=phone_hash(phone), phone_last4=phone[-4:],
                   name=body.name, language=body.language, community=body.community, state=state,
                   lga_id=body.lga_id, lat=lat, lon=lon)
    db.add(s)
    db.flush()
    audit(db, user, "create", "subscriber", s.id)
    db.commit()
    return sub_out(s)


@router.delete("/subscribers/{sub_id}", status_code=204)
def delete_subscriber(sub_id: int, db: Session = Depends(get_db), user: User = Depends(require(Role.analyst))):
    s = db.get(Subscriber, sub_id)
    if not s:
        raise HTTPException(404)
    # Data minimisation: keep delivery history rows but erase the contact itself.
    s.opted_in, s.phone_enc, s.name = False, "", ""
    audit(db, user, "erase", "subscriber", sub_id)
    db.commit()


# ---------------- Inbound SMS (Africa's Talking callback) ----------------

REPORT_RX = re.compile(r"^\s*(REPORT|RAHOTO)\b[\s:,-]*(.*)$", re.I | re.S)


@router.post("/sms/inbound")
def inbound_sms(token: str = Query(...), from_: str = Form(..., alias="from"), text: str = Form(""),
                db: Session = Depends(get_db)):
    expected = get_settings().sms_webhook_token
    if not expected or not secrets.compare_digest(token, expected):
        raise HTTPException(403)
    phone = normalize_phone(from_)
    h = phone_hash(phone)
    sub = db.scalar(select(Subscriber).where(Subscriber.phone_hash == h))
    msg = InboundSms(phone_hash=h, text=text[:1000])
    cmd = text.strip().upper()
    if cmd in ("STOP", "TSAYA", "DAINA"):
        msg.action = "stop"
        if sub:
            sub.opted_in = False
    elif cmd.startswith(("JOIN", "START")):
        msg.action = "join"
        if sub:
            sub.opted_in = True
    elif m := REPORT_RX.match(text):
        body = m.group(2).strip()
        loc = _locate_report(db, body, sub)
        if loc:
            lat, lon, located = loc
            inc = create_incident(db, lat=lat, lon=lon, occurred_at=datetime.now(timezone.utc), located=located,
                                  source=IncidentSource.community_sms, confidence=0.3, notes=body[:1000],
                                  type="other", location_name=located.lga_name or "")
            msg.action, msg.incident_id = "report", inc.id
        else:
            msg.action = "unlocated"
    else:
        msg.action = "unknown"
    db.add(msg)
    db.commit()
    return {"ok": True, "action": msg.action}


def _locate_report(db: Session, body: str, sub: Subscriber | None):
    """Prefer an LGA named in the text, else the subscriber's registered location."""
    words = body.lower()
    for a in db.scalars(select(AdminArea).where(AdminArea.level == 2)):
        if re.search(rf"\b{re.escape(a.name.lower())}\b", words):
            c = to_shape(a.geom).representative_point()
            return c.y, c.x, Located(a.state, a.id, a.name)
    if sub and sub.lat is not None:
        return sub.lat, sub.lon, Located(sub.state, sub.lga_id, sub.lga.name if sub.lga else None)
    return None
