import pytest

from app.core.config import Settings


@pytest.mark.parametrize("given, expected", [
    ("postgres://u:p@h/db?sslmode=require", "postgresql+psycopg://u:p@h/db?sslmode=require"),
    ("postgresql://u:p@h:5432/db", "postgresql+psycopg://u:p@h:5432/db"),
    ("postgresql+psycopg://u:p@h/db", "postgresql+psycopg://u:p@h/db"),
])
def test_database_url_uses_psycopg_driver(given, expected):
    assert Settings(database_url=given).database_url == expected
