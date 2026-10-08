# Benue–Plateau Conflict Monitor: briefing

## The problem

Benue and Plateau states see the most frequent farmer–herder attacks in Nigeria. Attacks often unfold over hours in
places without internet or news coverage. Reports are scattered, and communities rarely get warned in time.

## What the system does

1. **Collect:** incident reports come in by community SMS, from field agents, through bulk coordinate uploads (CSV,
   GeoJSON, KML), from ACLED conflict records and from NASA satellite fire detections.
2. **Map:** every report becomes a point on a shared grid of 1,716 hexagons (about 36 km² each) covering all 40 LGAs.
3. **Find hotspots:** two statistical methods show where incidents bunch together, and where an area has
   significantly more incidents than average.
4. **Forecast:** a machine-learning model ranks each area's risk of an incident in the next two weeks. It is retrained
   monthly and rescored nightly.
5. **Warn:** rules draft SMS alerts in English, Hausa and Tiv, and **a human analyst approves every alert** before it
   reaches registered phones nearby.

## Tech stack

| Layer | Implementation |
| --- | --- |
| Dashboard | Next.js 15, React 19, Tailwind 4, Recharts charts, MapLibre maps |
| API | Python 3.12, FastAPI, SQLAlchemy 2 with GeoAlchemy2, Alembic migrations |
| Data | PostgreSQL 16 with PostGIS, H3 hexagon grid, Shapely geometry |
| Analytics and ML | HDBSCAN clustering, Getis-Ord Gi* hotspot statistics, LightGBM with calibration (scikit-learn) |
| Real time | Redis messaging feeding a live server-sent event stream; a scheduled background worker |
| SMS | Africa's Talking (incoming and outgoing), plus a test mode that only logs messages |
| Security | JWT logins with 4 roles, bcrypt passwords, encrypted phone numbers, an audit log |
| Deployment | Docker, Caddy (automatic HTTPS), Render, Supabase and Vercel for the demo |

## Design choices worth highlighting

- **Protect, don't profile:** the model never sees ethnicity, religion or group identity. It learns only from places,
  dates, nearby incidents, satellite fires, rainfall and season.
- **A human signs off every alert:** the software enforces this, and a test checks it.
- **Privacy:**
  - phone numbers are encrypted and shown masked;
  - texting STOP opts people out;
  - erasing a subscriber removes their contact details;
  - the public page shows only totals.
- **Honest validation:** the model is tested on months it never saw and must beat a simple "where it happened before"
  baseline.
- **Being realistic about CCTV:** rural Benue and Plateau have almost no public cameras. The real-time signals are
  satellite fire detections and community SMS; camera feeds are optional and must come with a stated permission.

## Results (on synthetic demo data)

- **Model vs baseline:** the forecast catches **49% of incidents in the 5% of areas it ranks highest**, versus **40%**
  for the baseline. Its ranking quality (ROC-AUC) is **0.88** versus 0.82.
- **Caveat:** these numbers come from synthetic data and show that the pipeline works, not real-world accuracy. They
  need re-measuring on ACLED records before any operational use.

## Quality and testing

- **Backend tests:** 16 pass, covering upload validation, hotspot statistics, a guard against the model seeing future
  data, demo-data removal, and the approval-before-send rule.
- **Browser tests:** 14 end-to-end tests pass against a production build. They cover sign-in for each role, every
  page, the full demo story, uploads, permissions and the SMS webhook.
- **Live API:** the API-level tests also pass against the hosted Render API.

## Demo setup

- **Hosting:** the API runs on Render, the database on Supabase and the dashboard on Vercel, all on free tiers.
- **Prepared data:** synthetic history, one login per role, and a scripted story. The story has a verified attack in
  Guma, a nearby satellite fire, a fresh SMS report awaiting verification, and an alert ready for approval.

## Limitations and next steps

1. **Real history:** connect ACLED so the data is real, then retrain and re-measure the model.
2. **Translations:** have native speakers review the Hausa alert text and supply Tiv.
3. **SMS:** register a real SMS short code with Africa's Talking.
4. **Hosting:** move from free hosting to a small paid server (about $5–10 a month). The free tier has no scheduled
   jobs and sleeps when idle.
5. **Finish the hosted demo:** use Vercel's public production domain and set `CORS_ORIGINS` on Render to match.
6. **Rotate secrets:** roll the Supabase service-role key and reset the database password.

## Further reading

- [ARCHITECTURE.md](ARCHITECTURE.md): system design, data model and security
- [MODEL_CARD.md](MODEL_CARD.md): forecast method, metrics and limitations
- [DEPLOYMENT.md](DEPLOYMENT.md): production setup and the free demo
