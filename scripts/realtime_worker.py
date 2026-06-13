from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import requests
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from scanner.market_data import PriceSeries, YahooChartClient, clamp
from scanner.market_mood import MarketMoodResult, calculate_market_mood
from scanner.options_chain import build_options_research
from scanner.sector_strength import SectorScore, rank_sectors
from scanner.stock_ranking import StockScore, rank_stocks
from scanner.trade_intelligence import enrich_options_research, enrich_stock_candidates
from scanner.universe import INDEX_SYMBOLS, SECTOR_INDICES, STOCK_UNIVERSE

load_dotenv(PROJECT_ROOT / ".env.local", encoding="utf-8-sig")
load_dotenv(PROJECT_ROOT / ".env", encoding="utf-8-sig")

IST = ZoneInfo("Asia/Kolkata")
UTC = dt.timezone.utc
WORKER_NAME = "terminalx-realtime-worker"
MARKET_OPEN = dt.time(9, 15)
MARKET_CLOSE = dt.time(15, 30)
POLL_SECONDS = int(os.getenv("REALTIME_POLL_SECONDS") or os.getenv("REALTIME_WORKER_INTERVAL_SECONDS", "60"))


def normalize_url(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().rstrip("/")
    if not normalized:
        return None
    if not normalized.startswith(("http://", "https://")):
        normalized = f"https://{normalized}"
    return normalized


SUPABASE_URL = normalize_url(os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL"))
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
APP_URL = os.getenv("APP_URL", "https://terminalx-trading.vercel.app")
SCANNER_API_KEY = os.getenv("SCANNER_API_KEY")

SENSEX_SYMBOL = "^BSESN"


def configure_logging() -> None:
    logging.basicConfig(
        level=os.getenv("REALTIME_WORKER_LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(message)s",
    )


def now_ist() -> dt.datetime:
    return dt.datetime.now(IST)


def market_is_open(moment: dt.datetime | None = None) -> bool:
    current = moment or now_ist()
    if current.weekday() >= 5:
        return False
    return MARKET_OPEN <= current.time() <= MARKET_CLOSE


def seconds_until_market_open(moment: dt.datetime | None = None) -> int:
    current = moment or now_ist()
    next_open = current.replace(hour=9, minute=15, second=0, microsecond=0)
    if current.weekday() >= 5 or current.time() > MARKET_CLOSE:
        next_open += dt.timedelta(days=1)
        while next_open.weekday() >= 5:
            next_open += dt.timedelta(days=1)
    elif current.time() < MARKET_OPEN:
        pass
    return max(30, int((next_open - current).total_seconds()))


def fetch_realtime_inputs() -> tuple[dict[str, PriceSeries], dict[str, PriceSeries], dict[str, PriceSeries]]:
    client = YahooChartClient(timeout=15)
    indices: dict[str, PriceSeries] = {}
    sectors: dict[str, PriceSeries] = {}
    stocks: dict[str, PriceSeries] = {}

    for name, symbol in {**INDEX_SYMBOLS, "sensex": SENSEX_SYMBOL}.items():
        try:
            indices[name] = client.fetch(symbol, chart_range="5d", interval="5m")
        except Exception as exc:
            logging.warning("Skipping index %s (%s): %s", name, symbol, exc)

    for sector_name, symbol in SECTOR_INDICES:
        try:
            sectors[sector_name] = client.fetch(symbol, chart_range="5d", interval="5m")
        except Exception as exc:
            logging.warning("Skipping sector %s (%s): %s", sector_name, symbol, exc)

    symbols = realtime_stock_universe()
    for symbol, metadata in symbols.items():
        try:
            stocks[symbol] = client.fetch(symbol, chart_range="5d", interval="5m")
        except Exception as exc:
            logging.warning("Skipping stock %s: %s", symbol, exc)

    if "nifty" not in indices or "bank_nifty" not in indices or "india_vix" not in indices:
        raise RuntimeError("Missing required index data for market bias.")
    if len(sectors) < 4:
        raise RuntimeError("Not enough sector data for realtime rotation.")
    if len(stocks) < 10:
        raise RuntimeError("Not enough stock/watchlist data for realtime breadth.")

    return indices, sectors, stocks


def realtime_stock_universe() -> dict[str, dict[str, str]]:
    universe = {symbol: {"name": name, "sector": sector} for symbol, name, sector in STOCK_UNIVERSE}
    for row in fetch_watchlist_rows():
        symbol = normalize_symbol(str(row.get("symbol", "")))
        if not symbol:
            continue
        universe[symbol] = {
            "name": str(row.get("name") or symbol.replace(".NS", "")),
            "sector": "Watchlist",
        }
    return universe


def normalize_symbol(symbol: str) -> str:
    value = symbol.strip().upper()
    if not value:
        return ""
    if value.startswith("^") or value.endswith(".NS") or value.endswith(".BO"):
        return value
    return f"{value}.NS"


def fetch_watchlist_rows() -> list[dict[str, Any]]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return []
    try:
        response = supabase_get(
            "watchlist_stocks",
            {
                "select": "symbol,name,is_tracked",
                "is_tracked": "eq.true",
            },
            timeout=12,
        )
        return response.json()
    except Exception as exc:
        logging.warning("Unable to fetch watchlist rows: %s", exc)
        return []


def calculate_market_bias(mood: MarketMoodResult) -> str:
    if mood.score >= 62:
        return "Strong Bullish"
    if mood.score >= 55:
        return "Bullish"
    if mood.score <= 38:
        return "Strong Bearish"
    if mood.score <= 45:
        return "Bearish"
    return "Sideways"


def calculate_market_breadth(series: list[PriceSeries]) -> dict[str, Any]:
    advances = sum(1 for row in series if row.change_percent(1) > 0)
    declines = sum(1 for row in series if row.change_percent(1) < 0)
    unchanged = max(0, len(series) - advances - declines)
    ratio = round(advances / declines, 2) if declines else float(advances or 1)
    score = round(clamp(50 + ((ratio - 1) * 30)), 2)
    return {
        "advances": advances,
        "declines": declines,
        "unchanged": unchanged,
        "advanceDeclineRatio": ratio,
        "breadthScore": score,
        "classification": "positive" if score >= 58 else "negative" if score <= 42 else "mixed",
    }


def sector_rotation_payload(rows: list[SectorScore]) -> list[dict[str, Any]]:
    return [
        {
            "rank": row.rank,
            "sector": row.sector,
            "symbol": row.symbol,
            "score": row.sector_score,
            "relativeStrengthScore": row.relative_strength_score,
            "momentumScore": row.momentum_score,
            "trendScore": row.trend_score,
            "changePercent": row.one_day_change_percent,
            "rotation": "leading" if row.rank <= 3 and row.sector_score >= 55 else "lagging" if row.rank >= 6 else "neutral",
        }
        for row in rows
    ]


def attention_payload(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "rank": row["rank"],
            "symbol": row["symbol"],
            "name": row["name"],
            "sector": row["sector"],
            "confidenceScore": row["confidence_score"],
            "riskScore": row["risk_score"],
            "attentionScore": row["attention_score"],
            "setupQualityScore": row["setup_quality_score"],
            "changePercent": row["one_day_change_percent"],
            "volumeRatio": row["volume_ratio"],
            "whyInFocus": row["why_in_focus"],
            "riskNote": row["risk_note"],
            "marketContext": row["market_context"],
            "reason": row["why_in_focus"],
        }
        for row in rows[:20]
    ]


def watchlist_payload(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "symbol": row["symbol"],
            "name": row["name"],
            "confidenceScore": row["confidence_score"],
            "riskScore": row["risk_score"],
            "attentionScore": row["attention_score"],
            "setupQualityScore": row["setup_quality_score"],
            "changePercent": row["one_day_change_percent"],
            "volumeRatio": row["volume_ratio"],
            "riskNote": row["risk_note"],
            "whyInFocus": row["why_in_focus"],
        }
        for row in rows
        if row["sector"] == "Watchlist"
    ]


def option_strike_potential(options_research: list[dict[str, object]]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for item in options_research:
        if item.get("dataStatus") != "ok":
            continue
        for side in ["calls", "puts"]:
            for row in item.get(side, []):
                if not isinstance(row, dict):
                    continue
                score = float(row.get("score") or 0)
                candidates.append(
                    {
                        "index": item.get("index"),
                        "optionType": row.get("option_type") or row.get("optionType"),
                        "strike": row.get("strike"),
                        "expiry": row.get("expiry"),
                        "score": score,
                        "classification": "high-potential" if score >= 70 else "watch" if score >= 55 else "low-priority",
                        "reason": row.get("reason"),
                        "riskNote": row.get("risk_note") or row.get("riskNote"),
                    }
                )
    return sorted(candidates, key=lambda row: float(row["score"]), reverse=True)[:12]


def oi_buildup_payload(options_research: list[dict[str, object]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in options_research:
        if item.get("dataStatus") != "ok":
            continue
        for side in ["calls", "puts"]:
            for option in item.get(side, []):
                if not isinstance(option, dict):
                    continue
                oi_change = float(option.get("change_in_open_interest") or option.get("changeInOpenInterest") or 0)
                volume = float(option.get("volume") or 0)
                score = float(option.get("score") or 0)
                rows.append(
                    {
                        "index": item.get("index"),
                        "optionType": option.get("option_type") or option.get("optionType"),
                        "strike": option.get("strike"),
                        "oiChange": oi_change,
                        "volume": volume,
                        "score": score,
                        "classification": classify_oi_buildup(oi_change, volume, score),
                    }
                )
    return sorted(rows, key=lambda row: abs(float(row["oiChange"])), reverse=True)[:20]


def classify_oi_buildup(oi_change: float, volume: float, score: float) -> str:
    if oi_change > 0 and score >= 65 and volume > 0:
        return "fresh buildup"
    if oi_change > 0:
        return "oi addition"
    if oi_change < 0 and volume > 0:
        return "unwinding"
    return "neutral"


def build_snapshot() -> dict[str, Any]:
    started = dt.datetime.now(UTC)
    indices, sector_series, stock_series = fetch_realtime_inputs()
    metadata = realtime_stock_universe()
    metadata = {symbol: metadata.get(symbol, {"name": symbol, "sector": "Unclassified"}) for symbol in stock_series}

    mood = calculate_market_mood(
        nifty=indices["nifty"],
        bank_nifty=indices["bank_nifty"],
        india_vix=indices["india_vix"],
        stock_series=list(stock_series.values()),
    )
    market_bias = calculate_market_bias(mood)
    sectors = rank_sectors(sector_series, indices["nifty"])
    stocks = enrich_stock_candidates(rank_stocks(stock_series, metadata, indices["nifty"], limit=30), mood, sectors, news_risk_score=50)
    options = enrich_options_research(build_options_research(mood), mood, news_risk_score=50)
    breadth = calculate_market_breadth(list(stock_series.values()))
    potential = option_strike_potential(options)
    oi_buildup = oi_buildup_payload(options)
    finished = dt.datetime.now(UTC)

    return {
        "snapshot_date": now_ist().date().isoformat(),
        "snapshot_at": finished.isoformat(),
        "market_bias": market_bias,
        "market_breadth": breadth,
        "sector_rotation": sector_rotation_payload(sectors),
        "attention_scores": attention_payload(stocks),
        "options_research": options,
        "option_strike_potential": potential,
        "oi_buildup": oi_buildup,
        "watchlist": watchlist_payload(stocks),
        "health": {
            "durationSeconds": round((finished - started).total_seconds(), 2),
            "indicesFetched": len(indices),
            "sectorsFetched": len(sector_series),
            "stocksFetched": len(stock_series),
            "optionsGroups": len(options),
            "researchOnly": True,
        },
    }


def save_snapshot(snapshot: dict[str, Any]) -> None:
    supabase_post("realtime_market_snapshots", snapshot)


def generate_realtime_alerts(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    timestamp = snapshot["snapshot_at"]
    date_key = snapshot["snapshot_date"]
    alerts: list[dict[str, Any]] = []

    bias = snapshot["market_bias"]
    if bias in {"Strong Bullish", "Strong Bearish"}:
        alerts.append(
            {
                "alert_key": f"{date_key}:realtime:bias:{bias}",
                "priority": "High",
                "title": f"Realtime market bias: {bias}",
                "reason": f"Market breadth and trend model show {bias}. Research-only alert.",
                "sector": "Broad Market",
                "stocks_affected": [],
                "alert_type": "realtime_market_bias",
                "trigger_value": snapshot["market_breadth"].get("breadthScore", 0),
                "threshold_value": 62,
                "triggered_at": timestamp,
            }
        )

    for sector in snapshot["sector_rotation"][:3]:
        if float(sector.get("score") or 0) >= 68:
            alerts.append(
                {
                    "alert_key": f"{date_key}:realtime:sector:{sector['sector']}:leading",
                    "priority": "Medium",
                    "title": f"{sector['sector']} leading realtime rotation",
                    "reason": f"{sector['sector']} rotation score {sector['score']}. Research-only alert.",
                    "sector": sector["sector"],
                    "stocks_affected": [],
                    "alert_type": "realtime_sector_rotation",
                    "trigger_value": sector["score"],
                    "threshold_value": 68,
                    "triggered_at": timestamp,
                }
            )

    for strike in snapshot["option_strike_potential"][:5]:
        if float(strike.get("score") or 0) >= 75:
            alerts.append(
                {
                    "alert_key": f"{date_key}:realtime:option:{strike['index']}:{strike['optionType']}:{strike['strike']}",
                    "priority": "High",
                    "title": f"{strike['index']} {strike['optionType']} {strike['strike']} option interest elevated",
                    "reason": f"Option strike potential score {strike['score']}. {strike.get('reason')}",
                    "sector": "Options",
                    "stocks_affected": [str(strike["index"])],
                    "alert_type": "realtime_option_potential",
                    "trigger_value": strike["score"],
                    "threshold_value": 75,
                    "triggered_at": timestamp,
                }
            )

    return alerts


def save_alerts(alerts: list[dict[str, Any]]) -> int:
    inserted = 0
    for alert in alerts:
        response = supabase_post("notification_history", {**alert, "report_id": None}, prefer_return=True, allow_conflict=True)
        if response.status_code == 409:
            logging.info("Duplicate realtime alert skipped: %s", alert["alert_key"])
            continue
        inserted += 1
    return inserted


def update_health(status: str, metrics: dict[str, Any] | None = None, error: str | None = None) -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return
    now = dt.datetime.now(UTC).isoformat()
    payload = {
        "worker_name": WORKER_NAME,
        "status": status,
        "last_run_at": now,
        "last_success_at": now if status == "healthy" else None,
        "last_error": error,
        "metrics": metrics or {},
        "updated_at": now,
    }
    try:
        supabase_post("realtime_worker_health", payload, allow_conflict_upsert=True)
    except Exception as exc:
        logging.warning("Unable to update realtime worker health. Has migration 006 been applied? %s", exc)


def supabase_get(table: str, params: dict[str, str], timeout: int = 20) -> requests.Response:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("Missing Supabase environment variables.")
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        },
        params=params,
        timeout=timeout,
    )
    response.raise_for_status()
    return response


def supabase_post(
    table: str,
    payload: dict[str, Any] | list[dict[str, Any]],
    prefer_return: bool = False,
    allow_conflict: bool = False,
    allow_conflict_upsert: bool = False,
) -> requests.Response:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("Missing Supabase environment variables.")

    prefer = "return=representation" if prefer_return else "return=minimal"
    if allow_conflict_upsert:
        prefer = f"{prefer},resolution=merge-duplicates"

    params = {"on_conflict": "worker_name"} if allow_conflict_upsert else None
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
            "Prefer": prefer,
        },
        params=params,
        data=json.dumps(payload),
        timeout=30,
    )
    if allow_conflict and response.status_code == 409:
        return response
    response.raise_for_status()
    return response


def run_once(dry_run: bool = False) -> None:
    if not dry_run:
        update_health("running")
    snapshot = build_snapshot()
    alerts = generate_realtime_alerts(snapshot)
    inserted_alerts = 0
    if not dry_run:
        save_snapshot(snapshot)
        inserted_alerts = save_alerts(alerts)
    metrics = {
        **snapshot["health"],
        "alertsGenerated": len(alerts),
        "alertsInserted": inserted_alerts,
        "dryRun": dry_run,
    }
    if not dry_run:
        update_health("healthy", metrics=metrics)
    logging.info(
        "Realtime snapshot %s: bias=%s sectors=%s attention=%s options=%s alerts=%s",
        "built" if dry_run else "saved",
        snapshot["market_bias"],
        len(snapshot["sector_rotation"]),
        len(snapshot["attention_scores"]),
        len(snapshot["option_strike_potential"]),
        inserted_alerts,
    )


def run_loop(run_outside_market: bool = False) -> None:
    update_health("starting", metrics={"intervalSeconds": POLL_SECONDS})
    logging.info("Starting realtime worker. Poll interval: %ss", POLL_SECONDS)
    while True:
        if not run_outside_market and not market_is_open():
            sleep_seconds = min(seconds_until_market_open(), 900)
            update_health("sleeping", metrics={"nextCheckSeconds": sleep_seconds})
            logging.info("Market closed. Sleeping for %ss", sleep_seconds)
            time.sleep(sleep_seconds)
            continue

        started = time.monotonic()
        try:
            run_once()
        except Exception as exc:
            logging.exception("Realtime worker cycle failed")
            update_health("failed", error=str(exc))

        elapsed = time.monotonic() - started
        time.sleep(max(5, POLL_SECONDS - elapsed))


def main() -> None:
    configure_logging()
    parser = argparse.ArgumentParser(description="Run TerminalX realtime market intelligence worker.")
    parser.add_argument("--once", action="store_true", help="Run one polling cycle and exit.")
    parser.add_argument("--dry-run", action="store_true", help="Build one snapshot without writing to Supabase.")
    parser.add_argument("--ignore-market-hours", action="store_true", help="Run even outside 09:15-15:30 IST.")
    args = parser.parse_args()

    if args.once:
        run_once(dry_run=args.dry_run)
        return

    run_loop(run_outside_market=args.ignore_market_hours)


if __name__ == "__main__":
    main()
