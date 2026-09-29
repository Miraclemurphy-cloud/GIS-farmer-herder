"""Load Benue + Plateau state/LGA boundaries and build the H3 analysis grid.

Source: geoBoundaries gbOpen NGA ADM1/ADM2 (CC BY 4.0). The national files are
trimmed to the two study states by `prepare_seed()` and committed as
data/seeds/benue_plateau.geojson so the app needs no network to bootstrap.
"""
import json

import h3
from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPolygon, Point, mapping, shape
from shapely.ops import unary_union
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.geo import H3_RES, STATES, cell_polygon
from app.models import AdminArea, H3Cell

GEOBOUNDARIES = "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/NGA/{lvl}/geoBoundaries-NGA-{lvl}_simplified.geojson"
KM_PER_DEG = 110.0  # adequate at ~7-10°N for feature distances


def seed_path():
    return get_settings().data_dir / "seeds" / "benue_plateau.geojson"


def _as_multi(geom):
    return geom if isinstance(geom, MultiPolygon) else MultiPolygon([geom])


def prepare_seed() -> None:
    """Trim national ADM1/ADM2 files to the study states (downloads if missing)."""
    import httpx

    seeds = get_settings().data_dir / "seeds"
    raw = {}
    for lvl in ("ADM1", "ADM2"):
        p = seeds / f"NGA-{lvl}.geojson"
        if not p.exists():
            r = httpx.get(GEOBOUNDARIES.format(lvl=lvl), follow_redirects=True, timeout=180)
            r.raise_for_status()
            p.write_bytes(r.content)
        raw[lvl] = json.loads(p.read_text(encoding="utf-8"))

    states = {f["properties"]["shapeName"]: shape(f["geometry"]) for f in raw["ADM1"]["features"]
              if f["properties"]["shapeName"] in STATES}
    features = [{"type": "Feature", "properties": {"level": 1, "state": n, "name": n}, "geometry": mapping(g)}
                for n, g in states.items()]
    for f in raw["ADM2"]["features"]:
        g = shape(f["geometry"])
        rp = g.representative_point()
        for n, sg in states.items():
            if sg.contains(rp):
                features.append({"type": "Feature",
                                 "properties": {"level": 2, "state": n, "name": f["properties"]["shapeName"]},
                                 "geometry": mapping(g)})
    seed_path().write_text(json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf-8")


def load_boundaries(db: Session) -> int:
    fc = json.loads(seed_path().read_text(encoding="utf-8"))
    db.execute(delete(H3Cell))
    db.execute(delete(AdminArea))
    for f in fc["features"]:
        p = f["properties"]
        db.add(AdminArea(name=p["name"], level=p["level"], state=p["state"],
                         geom=from_shape(_as_multi(shape(f["geometry"])), srid=4326)))
    db.commit()
    return len(fc["features"])


def build_grid(db: Session) -> int:
    fc = json.loads(seed_path().read_text(encoding="utf-8"))
    states = {f["properties"]["state"]: shape(f["geometry"]) for f in fc["features"] if f["properties"]["level"] == 1}
    lga_ids = {(a.state, a.name): a.id for a in db.scalars(select(AdminArea).where(AdminArea.level == 2))}
    lgas = [(lga_ids[(f["properties"]["state"], f["properties"]["name"])], shape(f["geometry"]))
            for f in fc["features"] if f["properties"]["level"] == 2]
    lga_borders = unary_union([g.boundary for _, g in lgas])

    db.execute(delete(H3Cell))
    n = 0
    for state, geom in states.items():
        cells = h3.geo_to_cells(geom.__geo_interface__, H3_RES)
        border = geom.boundary
        for c in cells:
            lat, lon = h3.cell_to_latlng(c)
            pt = Point(lon, lat)
            lga_id = next((i for i, g in lgas if g.contains(pt)), None)
            db.add(H3Cell(
                cell=c, state=state, lga_id=lga_id, lat=lat, lon=lon,
                geom=from_shape(cell_polygon(c), srid=4326),
                dist_state_border_km=border.distance(pt) * KM_PER_DEG,
                dist_lga_border_km=lga_borders.distance(pt) * KM_PER_DEG,
            ))
            n += 1
    db.commit()
    return n
