"""Geo constants and helpers shared across the app."""
import h3
from shapely.geometry import Polygon

H3_RES = 6  # ~36 km² hexes; matches ACLED location precision and keeps cell×week panel tractable
# Generous bbox around Benue + Plateau; exact containment uses the state polygons.
STUDY_BBOX = (6.9, 6.3, 10.2, 10.6)  # min_lon, min_lat, max_lon, max_lat
STATES = ("Benue", "Plateau")


def in_bbox(lon: float, lat: float) -> bool:
    x0, y0, x1, y1 = STUDY_BBOX
    return x0 <= lon <= x1 and y0 <= lat <= y1


def cell_of(lat: float, lon: float, res: int = H3_RES) -> str:
    return h3.latlng_to_cell(lat, lon, res)


def cell_polygon(cell: str) -> Polygon:
    # h3 returns (lat, lng); shapely wants (x=lng, y=lat)
    return Polygon([(lng, lat) for lat, lng in h3.cell_to_boundary(cell)])


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    return h3.great_circle_distance((lat1, lon1), (lat2, lon2), unit="km")
