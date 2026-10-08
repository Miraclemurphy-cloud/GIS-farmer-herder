# Deploying the backend

This guide puts the backend into production on a single Linux server using Docker Compose. A single server is the
recommended starting point: it runs PostGIS, Redis, the API, the scheduled worker and an HTTPS proxy together, costs
little, and is easy to back up. A section at the end covers managed platforms.

## What runs in production

| Service | What it does | Instances |
| --- | --- | --- |
| `db` | PostgreSQL 16 + PostGIS. All application data. | 1 |
| `redis` | Pub/sub for the live dashboard stream. Holds nothing that needs saving. | 1 |
| `api` | FastAPI on uvicorn (2 processes). Serves `/api/*`. | 1 or more |
| `worker` | Scheduled jobs: FIRMS every 3 h, ACLED weekly, rainfall weekly, hotspots hourly, risk scoring nightly, retraining monthly, alert rules every 15 min. | **Exactly 1.** A second copy would run every job twice. |
| `caddy` | Public entry point. Gets and renews the HTTPS certificate automatically and proxies to the API. | 1 |

Only Caddy is exposed to the internet (ports 80 and 443). The database and Redis are reachable only inside the
Docker network.

Files used: [`backend/Dockerfile`](../backend/Dockerfile), [`deploy/docker-compose.prod.yml`](../deploy/docker-compose.prod.yml),
[`deploy/Caddyfile`](../deploy/Caddyfile) and your `.env`.

## Before you start

- **A server**: Ubuntu 24.04, 2 vCPU, 4 GB RAM, 40 GB SSD. Model training needs about 2 GB of memory for a few minutes each
  month. Choose a provider and region you can pay for reliably; latency matters little here.
- **A domain name** for the API, for example `api.example.org`.
- **An ACLED account** (email and password) for real historical events. Without it, the system has no real history to
  learn from.
- Optional: a **NASA FIRMS map key** for satellite fires, and an **Africa's Talking** account for SMS.

## 1. Prepare the server

Log in as a user with `sudo`, then:

```bash
sudo apt update && sudo apt upgrade -y
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
sudo ufw enable
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # then log out and back in
```

Stop Docker logs from filling the disk by creating `/etc/docker/daemon.json`:

```json
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }
```

```bash
sudo systemctl restart docker
```

## 2. Point the domain at the server

Create a DNS **A record** for your API domain (e.g. `api.example.org`) pointing at the server's public IP. Wait until
`dig +short api.example.org` returns that IP. Caddy cannot get a certificate until it does.

## 3. Get the code

```bash
git clone https://github.com/Miraclemurphy-cloud/GIS-farmer-herder.git
cd GIS-farmer-herder
```

All later commands run from this folder. To keep them short, define:

```bash
alias dc="docker compose -f deploy/docker-compose.prod.yml --env-file .env"
```

## 4. Configure `.env`

```bash
cp .env.example .env
chmod 600 .env
```

Generate the secrets:

```bash
echo "JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
echo "PHONE_ENC_KEY=$(openssl rand -base64 32 | tr '+/' '-_')"
echo "SMS_WEBHOOK_TOKEN=$(openssl rand -hex 24)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
echo "ADMIN_PASSWORD=$(openssl rand -base64 18)"
```

Edit `.env` and set at least:

| Variable | Value |
| --- | --- |
| `API_DOMAIN` | `api.example.org` |
| `POSTGRES_PASSWORD` | generated above (hex, so it is safe inside the database URL) |
| `JWT_SECRET`, `PHONE_ENC_KEY`, `SMS_WEBHOOK_TOKEN` | generated above |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | the first administrator's login |
| `CORS_ORIGINS` | the dashboard's exact URL, e.g. `https://monitor.example.org` (comma-separate several) |
| `ACLED_EMAIL`, `ACLED_PASSWORD` | your ACLED account |
| `FIRMS_MAP_KEY` | optional |
| `SMS_PROVIDER` | leave as `console` until step 9 |

You do not need to change `DATABASE_URL` or `REDIS_URL`; the compose file sets the production values.

> **Back up `.env` now** in a password manager. Two values can never be changed or lost once you have subscribers:
> - `PHONE_ENC_KEY` encrypts phone numbers. Losing it makes every stored number unreadable.
> - `JWT_SECRET` also salts the phone-number lookup used for STOP/JOIN replies. Changing it signs everyone out **and**
>   stops the system from recognising existing subscribers' replies.

## 5. Build and start the database

```bash
dc build
dc up -d db redis
dc run --rm api alembic upgrade head
```

## 6. Load reference data and real history

```bash
dc run --rm api python -m app.cli boundaries admin acled weather hotspots train score
```

What each step does:
- `boundaries`: the state and LGA boundaries, plus the 1,716-cell H3 grid.
- `admin`: creates the first administrator.
- `acled`: imports historical events (several minutes).
- `weather`: imports rainfall back to 2018.
- `hotspots`, `train`, `score`: compute hotspots, train the model (5–10 minutes) and write this week's forecast.

Check the model output at the end. The forecast is only worth using if `model_top5_capture` is clearly higher than
`baseline_top5_capture`. Record the numbers in `docs/MODEL_CARD.md`.

> Do **not** run `python -m app.cli bootstrap` in production without ACLED credentials. It would fill the database
> with synthetic demo incidents and 120 fake subscribers. The command refuses to do this once a real SMS provider is
> configured. If demo data did get in, remove it with `dc run --rm api python -m app.cli purge-demo`, then run step 6.

## 7. Start everything

```bash
dc up -d
dc ps
```

`api` shows `health: starting` for up to a minute while the scientific libraries load, then `healthy`. Verify:

```bash
curl https://api.example.org/api/health            # {"ok":true}
curl https://api.example.org/api/public/summary    # aggregate counts, "synthetic_data": false
dc logs worker | grep "worker started"
```

Sign in to the dashboard as the administrator. Then go to **Settings → Add team member** and create named accounts for
analysts and field agents, rather than sharing the admin login.

## 8. Connect the frontend

Build the Next.js dashboard with the API address baked in:

```bash
NEXT_PUBLIC_API_URL=https://api.example.org npm run build
```

Host it anywhere that runs Next.js (for example Vercel, or `npm run start` behind a second Caddy site). Its URL must
be listed in `CORS_ORIGINS`; after changing that variable, run `dc up -d api`.

## 9. Turn on SMS

1. In Africa's Talking, create an API key and request a sender ID. Test in the **sandbox** first (`AT_USERNAME=sandbox`).
2. Set the SMS variables in `.env`, then restart with `dc up -d api worker`:
   ```
   SMS_PROVIDER=africastalking
   AT_USERNAME=...
   AT_API_KEY=...
   AT_SENDER_ID=...
   ```
3. Set the **incoming messages callback URL** to:
   ```
   https://api.example.org/api/sms/inbound?token=<SMS_WEBHOOK_TOKEN>
   ```
4. Test both directions:
   - Add your own number on the Communities page, then approve and send a test alert to a small radius around you.
   - Text `REPORT <your LGA> test` and confirm a new reported incident appears on the dashboard.

Sending is throttled to `SMS_RATE_PER_MINUTE` (default 60). A large alert therefore takes several minutes to go out,
and it runs inside the API process, so avoid restarting the API mid-send.

## Updating

```bash
git pull
dc build
dc run --rm api alembic upgrade head
dc up -d
```

The API is unavailable for about 30–60 seconds while the new container starts. Deploy outside busy hours.

## Backups

The database is the only thing that must be backed up, plus `.env` (step 4). Trained models can be regenerated
with `train score`.

Nightly backup with 14 days kept, via `crontab -e`:

```cron
15 2 * * * cd $HOME/GIS-farmer-herder && mkdir -p backups && docker compose -f deploy/docker-compose.prod.yml --env-file .env exec -T db pg_dump -U gis -Fc gis > backups/gis-$(date +\%F).dump && find backups -name '*.dump' -mtime +14 -delete
```

Copy `backups/` to storage off the server (for example with `rclone` to object storage). A backup that only lives on
the same disk does not survive losing the server.

To restore, test this on a spare server first:

```bash
dc up -d db
dc exec -T db pg_restore -U gis -d gis --clean --if-exists < backups/gis-YYYY-MM-DD.dump
dc up -d
```

## Monitoring

- Point an uptime monitor (UptimeRobot, Better Stack, etc.) at `https://api.example.org/api/health`.
- `dc logs -f api` and `dc logs -f worker` show requests and job runs. A failed job is logged as `job <name> failed`
  with a traceback.
- Check `df -h` monthly. Database growth is small (well under 1 GB per year at current volumes).

## Security checklist

- [ ] `.env` is `chmod 600`, never committed, and backed up somewhere private.
- [ ] `ADMIN_PASSWORD` was generated, not typed, and each person has their own account.
- [ ] Only ports 22, 80 and 443 are open (`sudo ufw status`). Use SSH keys, and disable password SSH login.
- [ ] `CORS_ORIGINS` lists only your real dashboard URL(s).
- [ ] The SMS callback URL contains `SMS_WEBHOOK_TOKEN`. Requests without the token are rejected (403).
- [ ] `dc run --rm api python -m app.cli purge-demo` has been run if demo data was ever loaded.
- [ ] Monthly security updates: `sudo apt upgrade`, then `dc pull db redis caddy && dc build --pull && dc up -d`.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Caddy logs certificate errors | DNS does not point at this server yet, or ports 80/443 are blocked. |
| `502` right after a deploy | The API is still starting (up to 60 s). Wait for `dc ps` to show `healthy`. |
| Dashboard shows CORS errors | The dashboard's URL is missing from `CORS_ORIGINS`, or `api` was not restarted after editing it. |
| Live feed says "offline" | A proxy or CDN in front of Caddy is buffering `/api/stream`. Disable buffering for that path. |
| Forecast never updates | The worker is not running (`dc ps worker`), or there is no active model: run `train score`. |
| `train` is killed | The server ran out of memory. Use 4 GB+ RAM or add swap. |
| Subscribers' STOP replies are ignored | `JWT_SECRET` was changed after they subscribed (see step 4). |

## Free demo on Render

For showing the system to partners or reviewers, the API can run at no cost on Render's free tier, using
[`render.yaml`](../render.yaml). **This is a demo only.** On the free tier:
- there is no background worker, so nothing updates on its own;
- the API sleeps after 15 minutes without visitors and takes 1–2 minutes to wake;
- the server's disk is wiped on every restart.

Never connect a real SMS provider to it.

How it fits together:
- **Database:** a free Postgres with PostGIS from a provider whose free tier does not expire: Supabase or Neon.
- **Data loading:** done once from your own computer, because free Render services cannot run one-off commands.
- **Forecasts and hotspots:** stored in the database, so the API serves them without the model file.

### 1. Create the database

**Supabase:** create a free project in **Central EU (Frankfurt)**, the same region as the Render service. Then open
**Connect** and copy the **Session pooler** connection string. It looks like
`postgresql://postgres.<project-ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`.
- Do **not** use the "Direct connection" string. On the free plan it is IPv6-only, and Render cannot reach IPv6
  addresses.
- Do **not** use the "Transaction pooler" (port 6543) either; it is not compatible with the database driver's
  prepared statements.
- Supabase pauses free projects after a week without activity; open its dashboard to resume one before a demo.

**Neon (alternative):** create a project in a European region and copy its connection string.

You do not need to change the `postgresql://` prefix. PostGIS is switched on automatically by the first migration.

### 2. Fill in `.env.demo`

```bash
cp .env.demo.example .env.demo
```

Fill in `.env.demo` at the repository root:
- the connection string from step 1;
- two secrets generated with the commands inside the file;
- an admin email and password.

The file is git-ignored. Keep a copy in a password manager: Render needs the **same** `JWT_SECRET` and `PHONE_ENC_KEY`,
or it cannot read the demo subscribers' numbers.

### 3. Load the demo data from your computer

From the repository, in a terminal (Git Bash on Windows):

```bash
cd backend
set -a; . ../.env.demo; set +a              # applies .env.demo to this terminal only
.venv/Scripts/alembic upgrade head          # use .venv/bin/... on macOS/Linux
.venv/Scripts/python -m app.cli demo        # about 10 minutes
```

`demo` does the following:
- loads the boundaries, synthetic history, 120 demo subscribers (reserved test numbers) and rainfall;
- trains the model;
- creates one login per role and writes their passwords to `demo-credentials.txt` (git-ignored);
- stages the demo story described below.

### 4. Deploy the API

1. Push the repository to GitHub (already done for this project).
2. In Render, choose **New → Blueprint** and select the repository. Render reads `render.yaml` and proposes a free
   web service `gis-monitor-api` and a free Key Value instance.
3. Fill in the values it asks for:
   - `DATABASE_URL`: the connection string from step 1;
   - `JWT_SECRET` and `PHONE_ENC_KEY`: the same values as in `.env.demo`;
   - `CORS_ORIGINS`: your dashboard's URL. Use a placeholder for now and update it after step 5.
4. Click **Apply**. The first build takes 5–10 minutes. Then open
   `https://<service-name>.onrender.com/api/health`, which should return `{"ok":true}`.

### 5. Deploy the dashboard

Import the same repository on [Vercel](https://vercel.com) (free). Set **Root Directory** to `frontend` and add the
environment variable `NEXT_PUBLIC_API_URL=https://<service-name>.onrender.com`. Once Vercel gives you a URL, set it as
`CORS_ORIGINS` on the Render service. Render redeploys automatically. Sign in with any login from
`demo-credentials.txt`.

### The demo story

`python -m app.cli demo-scenario` stages events relative to the current time, so the demo always looks current:
- **Guma (Benue):**
  - an attack verified yesterday (4 killed, 300 displaced);
  - a satellite fire detected near it;
  - a community SMS report from 95 minutes ago, still waiting for verification.
- **Bokkos (Plateau):** cattle rustling three days ago, with a patrol already deployed.

It then refreshes hotspots and forecasts, and drafts alerts for an analyst to approve. A suggested walkthrough:
1. **Landing page:** show the live stats and the dashboard preview.
2. **Dashboard:** sign in as the analyst and show the pipeline, the sources and the live map.
3. **Incidents:** open the Guma SMS report, add a note and mark it verified.
4. **Alerts:** review the Guma alert in English and Hausa, check the target area, then approve and send it. On the
   demo, messages are only logged.
5. **Predictions:** show the forecast and how it compares with the baseline.
6. **Uploads:** as the field agent, upload a CSV and show the row checks.
7. **Permissions:** sign in as the viewer to show what is hidden.

Re-run it before each presentation; it also clears earlier alerts:

```bash
cd backend && set -a; . ../.env.demo; set +a
.venv/Scripts/python -m app.cli demo-scenario
```

Open the API URL a couple of minutes before you present, so it has woken up. The first request after a quiet
period is slow.

### 6. Run the end-to-end tests against the live demo

The suite in `e2e/` signs in as each role and checks:
- the public site and every page;
- the demo story (verify, approve, send);
- uploads, role permissions and the SMS webhook.

```bash
cd backend && set -a; . ../.env.demo; set +a && .venv/Scripts/python -m app.cli demo-scenario && cd ..
cd e2e && npm install && npx playwright install chromium
WEB_URL=https://<your-app>.vercel.app API_URL=https://<service-name>.onrender.com SMS_WEBHOOK_TOKEN=<value shown in Render> npx playwright test
```

The first run includes waking the free services (up to 4 minutes). The tests change the demo data, so re-stage the
scenario before presenting. Results open with `npx playwright show-report`.

## Managed platforms (alternative)

The same image runs on platforms such as Render, Railway, Fly.io or a cloud container service. You need:

- **PostgreSQL with the PostGIS extension enabled.** Most managed Postgres offerings support it, and the first
  migration enables it.
- **Redis**, for the live stream.
- **Two services from the same image:**
  - a web service with the default command;
  - a worker service with `python -m app.worker`, scaled to exactly one instance and given a persistent volume at
    `/srv/models`.
- **A release command** of `alembic upgrade head`. Then run the step 6 data load once as a one-off job.
- **Environment variables** from step 4, with `DATABASE_URL` and `REDIS_URL` set to the managed services'
  addresses. Plain `postgres://` or `postgresql://` URLs are accepted as given.
