import pytest
from sqlalchemy import text

from app.core.db import engine


@pytest.fixture
def db():
    """Session bound to an outer transaction that is rolled back after each test."""
    from sqlalchemy.orm import Session

    conn = engine.connect()
    trans = conn.begin()
    session = Session(bind=conn, join_transaction_mode="create_savepoint")
    try:
        conn.execute(text("SELECT 1"))
    except Exception:  # pragma: no cover
        pytest.skip("database not available")
    yield session
    session.close()
    trans.rollback()
    conn.close()
