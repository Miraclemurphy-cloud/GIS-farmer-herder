import h3
import numpy as np

from app.services.hotspots import cluster_incidents, getis_ord_gi_star


def test_gi_star_flags_planted_cluster():
    center = h3.latlng_to_cell(7.7, 8.5, 6)
    cells = list(h3.grid_disk(center, 8))
    counts = {c: 1.0 for c in h3.grid_disk(center, 1)}  # 7 hot cells, rest 0
    z = getis_ord_gi_star(counts, cells)
    assert z[center] > 2.58
    far = next(c for c in cells if h3.grid_distance(c, center) == 8)
    assert z[far] < 1.0


def test_gi_star_uniform_is_flat():
    cells = list(h3.grid_disk(h3.latlng_to_cell(9.0, 9.0, 6), 3))
    assert all(v == 0.0 for v in getis_ord_gi_star({c: 2.0 for c in cells}, cells).values())


def test_hdbscan_finds_two_groups():
    rng = np.random.default_rng(0)
    a = rng.normal([7.7, 8.5], 0.01, (20, 2))
    b = rng.normal([9.3, 8.9], 0.01, (20, 2))
    noise = rng.uniform([6.5, 7.5], [10, 10], (5, 2))
    labels = cluster_incidents(np.vstack([a, b, noise]))
    assert len(set(labels[:20]) - {-1}) == 1 and len(set(labels[20:40]) - {-1}) == 1
    assert labels[0] != labels[20]
