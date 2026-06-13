# Production Deployment

This app is a research-only Indian market dashboard with scheduled scanner jobs, Supabase storage, PWA installability, and Web Push alerts.

## Required Services

- Supabase project with SQL migrations applied
- Hosting for the Next.js app
- GitHub Actions enabled for scanner automation
- HTTPS production URL for PWA and Web Push
- Optional monitoring webhook endpoint

## Environment Variables

Set these in production hosting and GitHub repository secrets:

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
SCANNER_API_KEY=
APP_URL=https://your-production-domain.com
MONITORING_WEBHOOK_URL=
MARKET_CATALYST_QUERIES=
ALLOW_STALE_MARKET_REPORTS=false
REALTIME_POLL_SECONDS=60
```

## Supabase Setup

Run `supabase/schema.sql` for a fresh database.

For an existing database, run migrations in order:

```text
supabase/migrations/001_market_intelligence.sql
supabase/migrations/002_notification_history.sql
supabase/migrations/003_watchlist_engine.sql
supabase/migrations/004_intraday_catalyst_setup.sql
supabase/migrations/005_options_research.sql
supabase/migrations/006_realtime_worker.sql
supabase/migrations/007_trade_intelligence.sql
```

Confirm these tables exist:

- `market_reports`
- `sector_scores`
- `stock_scores`
- `push_subscriptions`
- `notification_history`
- `watchlist_stocks`

Confirm `watchlist_stocks` is in the `supabase_realtime` publication.

## Build Commands

```bash
npm ci
npm run typecheck
npm run lint
npm run build
```

Python scanner verification:

```bash
pip install -r scripts/requirements.txt
python -m py_compile scripts/scanner.py scanner/*.py
python scripts/scanner.py --session morning --dry-run
python scripts/realtime_worker.py --once --dry-run --ignore-market-hours
```

## Free Realtime Scanner

Use GitHub Actions for free-tier realtime scans. The workflow in `.github/workflows/free-realtime-scanner.yml` runs every 15 minutes from `09:15` to `15:30` IST, Monday through Friday, and also supports `workflow_dispatch`.

Required repository secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_URL`
- `SCANNER_API_KEY`
- `REALTIME_POLL_SECONDS`

Each scheduled run executes:

```bash
python scripts/realtime_worker.py --once --ignore-market-hours
```

Operational notes:

- `--once` builds one market intelligence snapshot, saves it, sends eligible alerts, and exits.
- `--ignore-market-hours` is used because the workflow schedule already limits runs to market hours.
- Use `python scripts/realtime_worker.py --once --dry-run --ignore-market-hours` for local tests.
- Health is written to `realtime_worker_health`.
- Snapshots are written to `realtime_market_snapshots`.
- Duplicate alerts are prevented by `notification_history.alert_key`.

## Health Checks

After deployment:

```text
GET /api/health
GET /api/dashboard
GET /api/notifications/analytics
GET /api/watchlist
```

`/api/health` returns `ok` only when required Supabase server configuration and database access are available.

## PWA Verification

- Open the production app over HTTPS.
- Confirm `/manifest.webmanifest` returns 200.
- Confirm `/sw.js` returns 200.
- Confirm `/icon-192.png` and `/icon-512.png` return 200.
- In Chrome DevTools, run Lighthouse PWA checks.
- Install the app from the browser install prompt.

## Push Verification

1. Generate VAPID keys if needed:

   ```bash
   npx web-push generate-vapid-keys
   ```

2. Set VAPID variables in production.
3. Open the app, select `Enable alerts`, and approve notifications.
4. Confirm a row is added to `push_subscriptions`.
5. Run scanner with notification sending:

   ```bash
   python scripts/scanner.py --session morning --notify
   ```

6. Confirm `notification_history` rows are created and marked `sent`, `failed`, or `skipped`.

## GitHub Actions

Required repository secrets:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_URL`
- `SCANNER_API_KEY`
- `REALTIME_POLL_SECONDS`

Workflows:

- `CI`: typecheck, lint, build, Python scanner syntax validation
- `Market Scanner`: scheduled weekday morning, intraday, midday, and closing scanner runs
- `Free Realtime Scanner`: 15-minute one-shot realtime scans during Indian market hours

## Monitoring

Server errors are logged as structured JSON. If `MONITORING_WEBHOOK_URL` is set, API failures are posted to that webhook with route context and stack traces.

Recommended monitors:

- `/api/health` uptime monitor
- GitHub Actions failure notification
- Supabase database usage and error alerts
- Hosting platform function error alerts

## Deployment Checklist

- [ ] Run `npm ci`
- [ ] Run `npm run typecheck`
- [ ] Run `npm run lint`
- [ ] Run `npm run build`
- [ ] Run Python scanner syntax check
- [ ] Run scanner `--dry-run`
- [ ] Apply Supabase schema/migrations
- [ ] Configure production environment variables
- [ ] Configure GitHub repository secrets
- [ ] Verify `/api/health`
- [ ] Verify `/api/dashboard`
- [ ] Verify `/watchlist`
- [ ] Verify `/notifications`
- [ ] Verify PWA manifest, service worker, and icons
- [ ] Verify Web Push subscription and test alert
- [ ] Verify scanner workflow manually with `workflow_dispatch`
- [ ] Confirm research-only disclaimer remains visible
