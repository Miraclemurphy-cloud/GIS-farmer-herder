from datetime import datetime, timezone

import pytest

from app.services.uploads import parse_date, read_records, validate

KML = b"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<Placemark><name>Yelwata</name><TimeStamp><when>2025-06-14</when></TimeStamp>
<ExtendedData><Data name="fatalities"><value>12</value></Data></ExtendedData>
<Point><coordinates>8.66,7.83,0</coordinates></Point></Placemark>
</Document></kml>"""


def test_csv_aliases_and_dates():
    fmt, recs = read_records("x.csv", b"latitude,longitude,date,deaths\n7.7,8.5,14/06/2025,3\n")
    assert fmt == "csv" and recs[0]["latitude"] == "7.7"
    assert parse_date("14/06/2025") == datetime(2025, 6, 14, tzinfo=timezone.utc)
    assert parse_date("2025-06-14T10:00:00Z").hour == 10


def test_geojson_and_kml():
    _, g = read_records("x.geojson", b'{"type":"FeatureCollection","features":[{"type":"Feature",'
                                     b'"geometry":{"type":"Point","coordinates":[8.5,7.7]},"properties":{"date":"2025-01-01"}}]}')
    assert g[0]["lon"] == 8.5 and g[0]["lat"] == 7.7
    _, k = read_records("x.kml", KML)
    assert k[0]["lat"] == "7.83" and k[0]["date"] == "2025-06-14" and k[0]["fatalities"] == "12"


def test_unsupported_type():
    with pytest.raises(ValueError):
        read_records("x.xlsx", b"")


def test_validate_rejects_outside_and_swapped(db):
    rows, errors = validate(db, [
        {"lat": "7.75", "lon": "8.55", "date": "2025-01-01", "fatalities": "2"},   # Benue (Guma area)
        {"lat": "6.45", "lon": "3.39", "date": "2025-01-01"},                        # Lagos
        {"lat": "8.55", "lon": "7.75", "date": "2025-01-01"},                        # swapped → outside states
        {"lat": "7.75", "lon": "8.55", "date": "2999-01-01"},                        # future
        {"lat": "x", "lon": "8.5", "date": "2025-01-01"},
    ])
    assert rows[0]["valid"] and rows[0]["state"] == "Benue"
    assert [r["valid"] for r in rows[1:]] == [False, False, False, False]
    assert len(errors) == 4
