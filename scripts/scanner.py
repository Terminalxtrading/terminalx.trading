from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from scanner.market_data import PriceSeries, YahooChartClient
from scanner.market_mood import MarketMoodResult, calculate_market_mood
from scanner.sector_strength import SectorScore, rank_sectors
from scanner.stock_ranking import StockScore, rank_stocks
from scanner.alerts import MarketAlert, generate_alerts
from scanner.catalysts import CatalystSummary, fetch_market_catalysts
from scanner.options_chain import build_options_research
from scanner.universe import INDEX_SYMBOLS, SECTOR_INDICES, STOCK_UNIVERSE
from scanner.trade_intelligence import enrich_options_research, enrich_stock_candidates, news_risk_from_catalysts

load_dotenv(PROJECT_ROOT / ".env.local", encoding="utf-8-sig")
load_dotenv(PROJECT_ROOT / ".env", encoding="utf-8-sig")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
APP_URL = os.getenv("APP_URL", "http://localhost:3000")
SCANNER_API_KEY = os.getenv("SCANNER_API_KEY")


def fetch_market_inputs() -> tuple[dict[str, PriceSeries], dict[str, PriceSeries], dict[str, PriceSeries]]:
    client = YahooChartClient()
    indices: dict[str, PriceSeries] = {}
    sector_series: dict[str, PriceSeries] = {}
    stock_series: dict[str, PriceSeries] = {}

    for name, symbol in INDEX_SYMBOLS.items():
        indices[name] = client.fetch(symbol)

    for sector_name, symbol in SECTOR_INDICES:
        try:
            sector_series[sector_name] = client.fetch(symbol)
        except Exception as exc:
            print(f"Skipping sector {sector_name} ({symbol}): {exc}")

    for symbol, _name, _sector in STOCK_UNIVERSE:
        try:
            stock_series[symbol] = client.fetch(symbol)
        except Exception as exc:
            print(f"Skipping stock {symbol}: {exc}")

    if len(stock_series) < 10:
        raise RuntimeError("Not enough stock data was fetched for ranking.")
    if len(sector_series) < 4:
        raise RuntimeError("Not enough sector index data was fetched for ranking.")

    return indices, sector_series, stock_series


def build_report(
    session: str,
    mood: MarketMoodResult,
    sector_scores: list[SectorScore],
    stock_scores: list[dict[str, Any]],
    catalysts: CatalystSummary,
    options_research: list[dict[str, object]],
) -> dict[str, Any]:
    sector_in_focus = sector_scores[0].sector if sector_scores else "Unavailable"
    stocks_in_focus = [_stock_focus_payload(row) for row in stock_scores[:20]]
    extreme_alerts = [
        _stock_focus_payload(row)
        for row in stock_scores
        if abs(row["one_day_change_percent"]) >= 4 or row["volume_ratio"] >= 2 or row["breakout_score"] >= 75
    ][:10]
    watchlist = [
        {
            "symbol": row["symbol"],
            "name": row["name"],
            "changePercent": row["one_day_change_percent"],
            "note": row["market_context"],
        }
        for row in stock_scores[:10]
    ]

    return {
        "report_date": dt.date.today().isoformat(),
        "session": session,
        "market_mood": mood.mood,
        "sector_in_focus": sector_in_focus,
        "stocks_in_focus": stocks_in_focus,
        "extreme_movement_alerts": extreme_alerts,
        "watchlist": watchlist,
        "catalysts": catalysts.to_dict(),
        "options_research": options_research,
        "summary": (
            f"{session.title()} research snapshot: market mood is {mood.mood}; "
            f"strongest sector rank is {sector_in_focus}; catalyst tone is {catalysts.sentiment}. "
            "Scores are for research only and are not buy/sell recommendations."
        ),
    }


def _stock_focus_payload(row: StockScore | dict[str, Any]) -> dict[str, Any]:
    value = row.to_dict() if isinstance(row, StockScore) else row
    return {
        "symbol": value["symbol"],
        "name": value["name"],
        "sector": value["sector"],
        "changePercent": value["one_day_change_percent"],
        "volumeRatio": value["volume_ratio"],
        "totalScore": value["total_score"],
        "relativeStrengthScore": value["relative_strength_score"],
        "breakoutScore": value["breakout_score"],
        "trendStrengthScore": value["trend_strength_score"],
        "newsImpactScore": value["news_impact_score"],
        "attentionScore": value["attention_score"],
        "setupQualityScore": value["setup_quality_score"],
        "setupDirection": value["setup_direction"],
        "referencePrice": value["reference_price"],
        "supportZoneLow": value["support_zone_low"],
        "supportZoneHigh": value["support_zone_high"],
        "resistanceZoneLow": value["resistance_zone_low"],
        "resistanceZoneHigh": value["resistance_zone_high"],
        "historicalEdgeScore": value["historical_edge_score"],
        "confidenceScore": value.get("confidence_score", value["total_score"]),
        "riskScore": value.get("risk_score", 50),
        "riskNote": value.get("risk_note", "Research-only risk context."),
        "whyInFocus": value.get("why_in_focus", value["research_note"]),
        "marketContext": value.get("market_context", "Research-only market context."),
        "catalystSummary": value["catalyst_summary"],
        "reason": value.get("why_in_focus", value["research_note"]),
    }


def save_market_intelligence(
    report: dict[str, Any],
    mood: MarketMoodResult,
    sector_scores: list[SectorScore],
    stock_scores: list[dict[str, Any]],
    alerts: list[MarketAlert],
) -> tuple[str, list[dict[str, Any]]]:
    report_id = save_report(report, mood)
    save_sector_scores(report_id, report, sector_scores)
    save_stock_scores(report_id, report, stock_scores)
    inserted_alerts = save_notification_history(report_id, alerts)
    return report_id, inserted_alerts


def save_report(report: dict[str, Any], mood: MarketMoodResult) -> str:
    payload = {
        **report,
        "market_mood_details": mood.to_dict(),
    }
    response = supabase_post("market_reports", payload, prefer_return=True, allow_missing_options_research=True)
    data = response.json()
    if not data:
        raise RuntimeError("Supabase did not return the inserted report id.")
    return data[0]["id"]


def save_sector_scores(report_id: str, report: dict[str, Any], rows: list[SectorScore]) -> None:
    payload = [
        {
            "report_id": report_id,
            "report_date": report["report_date"],
            "session": report["session"],
            "rank": row.rank,
            "sector": row.sector,
            "symbol": row.symbol,
            "sector_score": row.sector_score,
            "relative_strength_score": row.relative_strength_score,
            "momentum_score": row.momentum_score,
            "trend_score": row.trend_score,
            "one_day_change_percent": row.one_day_change_percent,
            "five_day_change_percent": row.five_day_change_percent,
            "twenty_day_change_percent": row.twenty_day_change_percent,
        }
        for row in rows
    ]
    supabase_post("sector_scores", payload)


def save_stock_scores(report_id: str, report: dict[str, Any], rows: list[dict[str, Any]]) -> None:
    payload = [
        {
            "report_id": report_id,
            "report_date": report["report_date"],
            "session": report["session"],
            "rank": row["rank"],
            "symbol": row["symbol"],
            "name": row["name"],
            "sector": row["sector"],
            "total_score": row["total_score"],
            "relative_strength_score": row["relative_strength_score"],
            "volume_spike_score": row["volume_spike_score"],
            "breakout_score": row["breakout_score"],
            "trend_strength_score": row["trend_strength_score"],
            "news_impact_score": row["news_impact_score"],
            "one_day_change_percent": row["one_day_change_percent"],
            "five_day_change_percent": row["five_day_change_percent"],
            "twenty_day_change_percent": row["twenty_day_change_percent"],
            "volume_ratio": row["volume_ratio"],
            "breakout_percent": row["breakout_percent"],
            "attention_score": row["attention_score"],
            "setup_quality_score": row["setup_quality_score"],
            "setup_direction": row["setup_direction"],
            "reference_price": row["reference_price"],
            "support_zone_low": row["support_zone_low"],
            "support_zone_high": row["support_zone_high"],
            "resistance_zone_low": row["resistance_zone_low"],
            "resistance_zone_high": row["resistance_zone_high"],
            "historical_edge_score": row["historical_edge_score"],
            "confidence_score": row["confidence_score"],
            "risk_score": row["risk_score"],
            "why_in_focus": row["why_in_focus"],
            "risk_note": row["risk_note"],
            "market_context": row["market_context"],
            "catalyst_summary": row["catalyst_summary"],
            "research_note": row["research_note"],
        }
        for row in rows
    ]
    supabase_post("stock_scores", payload, allow_missing_trade_intelligence=True)


def save_notification_history(report_id: str, alerts: list[MarketAlert]) -> list[dict[str, Any]]:
    inserted: list[dict[str, Any]] = []

    for alert in alerts:
        payload = {
            "report_id": report_id,
            "alert_key": alert.alert_key,
            "priority": alert.priority,
            "title": alert.title,
            "reason": alert.reason,
            "sector": alert.sector,
            "stocks_affected": alert.stocks_affected,
            "alert_type": alert.alert_type,
            "trigger_value": alert.trigger_value,
            "threshold_value": alert.threshold_value,
            "triggered_at": alert.timestamp,
        }
        response = supabase_post("notification_history", payload, prefer_return=True, allow_conflict=True)
        if response.status_code == 409:
            print(f"Duplicate alert skipped: {alert.alert_key}")
            continue
        data = response.json()
        if data:
            inserted.append(data[0])

    return inserted


def get_previous_market_mood() -> str | None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None

    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/market_reports",
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        },
        params={
            "select": "market_mood",
            "order": "created_at.desc",
            "limit": "1",
        },
        timeout=20,
    )
    response.raise_for_status()
    data = response.json()
    if not data:
        return None
    return data[0].get("market_mood")


def supabase_post(
    table: str,
    payload: dict[str, Any] | list[dict[str, Any]],
    prefer_return: bool = False,
    allow_conflict: bool = False,
    allow_missing_options_research: bool = False,
    allow_missing_trade_intelligence: bool = False,
) -> requests.Response:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("Missing Supabase environment variables.")

    prefer = "return=representation" if prefer_return else "return=minimal"
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
            "Prefer": prefer,
        },
        data=json.dumps(payload),
        timeout=30,
    )
    if allow_conflict and response.status_code == 409:
        return response
    if (
        allow_missing_trade_intelligence
        and table == "stock_scores"
        and response.status_code in {400, 404}
        and any(column in response.text for column in ["confidence_score", "risk_score", "why_in_focus", "market_context"])
        and isinstance(payload, list)
    ):
        trade_columns = {"confidence_score", "risk_score", "why_in_focus", "market_context"}
        fallback_payload = [{key: value for key, value in row.items() if key not in trade_columns} for row in payload]
        print("Supabase trade intelligence columns are missing; saving stock scores without trade intelligence.")
        fallback_response = requests.post(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": "application/json",
                "Prefer": prefer,
            },
            data=json.dumps(fallback_payload),
            timeout=30,
        )
        fallback_response.raise_for_status()
        return fallback_response
    if (
        allow_missing_options_research
        and table == "market_reports"
        and response.status_code in {400, 404}
        and "options_research" in response.text
        and isinstance(payload, dict)
    ):
        fallback_payload = {key: value for key, value in payload.items() if key != "options_research"}
        print("Supabase options_research column is missing; saving report without options research.")
        fallback_response = requests.post(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": "application/json",
                "Prefer": prefer,
            },
            data=json.dumps(fallback_payload),
            timeout=30,
        )
        fallback_response.raise_for_status()
        return fallback_response
    response.raise_for_status()
    return response


def update_notification_status(
    notification_id: str,
    status: str,
    sent_count: int,
    failed_count: int,
    error_message: str | None = None,
) -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return

    response = requests.patch(
        f"{SUPABASE_URL}/rest/v1/notification_history",
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
        },
        params={"id": f"eq.{notification_id}"},
        data=json.dumps(
            {
                "notification_status": status,
                "sent_count": sent_count,
                "failed_count": failed_count,
                "error_message": error_message,
            }
        ),
        timeout=20,
    )
    response.raise_for_status()


def send_push_alert(alert: dict[str, Any]) -> dict[str, Any]:
    if not SCANNER_API_KEY:
        print("SCANNER_API_KEY not set; skipping push notification send.")
        return {"sent": 0, "failed": 0, "status": "skipped"}

    response = requests.post(
        f"{APP_URL}/api/push/send",
        headers={"x-scanner-api-key": SCANNER_API_KEY, "Content-Type": "application/json"},
        json={
            "title": alert["title"],
            "reason": alert["reason"],
            "sector": alert["sector"],
            "stocksAffected": alert["stocks_affected"],
            "timestamp": alert["triggered_at"],
            "priority": alert["priority"],
            "url": "/",
        },
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


def main() -> None:
    parser = argparse.ArgumentParser(description="Create research-only Indian market intelligence reports.")
    parser.add_argument("--session", choices=["morning", "midday", "intraday", "closing"], required=True)
    parser.add_argument("--notify", action="store_true")
    parser.add_argument("--dry-run", action="store_true", help="Print rankings without saving to Supabase.")
    args = parser.parse_args()

    catalysts = fetch_market_catalysts()
    indices, sector_series, stock_series = fetch_market_inputs()
    stock_metadata = {
        symbol: {"name": name, "sector": sector}
        for symbol, name, sector in STOCK_UNIVERSE
        if symbol in stock_series
    }

    mood = calculate_market_mood(
        nifty=indices["nifty"],
        bank_nifty=indices["bank_nifty"],
        india_vix=indices["india_vix"],
        stock_series=list(stock_series.values()),
    )
    sector_scores = rank_sectors(sector_series, indices["nifty"])
    stock_scores = rank_stocks(stock_series, stock_metadata, indices["nifty"], limit=20, catalyst_score=catalysts.score)
    news_risk_score = news_risk_from_catalysts(catalysts.score, catalysts.risk_flags)
    enriched_stock_scores = enrich_stock_candidates(stock_scores, mood, sector_scores, news_risk_score)
    options_research = enrich_options_research(build_options_research(mood), mood, news_risk_score)
    previous_market_mood = None if args.dry_run else get_previous_market_mood()
    alerts = generate_alerts(
        report_date=dt.date.today().isoformat(),
        session=args.session,
        mood=mood,
        sector_scores=sector_scores,
        stock_scores=stock_scores,
        previous_market_mood=previous_market_mood,
    )
    report = build_report(args.session, mood, sector_scores, enriched_stock_scores, catalysts, options_research)

    output = {
        "report": report,
        "market_mood_details": mood.to_dict(),
        "sector_scores": [row.to_dict() for row in sector_scores],
        "stock_scores": enriched_stock_scores,
        "alerts": [alert.to_dict() for alert in alerts],
        "catalysts": catalysts.to_dict(),
        "options_research": options_research,
        "research_only_disclaimer": "Research-only output. No buy/sell recommendations are generated.",
    }

    if not args.dry_run:
        report_id, inserted_alerts = save_market_intelligence(report, mood, sector_scores, enriched_stock_scores, alerts)
        output["report_id"] = report_id
        output["new_notifications"] = len(inserted_alerts)
        if args.notify:
            for alert in inserted_alerts:
                try:
                    result = send_push_alert(alert)
                    status = result.get("status") or ("sent" if result.get("sent", 0) > 0 else "failed")
                    update_notification_status(
                        notification_id=alert["id"],
                        status=status,
                        sent_count=int(result.get("sent", 0)),
                        failed_count=int(result.get("failed", 0)),
                    )
                except Exception as exc:
                    update_notification_status(
                        notification_id=alert["id"],
                        status="failed",
                        sent_count=0,
                        failed_count=1,
                        error_message=str(exc),
                    )

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
