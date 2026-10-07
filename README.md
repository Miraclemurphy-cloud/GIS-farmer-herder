# Benue–Plateau Conflict Monitor

GIS and real-time monitoring for farmer–herder conflict in Benue and Plateau states, Nigeria.

- **Collect** incidents from community SMS, field agents, coordinate uploads (CSV / GeoJSON / KML), ACLED and NASA FIRMS satellite fire detections.
- **Map** incidents, statistically significant hotspots (Getis-Ord Gi\*) and incident clusters (HDBSCAN) on ~36 km² H3 hexagons.
- **Forecast** two-week incident risk per hexagon with a calibrated LightGBM model, validated against a historical-rate baseline.
- **Alert** subscribed community members by SMS (English, Hausa, Tiv). Rules only draft alerts; an analyst approves every send.
- **Watch** operator-registered camera feeds, satellite fires and rainfall.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/MODEL_CARD.md](docs/MODEL_CARD.md).

## Quick start (local)

Requirements: Docker Desktop, Python 3.11+, Node 20+.

```bash
cp .env.example .env            # then set JWT_SECRET, ADMIN_PASSWORD, PHONE_ENC_KEY, SMS_WEBHOOK_TOKEN
docker compose up -d            # PostGIS on :5433, Redis on :6380

cd backend
python -m venv .venv && .venv/Scripts/pip install -e ".[dev]"   # use .venv/bin on macOS/Linux
.venv/Scripts/alembic upgrade head
.venv/Scripts/python -m app.cli bootstrap    # boundaries, H3 grid, admin user, history, rainfall, hotspots, model, alerts
.venv/Scripts/uvicorn app.main:app --port 8000

# separate terminals
.venv/Scripts/python -m app.worker           # scheduled ingest, hotspots, scoring, alert rules
cd ../frontend && npm install && npm run dev # http://localhost:3000
```

The public landing page is at `/`; staff sign in at `/login` with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` and land on `/dashboard`.

### Data sources and demo mode

Without ACLED credentials, `bootstrap` generates **synthetic demo incidents** (clearly flagged in the UI and the database)
so every feature can be exercised. To use recorded events, set `ACLED_EMAIL` / `ACLED_PASSWORD`
([ACLED API access](https://acleddata.com/api-documentation/getting-started)) and run:

```bash
python -m app.cli acled hotspots train score
```

| Variable | Purpose |
| --- | --- |
| `ACLED_EMAIL`, `ACLED_PASSWORD` | Historical conflict events (OAuth password grant) |
| `FIRMS_MAP_KEY` | NASA FIRMS active fires, pulled every 3 h by the worker |
| `SMS_PROVIDER=africastalking`, `AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID` | Outbound SMS (`console` logs instead of sending) |
| `SMS_WEBHOOK_TOKEN` | Secret in the inbound SMS callback URL `/api/sms/inbound?token=…` |
| `RISK_ALERT_THRESHOLD` | 2-week probability that drafts a risk alert (default 0.05 ≈ 10× average) |

Rainfall (Open-Meteo), boundaries (geoBoundaries) and base map tiles (OpenStreetMap) need no keys.

## Tests

```bash
cd backend && .venv/Scripts/python -m pytest
```

Covers upload parsing and validation, Gi\*/HDBSCAN hotspot detection, a time-leakage guard on model features, and the alert
state machine (no send without approval).

## Repository layout

```
backend/   FastAPI app (app/api), services, ML (app/ml), ingest jobs, alerts, Alembic migrations, tests
frontend/  Next.js dashboard (app/(app)/* pages, components/, lib/)
data/seeds Benue + Plateau boundaries (geoBoundaries, CC BY 4.0)
docs/      Architecture and model card
```
