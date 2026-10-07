# Architecture

```
Next.js dashboard (React, Tailwind, Recharts, MapLibre)
      │  REST/JSON  +  SSE /api/stream (live incidents, alerts, model updates)
FastAPI  ── JWT auth, role checks (viewer < field_agent < analyst < admin), audit log
  ├── PostgreSQL 16 + PostGIS   incidents, boundaries, H3 grid, hotspots, risk scores, alerts, subscribers
  ├── Redis                     pub/sub for the live stream
  ├── Worker (APScheduler)      FIRMS every 3 h · ACLED weekly · rainfall weekly · hotspots hourly
  │                             risk scoring nightly · retrain monthly · alert rules every 15 min
  └── SMS gateway               Africa's Talking (or console) — outbound alerts, inbound reports/STOP
```

## Data model

| Table | Notes |
| --- | --- |
| `admin_areas` | Benue and Plateau states (level 1) and their 40 LGAs (level 2), MultiPolygon |
| `h3_cells` | 1 716 resolution-6 hexagons (~36 km²) with static features (distance to state/LGA borders) |
| `incidents` | Point geometry, H3 cell, LGA, type, cause, casualties, source, status, confidence, `synthetic` flag |
| `incident_status_events` | Every status transition with timestamp and user; drives "average time in stage" |
| `uploads` | Validated preview of each uploaded file and what was committed |
| `feed_events` | FIRMS fire detections and weekly rainfall per LGA |
| `hotspots` | HDBSCAN cluster hulls and Gi\* significant cells for the current window |
| `model_runs`, `risk_scores` | Model versions with backtest metrics; per cell × week probabilities |
| `subscribers` | Phone encrypted (Fernet) + salted hash for lookup; only the last 4 digits are displayed |
| `alerts`, `alert_deliveries` | draft → approved → sent / rejected; per-recipient delivery status |
| `inbound_sms`, `audit_log` | Raw inbound actions and every privileged action |

## Key flows

**Incident intake.** All writes go through `services/incidents.create_incident`, which assigns the LGA (PostGIS
`ST_Contains`), the H3 cell, the initial status event, and publishes a live event. Uploads are validated against the
real state polygons (not just a bounding box) and checked for duplicates within 500 m / 24 h before the user commits.

**Inbound SMS.** `REPORT <text>` (Hausa `RAHOTO`) creates a low-confidence `reported` incident located at an LGA named
in the text or the sender's registered location. `STOP` / `TSAYA` / `DAINA` opt out; `JOIN` opts back in.
The callback URL carries a shared secret.

**Hotspots.** HDBSCAN (haversine) outlines incident clusters; Getis-Ord Gi\* with k-ring-1 binary weights over the full
grid flags cells at 90 / 95 / 99 % confidence.

**Alerts.** `alerts/service.run_rules` drafts alerts for (1) LGAs containing cells above the risk threshold, (2) verified
violent incidents in the last 48 h, (3) satellite fires within 10 km of incidents in the last 30 days. Drafts are
deduplicated. Only an analyst can approve; only an approved alert can be sent (enforced in the service and tested).
Messages name an area and an action, never precise coordinates.

## Security and privacy

- Role-based access on every endpoint except `/api/public/summary`, which the landing page uses and which returns only
  aggregate counts (no coordinates, risk cells or personal data). Subscriber data is analyst-only; camera registration is admin-only.
- Subscriber phones encrypted at rest; erase removes contact details while keeping delivery counts (NDPA 2023).
- Camera feeds must be HTTPS and carry a source/permission note; the system does not scan for or ingest unsecured cameras.
- Every login, status change, upload, alert action and subscriber change is written to `audit_log`.

## Design decisions

- **H3 resolution 6** rather than 7: ACLED locations are often town- or LGA-level, and resolution 7 would make the
  cell × week panel ~7× larger without adding real spatial precision.
- **Absolute risk threshold 0.05**: calibrated probabilities are small because any one cell rarely sees an incident in a
  fortnight (~0.5 % base rate); 0.05 is about ten times the average.
- **Camera feeds are pluggable, not assumed**: public CCTV coverage in rural Benue and Plateau is negligible, so satellite
  fires and community SMS are the primary real-time signals.
