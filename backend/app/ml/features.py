"""Cell × week feature panel for attack-risk prediction.

Every feature for week t uses only data from weeks < t (plus static geography and
calendar), so a prediction made at the start of week t is computable in real time.
Deliberately excluded: any ethnic, religious or group-identity attribute.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import h3
import numpy as np
import pandas as pd
from scipy import sparse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import FeedEvent, H3Cell, Incident, IncidentStatus

HORIZON_WEEKS = 2  # target: ≥1 incident in weeks t or t+1
MAX_GAP = 260

FEATURES = [
    "lag1", "sum4", "sum12", "sum52", "fat12", "weeks_since_last",
    "nbr1_sum4", "nbr1_sum12", "nbr2_sum12", "nbr1_sum52",
    "fires1", "fires4", "nbr1_fires1", "precip4", "precip_anom4",
    "month", "dry_season", "woy_sin", "woy_cos",
    "lat", "lon", "dist_state_border_km", "dist_lga_border_km", "is_benue",
]


def week_start(d: datetime) -> datetime:
    d = d.astimezone(timezone.utc)
    return (d - timedelta(days=d.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)


@dataclass
class Grid:
    cells: list[str]
    weeks: list[datetime]           # consecutive Mondays
    counts: np.ndarray              # (n_cells, n_weeks) incidents
    fatalities: np.ndarray          # (n_cells, n_weeks)
    fires: np.ndarray               # (n_cells, n_weeks)
    precip: np.ndarray              # (n_cells, n_weeks) mm, NaN if unknown
    static: pd.DataFrame            # index=cell


def adjacency(cells: list[str], ring: int) -> sparse.csr_matrix:
    """Binary matrix A[i, j] = 1 if j is exactly `ring` steps from i."""
    idx = {c: i for i, c in enumerate(cells)}
    rows, cols = [], []
    for c, i in idx.items():
        for j in h3.grid_ring(c, ring):
            if j in idx:
                rows.append(i)
                cols.append(idx[j])
    return sparse.csr_matrix((np.ones(len(rows)), (rows, cols)), shape=(len(cells), len(cells)))


def _rolling(m: np.ndarray, w: int) -> np.ndarray:
    """out[:, t] = sum of m[:, t-w : t] (strictly before t)."""
    cs = np.concatenate([np.zeros((m.shape[0], 1)), np.cumsum(m, axis=1)], axis=1)
    t = np.arange(m.shape[1])
    lo = np.clip(t - w, 0, None)
    return cs[:, t] - cs[:, lo]


def compute_features(g: Grid, week_idx: list[int] | None = None) -> pd.DataFrame:
    n_c, n_w = g.counts.shape
    A1, A2 = adjacency(g.cells, 1), adjacency(g.cells, 2)
    C = g.counts.astype(float)

    sum4, sum12, sum52 = _rolling(C, 4), _rolling(C, 12), _rolling(C, 52)
    lag1 = _rolling(C, 1)
    fat12 = _rolling(g.fatalities.astype(float), 12)
    fires1, fires4 = _rolling(g.fires.astype(float), 1), _rolling(g.fires.astype(float), 4)

    # weeks since last incident, using only weeks < t
    since = np.full((n_c, n_w), MAX_GAP, dtype=float)
    last = np.full(n_c, -MAX_GAP * 10)
    for t in range(n_w):
        since[:, t] = np.minimum(t - last, MAX_GAP)
        last = np.where(C[:, t] > 0, t, last)

    precip = np.nan_to_num(g.precip, nan=0.0)
    precip4 = _rolling(precip, 4)
    woy = np.array([w.isocalendar().week for w in g.weeks])
    clim = np.zeros_like(precip4)
    for k in np.unique(woy):  # climatology per cell & week-of-year
        cols = woy == k
        clim[:, cols] = precip4[:, cols].mean(axis=1, keepdims=True)
    precip_anom4 = precip4 - clim

    week_idx = list(range(n_w)) if week_idx is None else week_idx
    frames = []
    for t in week_idx:
        w = g.weeks[t]
        f = pd.DataFrame({
            "cell": g.cells, "week_start": w,
            "lag1": lag1[:, t], "sum4": sum4[:, t], "sum12": sum12[:, t], "sum52": sum52[:, t],
            "fat12": fat12[:, t], "weeks_since_last": since[:, t],
            "nbr1_sum4": A1 @ sum4[:, t], "nbr1_sum12": A1 @ sum12[:, t],
            "nbr2_sum12": A2 @ sum12[:, t], "nbr1_sum52": A1 @ sum52[:, t],
            "fires1": fires1[:, t], "fires4": fires4[:, t], "nbr1_fires1": A1 @ fires1[:, t],
            "precip4": precip4[:, t], "precip_anom4": precip_anom4[:, t],
            "month": w.month, "dry_season": int(w.month in (11, 12, 1, 2, 3, 4)),
            "woy_sin": np.sin(2 * np.pi * woy[t] / 52), "woy_cos": np.cos(2 * np.pi * woy[t] / 52),
        })
        if t + HORIZON_WEEKS <= n_w:
            f["target"] = (C[:, t:t + HORIZON_WEEKS].sum(axis=1) > 0).astype(int)
            f["n_next"] = C[:, t:t + HORIZON_WEEKS].sum(axis=1)
        else:
            f["target"] = np.nan
            f["n_next"] = np.nan
        frames.append(f)
    df = pd.concat(frames, ignore_index=True)
    return df.join(g.static, on="cell")


def load_grid(db: Session, start: datetime | None = None, end: datetime | None = None) -> Grid:
    cell_rows = db.execute(select(H3Cell.cell, H3Cell.lat, H3Cell.lon, H3Cell.state,
                                  H3Cell.dist_state_border_km, H3Cell.dist_lga_border_km, H3Cell.lga_id)
                           .order_by(H3Cell.cell)).all()
    cells = [r.cell for r in cell_rows]
    idx = {c: i for i, c in enumerate(cells)}
    static = pd.DataFrame({
        "lat": [r.lat for r in cell_rows], "lon": [r.lon for r in cell_rows],
        "dist_state_border_km": [r.dist_state_border_km or 0 for r in cell_rows],
        "dist_lga_border_km": [r.dist_lga_border_km or 0 for r in cell_rows],
        "is_benue": [int(r.state == "Benue") for r in cell_rows],
    }, index=pd.Index(cells, name="cell"))

    inc = db.execute(select(Incident.h3_cell, Incident.occurred_at, Incident.fatalities)
                     .where(Incident.status != IncidentStatus.dismissed)).all()
    first = min((r.occurred_at for r in inc), default=datetime.now(timezone.utc) - timedelta(days=365))
    start = week_start(start or first)
    end = week_start(end or datetime.now(timezone.utc))
    weeks = []
    w = start
    while w <= end:
        weeks.append(w)
        w += timedelta(days=7)
    widx = {w: i for i, w in enumerate(weeks)}

    shape = (len(cells), len(weeks))
    counts, fat, fires = np.zeros(shape), np.zeros(shape), np.zeros(shape)
    precip = np.full(shape, np.nan)
    for r in inc:
        i, t = idx.get(r.h3_cell), widx.get(week_start(r.occurred_at))
        if i is not None and t is not None:
            counts[i, t] += 1
            fat[i, t] += r.fatalities
    for r in db.execute(select(FeedEvent.h3_cell, FeedEvent.observed_at).where(FeedEvent.kind == "fire")):
        i, t = idx.get(r.h3_cell), widx.get(week_start(r.observed_at))
        if i is not None and t is not None:
            fires[i, t] += 1

    # Weekly LGA rainfall → every cell in that LGA (state mean for cells without an LGA).
    cell_lga = np.array([r.lga_id or -1 for r in cell_rows])
    lga_week: dict[tuple[int, int], float] = {}
    for r in db.execute(select(FeedEvent.observed_at, FeedEvent.value, FeedEvent.data).where(FeedEvent.kind == "weather")):
        t = widx.get(week_start(r.observed_at))
        if t is not None:
            lga_week[(r.data.get("lga_id"), t)] = r.value
    if lga_week:
        for (lga, t), v in lga_week.items():
            precip[cell_lga == lga, t] = v
        known = ~np.isnan(precip)
        col_mean = np.where(known, precip, 0).sum(axis=0) / np.maximum(known.sum(axis=0), 1)
        precip = np.where(known, precip, col_mean[None, :])
    return Grid(cells, weeks, counts, fat, fires, precip, static)
