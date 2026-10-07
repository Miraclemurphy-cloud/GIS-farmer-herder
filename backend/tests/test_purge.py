from datetime import datetime, timezone

from sqlalchemy import select

from app.core.security import encrypt_phone, phone_hash
from app.ingest.synthetic import DEMO_PHONE, purge
from app.models import Incident, Subscriber
from app.services.incidents import Located, create_incident


def _sub(db, phone):
    s = Subscriber(phone_enc=encrypt_phone(phone), phone_hash=phone_hash(phone), phone_last4=phone[-4:])
    db.add(s)
    db.flush()
    return s.id


def test_purge_removes_demo_data_only(db):
    demo_inc = create_incident(db, lat=7.75, lon=8.55, occurred_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
                               located=Located("Benue", None, None), source="field_agent", synthetic=True, emit=False)
    real_inc = create_incident(db, lat=7.75, lon=8.55, occurred_at=datetime(2025, 1, 2, tzinfo=timezone.utc),
                               located=Located("Benue", None, None), source="field_agent", emit=False)
    demo_sub = _sub(db, DEMO_PHONE.format(9999))
    real_sub = _sub(db, "+2348031234567")

    purge(db)

    assert db.get(Incident, demo_inc.id) is None
    assert db.get(Incident, real_inc.id) is not None
    assert db.scalar(select(Subscriber.id).where(Subscriber.id == demo_sub)) is None
    assert db.scalar(select(Subscriber.id).where(Subscriber.id == real_sub)) == real_sub
