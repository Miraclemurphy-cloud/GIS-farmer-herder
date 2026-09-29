"""Database models. All geometries are WGS84 (SRID 4326)."""
from datetime import datetime, timezone
from enum import StrEnum

from geoalchemy2 import Geometry
from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(StrEnum):
    admin = "admin"
    analyst = "analyst"
    field_agent = "field_agent"
    viewer = "viewer"


class IncidentType(StrEnum):
    attack = "attack"
    cattle_rustling = "cattle_rustling"
    crop_destruction = "crop_destruction"
    reprisal = "reprisal"
    clash = "clash"
    other = "other"


class IncidentSource(StrEnum):
    community_sms = "community_sms"
    field_agent = "field_agent"
    acled = "acled"
    firms = "firms"
    upload = "upload"


class IncidentStatus(StrEnum):
    reported = "reported"
    verified = "verified"
    responded = "responded"
    resolved = "resolved"
    closed = "closed"
    dismissed = "dismissed"


STATUS_FLOW = [
    IncidentStatus.reported,
    IncidentStatus.verified,
    IncidentStatus.responded,
    IncidentStatus.resolved,
    IncidentStatus.closed,
]


class AlertStatus(StrEnum):
    draft = "draft"
    approved = "approved"
    sent = "sent"
    rejected = "rejected"


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default=Role.viewer)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AdminArea(Base):
    __tablename__ = "admin_areas"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    level: Mapped[int] = mapped_column(Integer)  # 1 = state, 2 = LGA
    state: Mapped[str] = mapped_column(String(60))
    geom = mapped_column(Geometry("MULTIPOLYGON", srid=4326, spatial_index=True))
    __table_args__ = (UniqueConstraint("level", "state", "name"),)


class Upload(Base):
    __tablename__ = "uploads"
    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    fmt: Mapped[str] = mapped_column(String(10))
    rows_total: Mapped[int] = mapped_column(Integer, default=0)
    rows_valid: Mapped[int] = mapped_column(Integer, default=0)
    rows_committed: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[list] = mapped_column(JSON, default=list)
    preview: Mapped[list] = mapped_column(JSON, default=list)
    committed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Incident(Base):
    __tablename__ = "incidents"
    id: Mapped[int] = mapped_column(primary_key=True)
    geom = mapped_column(Geometry("POINT", srid=4326, spatial_index=True))
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    h3_cell: Mapped[str] = mapped_column(String(16), index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    state: Mapped[str | None] = mapped_column(String(60), index=True)
    lga_id: Mapped[int | None] = mapped_column(ForeignKey("admin_areas.id"))
    location_name: Mapped[str] = mapped_column(String(200), default="")
    type: Mapped[str] = mapped_column(String(30), default=IncidentType.attack)
    cause: Mapped[str | None] = mapped_column(String(40))
    fatalities: Mapped[int] = mapped_column(Integer, default=0)
    injured: Mapped[int] = mapped_column(Integer, default=0)
    displaced: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(20), index=True)
    source_ref: Mapped[str | None] = mapped_column(String(80))
    # Demo records generated when no ACLED credentials are configured; always flagged in the UI.
    synthetic: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default=IncidentStatus.reported, index=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    notes: Mapped[str] = mapped_column(Text, default="")
    upload_id: Mapped[int | None] = mapped_column(ForeignKey("uploads.id"))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    lga: Mapped[AdminArea | None] = relationship()
    status_events: Mapped[list["IncidentStatusEvent"]] = relationship(
        back_populates="incident", order_by="IncidentStatusEvent.at", cascade="all, delete-orphan"
    )
    __table_args__ = (UniqueConstraint("source", "source_ref", name="uq_incident_source_ref"),)


class IncidentStatusEvent(Base):
    __tablename__ = "incident_status_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    by_user: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str] = mapped_column(Text, default="")
    incident: Mapped[Incident] = relationship(back_populates="status_events")


class H3Cell(Base):
    __tablename__ = "h3_cells"
    cell: Mapped[str] = mapped_column(String(16), primary_key=True)
    state: Mapped[str] = mapped_column(String(60), index=True)
    lga_id: Mapped[int | None] = mapped_column(ForeignKey("admin_areas.id"))
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    geom = mapped_column(Geometry("POLYGON", srid=4326, spatial_index=True))
    # Static features (km). Null until the corresponding layer is ingested.
    dist_state_border_km: Mapped[float | None] = mapped_column(Float)
    dist_lga_border_km: Mapped[float | None] = mapped_column(Float)


class RiskScore(Base):
    __tablename__ = "risk_scores"
    id: Mapped[int] = mapped_column(primary_key=True)
    cell: Mapped[str] = mapped_column(ForeignKey("h3_cells.cell"), index=True)
    week_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    probability: Mapped[float] = mapped_column(Float)
    model_version: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("cell", "week_start", "model_version"),)


class Hotspot(Base):
    __tablename__ = "hotspots"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(10))  # "cluster" (HDBSCAN) | "gi" (Getis-Ord cell)
    label: Mapped[str] = mapped_column(String(60), default="")
    geom = mapped_column(Geometry("GEOMETRY", srid=4326))
    incident_count: Mapped[int] = mapped_column(Integer, default=0)
    fatalities: Mapped[int] = mapped_column(Integer, default=0)
    z_score: Mapped[float | None] = mapped_column(Float)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Feed(Base):
    """A camera or data feed registered by an operator."""

    __tablename__ = "feeds"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(20))  # hls | mjpeg | image | embed
    url: Mapped[str] = mapped_column(String(500))
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    license_note: Mapped[str] = mapped_column(String(300), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class FeedEvent(Base):
    """Remote-sensing / sensor observations (FIRMS fires, weather)."""

    __tablename__ = "feed_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), index=True)  # fire | weather
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    h3_cell: Mapped[str] = mapped_column(String(16), index=True)
    value: Mapped[float | None] = mapped_column(Float)  # FRP (MW) for fires, precip (mm) for weather
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    dedupe_key: Mapped[str] = mapped_column(String(120), unique=True)


class Subscriber(Base):
    __tablename__ = "subscribers"
    id: Mapped[int] = mapped_column(primary_key=True)
    phone_enc: Mapped[str] = mapped_column(Text)
    phone_hash: Mapped[str] = mapped_column(String(64), unique=True)
    phone_last4: Mapped[str] = mapped_column(String(4))
    name: Mapped[str] = mapped_column(String(120), default="")
    language: Mapped[str] = mapped_column(String(5), default="en")  # en | ha | tiv
    community: Mapped[str] = mapped_column(String(120), default="")
    state: Mapped[str | None] = mapped_column(String(60))
    lga_id: Mapped[int | None] = mapped_column(ForeignKey("admin_areas.id"))
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    opted_in: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    lga: Mapped[AdminArea | None] = relationship()


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(primary_key=True)
    status: Mapped[str] = mapped_column(String(20), default=AlertStatus.draft, index=True)
    trigger: Mapped[str] = mapped_column(String(30))  # risk | incident | fire | manual
    severity: Mapped[str] = mapped_column(String(10), default="medium")
    title: Mapped[str] = mapped_column(String(200))
    area_name: Mapped[str] = mapped_column(String(200))
    center_lat: Mapped[float] = mapped_column(Float)
    center_lon: Mapped[float] = mapped_column(Float)
    radius_km: Mapped[float] = mapped_column(Float, default=15.0)
    messages: Mapped[dict] = mapped_column(JSON, default=dict)  # {lang: text}
    context: Mapped[dict] = mapped_column(JSON, default=dict)
    dedupe_key: Mapped[str | None] = mapped_column(String(120), unique=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deliveries: Mapped[list["AlertDelivery"]] = relationship(back_populates="alert")


class AlertDelivery(Base):
    __tablename__ = "alert_deliveries"
    id: Mapped[int] = mapped_column(primary_key=True)
    alert_id: Mapped[int] = mapped_column(ForeignKey("alerts.id"), index=True)
    subscriber_id: Mapped[int] = mapped_column(ForeignKey("subscribers.id"))
    status: Mapped[str] = mapped_column(String(20), default="queued")  # queued | sent | failed
    provider_ref: Mapped[str | None] = mapped_column(String(120))
    error: Mapped[str | None] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    alert: Mapped[Alert] = relationship(back_populates="deliveries")


class InboundSms(Base):
    __tablename__ = "inbound_sms"
    id: Mapped[int] = mapped_column(primary_key=True)
    phone_hash: Mapped[str] = mapped_column(String(64), index=True)
    text: Mapped[str] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    incident_id: Mapped[int | None] = mapped_column(ForeignKey("incidents.id"))
    action: Mapped[str] = mapped_column(String(20), default="")  # report | stop | join | unknown


class ModelRun(Base):
    __tablename__ = "model_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    version: Mapped[str] = mapped_column(String(40), unique=True)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    feature_names: Mapped[list] = mapped_column(JSON, default=list)
    trained_through: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    active: Mapped[bool] = mapped_column(Boolean, default=False)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(60))
    entity: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str | None] = mapped_column(String(40))
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


Index("ix_incidents_state_time", Incident.state, Incident.occurred_at)
