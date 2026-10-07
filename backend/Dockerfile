# API and worker image. Build from the repository root:
#   docker build -f backend/Dockerfile -t gis-monitor-backend .
# The app resolves data/ and models/ relative to the repo root, so the image mirrors that layout under /srv.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# libgomp1: OpenMP runtime required by LightGBM
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/backend

COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip install .

COPY backend/alembic.ini ./
COPY backend/alembic ./alembic
COPY data/seeds /srv/data/seeds

RUN useradd --system --uid 10001 --home /srv app \
    && mkdir -p /srv/models /srv/data/cache \
    && chown -R app /srv/models /srv/data
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers", "--forwarded-allow-ips", "*"]
