# Troubleshooting

## App Does Not Load

Check:

```bash
npm run build
npm run start
```

Then open:

```text
/api/health
```

If health is `degraded`, confirm Supabase environment variables and database migrations.

If the dashboard says the latest market report is stale, run the `Market Scanner` GitHub workflow manually and confirm a new row exists in `market_reports` for the latest trading day.

## Dashboard Shows Sample Data

The app falls back to sample data when Supabase server variables are missing or no reports exist.

Fix:

- Set `NEXT_PUBLIC_SUPABASE_URL`
- Set `SUPABASE_SERVICE_ROLE_KEY`
- Run `supabase/schema.sql`
- Run the scanner once:

  ```bash
  python scripts/scanner.py --session morning
  ```

## Supabase Query Errors

Most query errors mean migrations are missing.

Run:

```text
supabase/migrations/001_market_intelligence.sql
supabase/migrations/002_notification_history.sql
supabase/migrations/003_watchlist_engine.sql
supabase/migrations/004_intraday_catalyst_setup.sql
supabase/migrations/005_options_research.sql
supabase/migrations/006_realtime_worker.sql
supabase/migrations/007_trade_intelligence.sql
```

Also confirm RLS policies exist for service role operations.

## Watchlist Realtime Does Not Update

Check:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set in the browser environment
- `watchlist_stocks` exists
- `watchlist_stocks` is added to `supabase_realtime`
- Supabase Realtime is enabled for the project

Migration `003_watchlist_engine.sql` attempts to add the table to the realtime publication.

## Add Stock Fails

Common causes:

- Yahoo chart endpoint unavailable or rate-limited
- Invalid symbol
- Missing `SUPABASE_SERVICE_ROLE_KEY`
- Missing `watchlist_stocks` table

Try a full NSE symbol such as:

```text
RELIANCE.NS
INFY.NS
HDFCBANK.NS
```

## Scanner Fails

Run:

```bash
pip install -r scripts/requirements.txt
python -m py_compile scripts/scanner.py scanner/*.py
python scripts/scanner.py --session morning --dry-run
```

Free market data endpoints can be delayed, renamed, rate-limited, or temporarily unavailable.
News/catalyst scanning uses free RSS endpoints. If these fail, the scanner records neutral or cautionary catalyst context and continues.

## Realtime Worker Fails

Run:

```bash
pip install -r scripts/requirements.txt
python -m py_compile scripts/realtime_worker.py scanner/*.py
python scripts/realtime_worker.py --once --dry-run --ignore-market-hours
```

Check:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `realtime_market_snapshots` table exists
- `realtime_worker_health` table exists
- `REALTIME_POLL_SECONDS` is set for GitHub Actions, usually `60`
- NSE/Yahoo free endpoints are reachable from the GitHub Actions runner

## Push Notifications Do Not Arrive

Check:

- App is served over HTTPS in production
- Browser notification permission is granted
- Service worker is registered
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is set
- `VAPID_PRIVATE_KEY` is set
- `VAPID_SUBJECT` is set
- `SCANNER_API_KEY` matches between scanner and app
- `push_subscriptions` has at least one row

Then run:

```bash
python scripts/scanner.py --session morning --notify
```

Review `notification_history.notification_status`.

## Duplicate Alerts Are Not Sent

This is expected. `notification_history.alert_key` is unique. Repeated scanner runs with the same trigger are skipped to prevent duplicate alerts.

## PWA Install Prompt Does Not Show

Check:

- HTTPS production URL
- `/manifest.webmanifest` returns 200
- `/sw.js` returns 200
- `/icon-192.png` returns 200
- `/icon-512.png` returns 200
- Browser has not previously dismissed the install prompt

Use Chrome DevTools Application panel to inspect Manifest and Service Workers.

## GitHub Actions Scanner Fails

Confirm repository secrets:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_URL`
- `SCANNER_API_KEY`
- `REALTIME_POLL_SECONDS`
- `MARKET_CATALYST_QUERIES` if you want custom news/catalyst searches

Open the `Market Scanner` workflow and run it manually with `workflow_dispatch`.
Open the `Free Realtime Scanner` workflow for realtime one-shot runs during market hours.

## Monitoring Webhook Does Not Receive Events

Check:

- `MONITORING_WEBHOOK_URL` is set in the hosting environment
- The webhook accepts JSON POST requests
- The failing route is server-side code using `captureError`

Structured logs are still written to stdout/stderr even without a webhook.
