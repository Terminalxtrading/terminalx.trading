# TerminalX.Trading

A free, research-only Indian stock market PWA alert app built with Next.js, TypeScript, Tailwind CSS, Supabase, GitHub Actions, Python scanner scripts, and Web Push notifications.

## Features

- Market mood snapshot
- Sector in focus
- Stocks in focus
- Market intelligence scoring for Nifty trend, Bank Nifty trend, India VIX, and advance/decline ratio
- Sector ranking with sector score, relative strength score, and momentum score
- Top 20 stock focus ranking with relative strength, volume spike, breakout, trend strength, and neutral news-impact placeholder
- Extreme movement alerts
- Watchlist
- Morning and closing reports
- PWA manifest and service worker
- Web Push notification subscription and send APIs
- Alert priorities: Critical, High, Medium, Low
- Duplicate alert prevention with Supabase notification history
- Notification analytics page
- Realtime watchlist engine with add, remove, track, and Watchlist Health Score
- Intraday research setup quality, attention score, support/resistance watch zones, and catalyst/news tone
- Call/put strike research for NIFTY and BANKNIFTY using option-chain OI, OI change, volume, PCR, max pain, and trend context
- Realtime market intelligence worker for 09:15-15:30 IST polling, sector rotation, breadth, options potential, duplicate alerts, and worker health
- Supabase database schema
- Python scanner that stores reports and can trigger push alerts
- GitHub Actions schedule for market-day scans

## Research-only disclaimer

This app is for education, tracking, and personal research only. It does not provide buy, sell, hold, target-price, portfolio, financial-planning, or investment advice. Always verify data independently and consult a registered financial professional before making financial decisions.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Supabase project and run `supabase/schema.sql` in the Supabase SQL editor.

   For an existing database that already has the original tables, run:

   ```sql
   -- Supabase SQL editor
   -- paste the contents of supabase/migrations/001_market_intelligence.sql
   ```

   Then run the notification history migration:

   ```sql
   -- Supabase SQL editor
   -- paste the contents of supabase/migrations/002_notification_history.sql
   ```

   Then run the watchlist engine migration:

   ```sql
   -- Supabase SQL editor
   -- paste the contents of supabase/migrations/003_watchlist_engine.sql
   ```

   Then run the intraday catalyst/setup migration:

   ```sql
   -- Supabase SQL editor
   -- paste the contents of supabase/migrations/004_intraday_catalyst_setup.sql
   ```

   Then run the options research migration:

   ```sql
   -- Supabase SQL editor
   -- paste the contents of supabase/migrations/005_options_research.sql
   ```

   Then run the realtime worker migration:

   ```sql
   -- Supabase SQL editor
   -- paste the contents of supabase/migrations/006_realtime_worker.sql
   ```

   Then run the trade intelligence migration:

   ```sql
   -- Supabase SQL editor
   -- paste the contents of supabase/migrations/007_trade_intelligence.sql
   ```

3. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

4. Fill in `.env.local`:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_URL=your-supabase-url
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-vapid-public-key
   VAPID_PRIVATE_KEY=your-vapid-private-key
   VAPID_SUBJECT=mailto:you@example.com
   SCANNER_API_KEY=choose-a-long-random-secret
   APP_URL=http://localhost:3000
   MARKET_CATALYST_QUERIES=
   ALLOW_STALE_MARKET_REPORTS=false
   REALTIME_POLL_SECONDS=60
   ```

5. Generate VAPID keys:

   ```bash
   npx web-push generate-vapid-keys
   ```

6. Run the app:

   ```bash
   npm run dev
   ```

7. Run a scanner report locally:

   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r scripts/requirements.txt
   python scripts/scanner.py --session morning
   ```

8. Preview scanner output without saving:

   ```bash
   python scripts/scanner.py --session morning --dry-run
   ```

9. Run the realtime worker once:

   ```bash
   python scripts/realtime_worker.py --once --ignore-market-hours
   ```

10. Preview the realtime worker without saving:

   ```bash
   python scripts/realtime_worker.py --once --dry-run --ignore-market-hours
   ```

11. Run the realtime worker continuously:

   ```bash
   python scripts/realtime_worker.py
   ```

## GitHub Actions

Add these repository secrets:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_URL`
- `SCANNER_API_KEY`
- `REALTIME_POLL_SECONDS`

The workflow in `.github/workflows/market-scanner.yml` runs on weekdays at:

- `03:15 UTC`, roughly `08:45 IST`, for the morning report
- multiple intraday scans between roughly `10:20 IST` and `15:45 IST`
- `10:40 UTC`, roughly `16:10 IST`, for the closing report

You can also run it manually with `workflow_dispatch`.

The free realtime workflow in `.github/workflows/free-realtime-scanner.yml` runs `scripts/realtime_worker.py --once` every 15 minutes from `09:15` to `15:30` IST, Monday through Friday. It performs one scan, writes realtime market intelligence to Supabase, sends eligible alerts, and exits so no paid Render or Railway worker is required.

## Notes

- The scanner uses Yahoo Finance chart endpoints for Indian indices, sector indices, and `.NS` symbols as a free data source. Free feeds can be delayed, rate-limited, renamed, or unavailable.
- Market mood is limited to `Bullish`, `Bearish`, or `Sideways` based on Nifty trend, Bank Nifty trend, India VIX, and monitored-universe advance/decline ratio.
- Sector and stock scores are research rankings only. They are not buy, sell, hold, target-price, or allocation recommendations.
- Setup quality, attention score, and support/resistance watch zones are research context only. They are not entry calls, stop-loss levels, or trade instructions.
- Options strike research is based on free option-chain data and is research context only. It is not an entry, exit, target, or stop-loss recommendation.
- Trade intelligence confidence, risk, and attention scores are research filters only. They are not trade instructions or recommendations.
- NIFTY and BANKNIFTY use NSE option-chain data. SENSEX options require a BSE option-chain feed before live strike ranking can be shown.
- The realtime worker polls every 60 seconds only during NSE market hours by default. Free data feeds may still be delayed, throttled, or temporarily unavailable.
- Catalyst scanning uses configurable free RSS/news queries. Set `MARKET_CATALYST_QUERIES` as a `|`-separated list to customize news, geopolitical, crude oil, FII/DII, currency, or sector themes.
- The dashboard refuses stale market reports by default. Run the scanner for the latest trading day, or set `ALLOW_STALE_MARKET_REPORTS=true` only for debugging old data.
- Critical alerts trigger for sector moves above 2%, stock moves above 5%, volume above 3x average, and market mood changes.
- Alerts are stored in `notification_history` with a unique `alert_key` so repeated scanner runs do not send duplicate alerts.
- Watchlist rows are stored in `watchlist_stocks`; the app subscribes to Supabase Realtime updates for that table.
- Push notifications require HTTPS in production. Localhost works for development in most browsers.

## Production

- See `DEPLOYMENT.md` for the production rollout checklist.
- See `TROUBLESHOOTING.md` for common setup, Supabase, PWA, scanner, and push-notification issues.
