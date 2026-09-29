import pytest

from app.alerts import service
from app.models import Alert, AlertStatus, User


def make_alert(db):
    a = Alert(trigger="manual", severity="medium", title="t", area_name="Guma", center_lat=7.8, center_lon=8.6,
              radius_km=10, messages=service.render("risk", "Guma", "medium"))
    db.add(a)
    db.flush()
    return a


def test_cannot_send_without_approval(db):
    a = make_alert(db)
    with pytest.raises(service.AlertStateError):
        service.send(db, a)
    assert a.status == AlertStatus.draft


def test_rejected_cannot_be_approved(db):
    user = User(email="t@example.org", password_hash="x", role="analyst")
    db.add(user)
    db.flush()
    a = make_alert(db)
    service.reject(db, a, user)
    with pytest.raises(service.AlertStateError):
        service.approve(db, a, user)


def test_templates_have_all_languages_and_optout():
    for trigger in ("risk", "incident", "fire"):
        msgs = service.render(trigger, "Bokkos", "high")
        assert set(msgs) == {"en", "ha", "tiv"}
        assert all("STOP" in m and "Bokkos" in m for m in msgs.values())
