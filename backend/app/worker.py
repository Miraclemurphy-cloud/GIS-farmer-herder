"""Scheduled jobs: ingest, hotspots, model scoring, alert rules.

Run with:  python -m app.worker
"""
import logging

from apscheduler.schedulers.blocking import BlockingScheduler

from app.alerts.service import run_rules
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.ingest import acled, firms, weather
from app.ml import model
from app.services import hotspots

log = logging.getLogger("worker")


def job(fn, *args):
    def run():
        with SessionLocal() as db:
            try:
                log.info("%s -> %s", fn.__module__ + "." + fn.__name__, fn(db, *args))
            except Exception:
                log.exception("job %s failed", fn.__name__)
    run.__name__ = fn.__name__
    return run


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    s = get_settings()
    sched = BlockingScheduler(timezone="Africa/Lagos")
    if s.firms_map_key:
        sched.add_job(job(firms.ingest), "interval", hours=3, id="firms")
    if s.acled_email:
        sched.add_job(job(acled.ingest), "cron", day_of_week="tue", hour=4, id="acled")
    sched.add_job(job(weather.ingest), "cron", day_of_week="mon", hour=2, id="weather")
    sched.add_job(job(hotspots.recompute), "interval", hours=1, id="hotspots")
    sched.add_job(job(model.score), "cron", hour=3, id="score")
    sched.add_job(job(model.train_and_activate), "cron", day="1", hour=1, id="retrain")
    sched.add_job(job(run_rules), "interval", minutes=15, id="alert_rules")
    log.info("worker started with jobs: %s", [j.id for j in sched.get_jobs()])
    sched.start()


if __name__ == "__main__":
    main()
