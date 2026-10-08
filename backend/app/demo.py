"""Demo preparation: a staged incident story and one login per role.

Only for demo databases. Everything staged here is flagged synthetic, so `purge-demo` removes it.
"""
import secrets
from datetime import datetime, timedelta, timezone

from geoalchemy2.shape import to_shape
from shapely.geometry import Point
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import ROOT, get_settings
from app.core.geo import cell_of
from app.core.security import hash_password, phone_hash
from app.ingest.synthetic import DEMO_PHONE
from app.models import (
    AdminArea,
    Alert,
    AlertDelivery,
    FeedEvent,
    InboundSms,
    Incident,
    IncidentStatus,
    IncidentStatusEvent,
    Role,
    User,
)
from app.services.incidents import Located, create_incident

SCENARIO_PREFIX = "scenario-"
CREDENTIALS_FILE = ROOT / "demo-credentials.txt"
DEMO_DOMAIN = "demo.example.org"
DEMO_USERS = [
    (Role.admin, "admin", "Demo Administrator"),
    (Role.analyst, "analyst", "Demo Analyst"),
    (Role.field_agent, "field.agent", "Demo Field Agent"),
    (Role.viewer, "viewer", "Demo Viewer"),
]


def _require_demo_mode() -> None:
    if get_settings().sms_provider != "console":
        raise RuntimeError("Demo staging only runs with SMS_PROVIDER=console, so no real messages can be sent.")


def _area(db: Session, name: str) -> tuple[AdminArea, Point]:
    a = db.scalar(select(AdminArea).where(AdminArea.level == 2, AdminArea.name == name))
    if a is None:
        raise RuntimeError(f"LGA {name!r} not found: run the 'boundaries' step first")
    return a, to_shape(a.geom).representative_point()


def _near(poly_point: Point, dlat: float, dlon: float) -> tuple[float, float]:
    return poly_point.y + dlat, poly_point.x + dlon


def reset_scenario(db: Session) -> None:
    ids = select(Incident.id).where(Incident.source_ref.like(f"{SCENARIO_PREFIX}%"))
    db.execute(delete(InboundSms).where(InboundSms.incident_id.in_(ids)))
    db.execute(delete(IncidentStatusEvent).where(IncidentStatusEvent.incident_id.in_(ids)))
    db.execute(delete(Incident).where(Incident.source_ref.like(f"{SCENARIO_PREFIX}%")))
    db.execute(delete(FeedEvent).where(FeedEvent.dedupe_key.like(f"synthetic:{SCENARIO_PREFIX}%")))
    # Start every demo with a clean alert queue.
    db.execute(delete(AlertDelivery))
    db.execute(delete(Alert))
    db.flush()


def stage_scenario(db: Session, now: datetime | None = None) -> dict:
    """Stage a story an audience can follow, relative to the current time.

    Guma (Benue): a verified attack yesterday, a satellite fire nearby, and a fresh community SMS report
    that is still waiting for verification. Bokkos (Plateau): cattle rustling three days ago with a response
    under way. Then hotspots, risk scores and alert rules are refreshed so drafts are waiting for approval.
    """
    _require_demo_mode()
    now = now or datetime.now(timezone.utc)
    reset_scenario(db)

    guma, g = _area(db, "Guma")
    bokkos, b = _area(db, "Bokkos")
    guma_loc = Located(guma.state, guma.id, guma.name)

    lat, lon = _near(g, 0.01, 0.02)
    attack = create_incident(
        db, lat=lat, lon=lon, occurred_at=now - timedelta(hours=26), reported_at=now - timedelta(hours=25),
        status=IncidentStatus.verified, located=guma_loc, emit=False, synthetic=True,
        source="field_agent", source_ref=f"{SCENARIO_PREFIX}guma-attack", type="attack", cause="crop_destruction",
        fatalities=4, injured=6, displaced=300, confidence=0.9, location_name="Guma (riverside farms)",
        notes="Demo scenario. Armed men attacked farming settlements after a dispute over crops destroyed by grazing "
              "cattle. Confirmed by the local field agent and a district health post.",
    )
    attack.status_events.append(IncidentStatusEvent(status=IncidentStatus.verified, at=now - timedelta(hours=22),
                                                     note="Confirmed by field agent and health post"))

    flat, flon = _near(g, 0.025, 0.035)
    db.add(FeedEvent(kind="fire", observed_at=now - timedelta(hours=20), lat=flat, lon=flon, h3_cell=cell_of(flat, flon),
                     value=31.4, data={"confidence": "h", "satellite": "VIIRS (synthetic)"},
                     dedupe_key=f"synthetic:{SCENARIO_PREFIX}guma-fire"))

    slat, slon = _near(g, 0.04, -0.01)
    sms_text = "REPORT Guma: armed men seen near the farms by the river"
    report = create_incident(
        db, lat=slat, lon=slon, occurred_at=now - timedelta(minutes=95), reported_at=now - timedelta(minutes=95),
        located=guma_loc, emit=False, synthetic=True, source="community_sms",
        source_ref=f"{SCENARIO_PREFIX}guma-sms", type="other", confidence=0.3, location_name="Guma",
        notes=sms_text[len("REPORT "):],
    )
    db.add(InboundSms(phone_hash=phone_hash(DEMO_PHONE.format(1)), text=sms_text, action="report",
                      received_at=now - timedelta(minutes=95), incident_id=report.id))

    blat, blon = _near(b, -0.01, 0.01)
    rustling = create_incident(
        db, lat=blat, lon=blon, occurred_at=now - timedelta(days=3), reported_at=now - timedelta(days=3, hours=-2),
        status=IncidentStatus.responded, located=Located(bokkos.state, bokkos.id, bokkos.name), emit=False,
        synthetic=True, source="upload", source_ref=f"{SCENARIO_PREFIX}bokkos-rustling", type="cattle_rustling",
        cause="cattle_rustling", fatalities=1, injured=2, confidence=0.8, location_name="Bokkos (grazing reserve edge)",
        notes="Demo scenario. 40 cattle taken overnight; community vigilante and police joint patrol deployed.",
    )
    rustling.status_events.append(IncidentStatusEvent(status=IncidentStatus.verified, at=now - timedelta(days=2, hours=20)))
    rustling.status_events.append(IncidentStatusEvent(status=IncidentStatus.responded, at=now - timedelta(days=2, hours=8),
                                                      note="Joint patrol deployed"))
    db.commit()

    from app.alerts.service import run_rules
    from app.ml import model
    from app.services import hotspots

    result = {"incidents": [attack.id, report.id, rustling.id], "hotspots": hotspots.recompute(db)}
    try:
        result["risk_scores"] = model.score(db)
    except RuntimeError as e:  # no trained model yet
        result["risk_scores"] = f"skipped: {e}"
    result["draft_alerts"] = run_rules(db, now=now)
    return result


def demo_users(db: Session) -> dict:
    """Create or reset one login per role; passwords go to demo-credentials.txt (git-ignored), never stdout."""
    lines = ["# Demo logins (regenerated by `python -m app.cli demo-users`). Do not commit.", ""]
    for role, local, name in DEMO_USERS:
        email = f"{local}@{DEMO_DOMAIN}"
        password = secrets.token_urlsafe(12)
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(email=email, name=name, role=role)
            db.add(user)
        user.password_hash, user.role, user.active, user.name = hash_password(password), role, True, name
        lines.append(f"{role.value:<12} {email:<32} {password}")
    db.commit()
    CREDENTIALS_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return {"users": [f"{local}@{DEMO_DOMAIN}" for _, local, _ in DEMO_USERS], "credentials_file": str(CREDENTIALS_FILE)}
