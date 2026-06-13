from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from scanner.market_data import clamp
from scanner.market_mood import MarketMoodResult
from scanner.sector_strength import SectorScore
from scanner.stock_ranking import StockScore


@dataclass(frozen=True)
class TradeIntelligence:
    confidence_score: float
    risk_score: float
    attention_score: float
    why_in_focus: str
    risk_note: str
    market_context: str

    def to_dict(self) -> dict[str, float | str]:
        return asdict(self)


def enrich_stock_candidates(
    rows: list[StockScore],
    mood: MarketMoodResult,
    sector_scores: list[SectorScore],
    news_risk_score: float,
) -> list[dict[str, Any]]:
    sector_map = {row.sector: row for row in sector_scores}
    enriched: list[dict[str, Any]] = []

    for row in rows:
        sector = sector_map.get(row.sector)
        intelligence = build_stock_intelligence(
            stock=row,
            mood=mood,
            sector_strength=sector.sector_score if sector else 50,
            market_breadth=mood.advance_decline_score,
            news_risk_score=news_risk_score,
        )
        enriched.append({**row.to_dict(), **intelligence.to_dict()})

    return enriched


def enrich_options_research(
    options_research: list[dict[str, object]],
    mood: MarketMoodResult,
    news_risk_score: float,
) -> list[dict[str, object]]:
    enriched: list[dict[str, object]] = []

    for item in options_research:
        calls = [
            _enrich_option_candidate(candidate, mood, news_risk_score)
            for candidate in _candidate_list(item.get("calls"))
        ]
        puts = [
            _enrich_option_candidate(candidate, mood, news_risk_score)
            for candidate in _candidate_list(item.get("puts"))
        ]
        enriched.append({**item, "calls": calls, "puts": puts})

    return enriched


def build_stock_intelligence(
    stock: StockScore,
    mood: MarketMoodResult,
    sector_strength: float,
    market_breadth: float,
    news_risk_score: float,
) -> TradeIntelligence:
    bias_alignment = _bias_alignment_score(mood.mood, stock.setup_direction)
    confidence = clamp(
        (mood.score * 0.18)
        + (sector_strength * 0.2)
        + (stock.relative_strength_score * 0.2)
        + (stock.volume_spike_score * 0.14)
        + (stock.breakout_score * 0.1)
        + (market_breadth * 0.1)
        + (bias_alignment * 0.08)
    )
    volatility_risk = clamp(35 + max(abs(stock.one_day_change_percent), stock.volume_ratio) * 8)
    extension_risk = clamp(40 + max(stock.breakout_percent, 0) * 6)
    risk = clamp((volatility_risk * 0.32) + (extension_risk * 0.22) + ((100 - market_breadth) * 0.18) + (news_risk_score * 0.28))
    attention = clamp(
        (stock.attention_score * 0.45)
        + (stock.volume_spike_score * 0.2)
        + (sector_strength * 0.15)
        + (stock.relative_strength_score * 0.12)
        + (mood.score * 0.08)
    )

    return TradeIntelligence(
        confidence_score=round(confidence, 2),
        risk_score=round(risk, 2),
        attention_score=round(attention, 2),
        why_in_focus=_stock_focus_reason(stock, sector_strength, confidence, attention),
        risk_note=_stock_risk_note(stock, risk, news_risk_score),
        market_context=_stock_market_context(stock, mood, market_breadth, sector_strength),
    )


def build_option_intelligence(
    candidate: dict[str, Any],
    mood: MarketMoodResult,
    news_risk_score: float,
) -> TradeIntelligence:
    option_type = str(candidate.get("option_type") or candidate.get("optionType") or "")
    potential = _number(candidate.get("score"), 0)
    oi_change = _number(candidate.get("change_in_open_interest") or candidate.get("changeInOpenInterest"), 0)
    open_interest = _number(candidate.get("open_interest") or candidate.get("openInterest"), 0)
    volume = _number(candidate.get("volume"), 0)
    iv = _number(candidate.get("implied_volatility") or candidate.get("impliedVolatility"), 0)
    distance = abs(_number(candidate.get("distance_from_spot_percent") or candidate.get("distanceFromSpotPercent"), 0))
    trend_alignment = _option_alignment_score(mood.mood, option_type)
    oi_buildup = classify_oi_buildup(option_type, oi_change, mood.mood)

    liquidity_score = clamp((min(open_interest, 250000) / 250000) * 45 + (min(volume, 200000) / 200000) * 35)
    confidence = clamp((potential * 0.38) + (liquidity_score * 0.22) + (trend_alignment * 0.18) + (mood.score * 0.12) + (max(oi_change, 0) > 0) * 10)
    risk = clamp((iv * 1.6) + (distance * 12) + ((100 - trend_alignment) * 0.22) + (news_risk_score * 0.22))
    attention = clamp((potential * 0.5) + (liquidity_score * 0.2) + (min(max(oi_change, 0), 150000) / 150000 * 20) + (trend_alignment * 0.1))

    return TradeIntelligence(
        confidence_score=round(confidence, 2),
        risk_score=round(risk, 2),
        attention_score=round(attention, 2),
        why_in_focus=_option_focus_reason(candidate, oi_buildup, confidence, attention),
        risk_note=_option_risk_note(candidate, risk, oi_buildup),
        market_context=_option_market_context(candidate, mood, oi_buildup),
    )


def classify_oi_buildup(option_type: str, oi_change: float, market_bias: str) -> str:
    if oi_change <= 0:
        return "OI unwinding"
    if option_type == "CALL" and market_bias == "Bullish":
        return "Call long build-up"
    if option_type == "PUT" and market_bias == "Bearish":
        return "Put long build-up"
    if option_type == "CALL":
        return "Call writing or resistance build-up"
    if option_type == "PUT":
        return "Put writing or support build-up"
    return "OI build-up"


def news_risk_from_catalysts(catalyst_score: float, risk_flags: list[str] | None = None) -> float:
    flag_penalty = min(len(risk_flags or []) * 12, 36)
    return clamp((100 - catalyst_score) * 0.7 + flag_penalty)


def _enrich_option_candidate(candidate: dict[str, Any], mood: MarketMoodResult, news_risk_score: float) -> dict[str, Any]:
    intelligence = build_option_intelligence(candidate, mood, news_risk_score)
    return {**candidate, **intelligence.to_dict()}


def _candidate_list(value: object) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _bias_alignment_score(market_bias: str, setup_direction: str) -> float:
    if market_bias == "Bullish" and setup_direction == "long-watch":
        return 80.0
    if market_bias == "Bearish" and setup_direction == "weakness-watch":
        return 80.0
    if market_bias == "Sideways":
        return 55.0
    return 38.0


def _option_alignment_score(market_bias: str, option_type: str) -> float:
    if market_bias == "Bullish" and option_type == "CALL":
        return 82.0
    if market_bias == "Bearish" and option_type == "PUT":
        return 82.0
    if market_bias == "Sideways":
        return 55.0
    return 35.0


def _stock_focus_reason(stock: StockScore, sector_strength: float, confidence: float, attention: float) -> str:
    drivers: list[str] = []
    if stock.relative_strength_score >= 60:
        drivers.append("relative strength")
    if stock.volume_ratio >= 1.4:
        drivers.append("volume expansion")
    if stock.breakout_percent >= 0:
        drivers.append("20-day breakout proximity")
    if sector_strength >= 60:
        drivers.append("sector support")
    if not drivers:
        drivers.append("mixed watchlist activity")
    return (
        f"Research focus: {stock.symbol} is flagged for {', '.join(drivers)}. "
        f"Confidence {confidence:.0f}/100 and attention {attention:.0f}/100 are research scores, not an entry signal."
    )


def _stock_risk_note(stock: StockScore, risk: float, news_risk_score: float) -> str:
    if risk >= 70:
        return "Elevated research risk from volatility, extension, breadth, or news flags. Avoid treating this as a trade call."
    if news_risk_score >= 55:
        return "News/catalyst risk is above neutral; confirm independently before acting."
    if stock.volume_ratio >= 2:
        return "Volume is elevated; follow-through can fade quickly without price confirmation."
    return "Risk is moderate in the research model, but price confirmation and independent validation are still required."


def _stock_market_context(stock: StockScore, mood: MarketMoodResult, market_breadth: float, sector_strength: float) -> str:
    return (
        f"Market bias is {mood.mood} with breadth score {market_breadth:.0f}/100. "
        f"{stock.sector} sector strength is {sector_strength:.0f}/100; {stock.symbol} relative strength is "
        f"{stock.relative_strength_score:.0f}/100."
    )


def _option_focus_reason(candidate: dict[str, Any], oi_buildup: str, confidence: float, attention: float) -> str:
    option_type = str(candidate.get("option_type") or candidate.get("optionType") or "option").lower()
    strike = _number(candidate.get("strike"), 0)
    return (
        f"Research focus: {strike:.0f} {option_type} is flagged for {oi_buildup.lower()} with option strike potential "
        f"{_number(candidate.get('score'), 0):.0f}/100. Confidence {confidence:.0f}/100 and attention {attention:.0f}/100 are not entry advice."
    )


def _option_risk_note(candidate: dict[str, Any], risk: float, oi_buildup: str) -> str:
    iv = _number(candidate.get("implied_volatility") or candidate.get("impliedVolatility"), 0)
    distance = abs(_number(candidate.get("distance_from_spot_percent") or candidate.get("distanceFromSpotPercent"), 0))
    if risk >= 70:
        return "Elevated option research risk from IV, distance from spot, news risk, or weak bias alignment."
    if iv >= 25:
        return "Implied volatility is high; premium decay risk can increase if momentum slows."
    if distance >= 2.5:
        return "Strike is away from spot and needs stronger index movement for follow-through."
    return f"{oi_buildup}; use as research context only with independent confirmation."


def _option_market_context(candidate: dict[str, Any], mood: MarketMoodResult, oi_buildup: str) -> str:
    return (
        f"Market bias is {mood.mood} with overall score {mood.score:.0f}/100. "
        f"OI classification: {oi_buildup}. Option strike potential is {_number(candidate.get('score'), 0):.0f}/100."
    )


def _number(value: object, fallback: float = 0.0) -> float:
    try:
        numeric = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return fallback
    return numeric if numeric == numeric else fallback
