"""Train, evaluate and score the attack-risk model.

* Baseline: each cell's smoothed historical rate of positive weeks.
* Model: LightGBM on the features in `features.py`, isotonic-calibrated on the
  most recent slice of the training period.
* Validation: rolling-origin — train on everything before a 26-week test block,
  test on the block; repeated over the last few blocks. Never random splits.
"""
import logging
from datetime import datetime, timedelta, timezone

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sqlalchemy import delete, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.events import publish
from app.ml.features import FEATURES, compute_features, load_grid, week_start
from app.models import ModelRun, RiskScore

log = logging.getLogger(__name__)
TEST_BLOCK = 26
N_FOLDS = 4
CALIB_WEEKS = 26
TOP_K = 0.05
PARAMS = dict(n_estimators=400, learning_rate=0.03, num_leaves=31, min_child_samples=50,
              subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=1.0, verbose=-1)


class RiskModel:
    def __init__(self, booster: lgb.LGBMClassifier, calibrator: IsotonicRegression, version: str):
        self.booster, self.calibrator, self.version = booster, calibrator, version

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return self.calibrator.predict(self.booster.predict_proba(X[FEATURES])[:, 1])


def fit(train: pd.DataFrame, version: str = "dev") -> RiskModel:
    weeks = np.sort(train["week_start"].unique())
    cut = weeks[-CALIB_WEEKS] if len(weeks) > CALIB_WEEKS * 3 else weeks[int(len(weeks) * 0.8)]
    fit_df, cal_df = train[train.week_start < cut], train[train.week_start >= cut]
    booster = lgb.LGBMClassifier(**PARAMS)
    booster.fit(fit_df[FEATURES], fit_df["target"])
    iso = IsotonicRegression(out_of_bounds="clip", y_min=0, y_max=1)
    iso.fit(booster.predict_proba(cal_df[FEATURES])[:, 1], cal_df["target"])
    return RiskModel(booster, iso, version)


def baseline_fit(train: pd.DataFrame):
    rate = train.groupby("cell")["target"].agg(["sum", "count"])
    prior = train["target"].mean()
    smoothed = (rate["sum"] + prior * 10) / (rate["count"] + 10)
    return lambda df: df["cell"].map(smoothed).fillna(prior).to_numpy()


def top_k_capture(df: pd.DataFrame, prob: np.ndarray, k: float = TOP_K) -> float:
    """Share of next-2-week incidents that fell in the top-k% highest-risk cells, averaged by week."""
    d = df.assign(p=prob)
    captured = total = 0.0
    for _, g in d.groupby("week_start"):
        n_top = max(1, int(len(g) * k))
        top = g.nlargest(n_top, "p")
        captured += top["n_next"].sum()
        total += g["n_next"].sum()
    return float(captured / total) if total else float("nan")


def metrics(df: pd.DataFrame, prob: np.ndarray) -> dict:
    y = df["target"].to_numpy()
    if y.sum() == 0 or y.sum() == len(y):
        return {"n": int(len(y)), "positives": int(y.sum())}
    return {
        "n": int(len(y)), "positives": int(y.sum()), "base_rate": round(float(y.mean()), 5),
        "pr_auc": round(float(average_precision_score(y, prob)), 4),
        "roc_auc": round(float(roc_auc_score(y, prob)), 4),
        "brier": round(float(brier_score_loss(y, prob)), 5),
        "top5_capture": round(top_k_capture(df, prob), 4),
    }


def evaluate(panel: pd.DataFrame) -> dict:
    labelled = panel.dropna(subset=["target"])
    weeks = np.sort(labelled["week_start"].unique())
    folds = []
    for f in range(N_FOLDS, 0, -1):
        test_start = len(weeks) - f * TEST_BLOCK
        if test_start < 104:
            continue
        # Gap of HORIZON weeks so training targets never overlap the test period.
        train = labelled[labelled.week_start < weeks[test_start - 2]]
        test = labelled[(labelled.week_start >= weeks[test_start]) &
                        (labelled.week_start < weeks[min(test_start + TEST_BLOCK, len(weeks) - 1)])]
        if test["target"].sum() == 0:
            continue
        m = fit(train)
        base = baseline_fit(train)
        folds.append({"test_start": pd.Timestamp(weeks[test_start]).date().isoformat(),
                      "model": metrics(test, m.predict(test)), "baseline": metrics(test, base(test))})
    summary = {}
    for who in ("model", "baseline"):
        for key in ("pr_auc", "roc_auc", "brier", "top5_capture"):
            vals = [f[who][key] for f in folds if key in f[who]]
            if vals:
                summary[f"{who}_{key}"] = round(float(np.mean(vals)), 4)
    return {"folds": folds, "summary": summary}


def train_and_activate(db: Session) -> ModelRun:
    grid = load_grid(db)
    panel = compute_features(grid)
    report = evaluate(panel)
    labelled = panel.dropna(subset=["target"])
    version = datetime.now(timezone.utc).strftime("lgbm-%Y%m%d-%H%M")
    model = fit(labelled, version)
    importances = sorted(zip(FEATURES, model.booster.feature_importances_.tolist()), key=lambda x: -x[1])
    report["feature_importance"] = [{"feature": f, "gain_splits": int(v)} for f, v in importances]
    path = get_settings().models_dir / f"{version}.joblib"
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, path)
    db.execute(update(ModelRun).values(active=False))
    run = ModelRun(version=version, metrics=report, feature_names=FEATURES, active=True,
                   trained_through=pd.Timestamp(labelled["week_start"].max()).to_pydatetime())
    db.add(run)
    db.commit()
    log.info("trained %s: %s", version, report["summary"])
    return run


def load_active(db: Session) -> RiskModel | None:
    from sqlalchemy import select

    run = db.scalar(select(ModelRun).where(ModelRun.active.is_(True)))
    if not run:
        return None
    path = get_settings().models_dir / f"{run.version}.joblib"
    return joblib.load(path) if path.exists() else None


def score(db: Session, backtest_weeks: int = 12) -> int:
    """Write risk scores for the current week plus the last `backtest_weeks` (for predicted-vs-actual)."""
    model = load_active(db)
    if model is None:
        raise RuntimeError("No active model; run training first")
    now = datetime.now(timezone.utc)
    grid = load_grid(db, end=now)
    t_now = len(grid.weeks) - 1
    idx = list(range(max(0, t_now - backtest_weeks), t_now + 1))
    df = compute_features(grid, idx)
    df["probability"] = model.predict(df)
    db.execute(delete(RiskScore).where(RiskScore.model_version == model.version,
                                       RiskScore.week_start >= grid.weeks[idx[0]]))
    rows = [{"cell": r.cell, "week_start": r.week_start.to_pydatetime() if hasattr(r.week_start, "to_pydatetime") else r.week_start,
             "probability": float(r.probability), "model_version": model.version}
            for r in df[["cell", "week_start", "probability"]].itertuples(index=False)]
    for i in range(0, len(rows), 5000):
        db.execute(insert(RiskScore).values(rows[i:i + 5000]).on_conflict_do_nothing())
    db.commit()
    publish("risk_scored", {"week_start": grid.weeks[t_now].isoformat(), "version": model.version})
    return len(rows)


def current_week() -> datetime:
    return week_start(datetime.now(timezone.utc))


if __name__ == "__main__":
    import json
    import sys

    from app.core.db import SessionLocal

    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        if "evaluate" in sys.argv:
            print(json.dumps(evaluate(compute_features(load_grid(db)))["summary"], indent=2))
        else:
            run = train_and_activate(db)
            print(json.dumps(run.metrics["summary"], indent=2))
            print("scored rows:", score(db))
