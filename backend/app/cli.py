"""Bootstrap and maintenance commands.

  python -m app.cli bootstrap     # boundaries, grid, admin user, historical data, weather, hotspots, model
  python -m app.cli <step>        # boundaries | admin | acled | synthetic | weather | firms | hotspots | train | score | rules
  python -m app.cli purge-demo    # delete synthetic incidents, demo subscribers and everything derived from them
  python -m app.cli demo          # full demo database: bootstrap + one login per role + staged scenario
  python -m app.cli demo-scenario # re-stage the scenario (resets alerts) before each presentation
"""
import logging
import sys

from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import Role, User

log = logging.getLogger("cli")


def admin(db):
    s = get_settings()
    if db.scalar(select(User).where(User.email == s.admin_email.lower())):
        return "exists"
    db.add(User(email=s.admin_email.lower(), name="Administrator", password_hash=hash_password(s.admin_password),
                role=Role.admin))
    db.commit()
    return "created"


def boundaries(db):
    from app.ingest.boundaries import build_grid, load_boundaries, prepare_seed, seed_path

    if not seed_path().exists():
        prepare_seed()
    return {"areas": load_boundaries(db), "cells": build_grid(db)}


def history(db):
    s = get_settings()
    if s.acled_email and s.acled_password:
        from app.ingest import acled
        return {"acled": acled.ingest(db)}
    from app.ingest import synthetic
    if s.sms_provider != "console":
        raise RuntimeError("Refusing to generate demo data (including fake subscribers) while a real SMS provider "
                           "is configured. Set ACLED_EMAIL/ACLED_PASSWORD, or use SMS_PROVIDER=console.")
    log.warning("ACLED credentials not set — generating SYNTHETIC demo data (flagged in the UI)")
    return {"synthetic": synthetic.generate(db), "demo_subscribers": synthetic.demo_subscribers(db)}


def step(name, db):
    from app import demo
    from app.alerts.service import run_rules
    from app.ingest import acled, firms, synthetic, weather
    from app.ml import model
    from app.services import hotspots

    return {
        "boundaries": boundaries, "admin": admin, "history": history, "acled": acled.ingest,
        "synthetic": synthetic.generate, "subscribers": synthetic.demo_subscribers,
        "weather": weather.ingest, "firms": firms.ingest, "hotspots": hotspots.recompute,
        "train": lambda d: model.train_and_activate(d).metrics["summary"], "score": model.score, "rules": run_rules,
        "purge-demo": synthetic.purge, "demo-users": demo.demo_users, "demo-scenario": demo.stage_scenario,
    }[name](db)


BOOTSTRAP = ["boundaries", "admin", "history", "weather", "hotspots", "train", "score", "rules"]
DEMO = ["boundaries", "admin", "history", "weather", "train", "demo-users", "demo-scenario"]


def main(argv):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    steps = {"bootstrap": BOOTSTRAP, "demo": DEMO}.get(argv[0], argv) if argv else BOOTSTRAP
    for name in steps:
        with SessionLocal() as db:
            try:
                log.info("%s: %s", name, step(name, db))
            except Exception as e:
                if name == "weather":  # optional network source
                    log.warning("weather skipped: %s", e)
                    continue
                raise


if __name__ == "__main__":
    main(sys.argv[1:] or ["bootstrap"])
