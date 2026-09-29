"""The model must only see the past: features for week t may not depend on weeks >= t."""
from datetime import datetime, timedelta, timezone

import h3
import numpy as np
import pandas as pd

from app.ml.features import FEATURES, Grid, compute_features


def make_grid(seed=0, n_weeks=80):
    center = h3.latlng_to_cell(7.7, 8.5, 6)
    cells = sorted(h3.grid_disk(center, 3))
    rng = np.random.default_rng(seed)
    shape = (len(cells), n_weeks)
    weeks = [datetime(2024, 1, 1, tzinfo=timezone.utc) + timedelta(weeks=i) for i in range(n_weeks)]
    static = pd.DataFrame({"lat": 7.7, "lon": 8.5, "dist_state_border_km": 1.0, "dist_lga_border_km": 1.0,
                           "is_benue": 1}, index=pd.Index(cells, name="cell"))
    return Grid(cells, weeks, rng.poisson(0.2, shape).astype(float), rng.poisson(0.5, shape).astype(float),
                rng.poisson(0.3, shape).astype(float), np.zeros(shape), static)


def test_no_future_leakage():
    g1 = make_grid()
    g2 = make_grid()
    t = 60
    # Perturb everything from week t onward in the second grid.
    g2.counts[:, t:] = 99
    g2.fatalities[:, t:] = 99
    g2.fires[:, t:] = 99
    f1 = compute_features(g1, [t]).set_index("cell")
    f2 = compute_features(g2, [t]).set_index("cell")
    leaky = [c for c in FEATURES if c != "precip_anom4" and not np.allclose(f1[c], f2[c])]
    assert leaky == [], f"features depend on the future: {leaky}"
    assert not np.allclose(f1["target"], f2["target"])  # the target *should* change


def test_target_is_next_two_weeks():
    g = make_grid()
    g.counts[:] = 0
    g.counts[0, 11] = 1
    f = compute_features(g, [10, 11, 12]).set_index(["week_start", "cell"])
    c = g.cells[0]
    assert f.loc[(g.weeks[10], c), "target"] == 1   # week 11 is inside [10, 12)
    assert f.loc[(g.weeks[11], c), "target"] == 1
    assert f.loc[(g.weeks[12], c), "target"] == 0
    assert f.loc[(g.weeks[12], c), "lag1"] == 1     # and it shows up as history afterwards
