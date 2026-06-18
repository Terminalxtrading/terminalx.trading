import { getSupabaseAdmin } from "@/lib/supabase";
import { buildPreMarketBrief, getPreMarketBriefStatus, getPreMarketStaleMessage } from "@/lib/pre-market-brief";
import type { CatalystSummary, DashboardData, DashboardReportSummary, IndexOptionResearch, LivePriceItem, MarketMoodDetails, MarketReport, OptionStrikeCandidate, ReportSession, SectorScore, StockScore } from "@/lib/types";

type ReportRow = {
  id: string;
  report_date: string;
  session: ReportSession;
  market_mood: MarketReport["marketMood"];
  market_mood_details?: Record<string, unknown>;
  sector_in_focus: string;
  stocks_in_focus: MarketReport["stocksInFocus"];
  extreme_movement_alerts: MarketReport["extremeMovementAlerts"];
  watchlist: MarketReport["watchlist"];
  catalysts?: Record<string, unknown>;
  options_research?: unknown[];
  summary: string;
  created_at: string;
};

const reportSelect = [
  "id",
  "report_date",
  "session",
  "market_mood",
  "market_mood_details",
  "sector_in_focus",
  "stocks_in_focus",
  "extreme_movement_alerts",
  "watchlist",
  "catalysts",
  "options_research",
  "summary",
  "created_at"
].join(",");

const reportSelectWithoutOptionsResearch = [
  "id",
  "report_date",
  "session",
  "market_mood",
  "market_mood_details",
  "sector_in_focus",
  "stocks_in_focus",
  "extreme_movement_alerts",
  "watchlist",
  "catalysts",
  "summary",
  "created_at"
].join(",");

const reportSummarySelect = ["id", "report_date", "session", "market_mood", "sector_in_focus", "created_at"].join(",");

const sectorScoreSelect = [
  "id",
  "report_id",
  "report_date",
  "session",
  "rank",
  "sector",
  "symbol",
  "sector_score",
  "relative_strength_score",
  "momentum_score",
  "trend_score",
  "one_day_change_percent",
  "five_day_change_percent",
  "twenty_day_change_percent"
].join(",");

const stockScoreSelect = [
  "id",
  "report_id",
  "report_date",
  "session",
  "rank",
  "symbol",
  "name",
  "sector",
  "total_score",
  "relative_strength_score",
  "volume_spike_score",
  "breakout_score",
  "trend_strength_score",
  "news_impact_score",
  "one_day_change_percent",
  "five_day_change_percent",
  "twenty_day_change_percent",
  "volume_ratio",
  "breakout_percent",
  "attention_score",
  "setup_quality_score",
  "setup_direction",
  "reference_price",
  "support_zone_low",
  "support_zone_high",
  "resistance_zone_low",
  "resistance_zone_high",
  "historical_edge_score",
  "confidence_score",
  "risk_score",
  "why_in_focus",
  "risk_note",
  "market_context",
  "catalyst_summary",
  "research_note"
].join(",");

const stockScoreSelectWithoutTradeIntelligence = [
  "id",
  "report_id",
  "report_date",
  "session",
  "rank",
  "symbol",
  "name",
  "sector",
  "total_score",
  "relative_strength_score",
  "volume_spike_score",
  "breakout_score",
  "trend_strength_score",
  "news_impact_score",
  "one_day_change_percent",
  "five_day_change_percent",
  "twenty_day_change_percent",
  "volume_ratio",
  "breakout_percent",
  "attention_score",
  "setup_quality_score",
  "setup_direction",
  "reference_price",
  "support_zone_low",
  "support_zone_high",
  "resistance_zone_low",
  "resistance_zone_high",
  "historical_edge_score",
  "risk_note",
  "catalyst_summary",
  "research_note"
].join(",");

export function mapReportRow(row: ReportRow): MarketReport {
  return {
    id: row.id,
    reportDate: row.report_date,
    session: row.session,
    marketMood: row.market_mood,
    marketMoodDetails: mapMarketMoodDetails(row.market_mood_details),
    sectorInFocus: row.sector_in_focus,
    stocksInFocus: row.stocks_in_focus,
    extremeMovementAlerts: row.extreme_movement_alerts,
    watchlist: row.watchlist,
    catalysts: mapCatalysts(row.catalysts),
    optionsResearch: mapOptionsResearch(row.options_research),
    summary: row.summary,
    createdAt: row.created_at
  };
}

type SectorScoreRow = {
  id: string;
  report_id: string;
  report_date: string;
  session: ReportSession;
  rank: number;
  sector: string;
  symbol: string;
  sector_score: number | string;
  relative_strength_score: number | string;
  momentum_score: number | string;
  trend_score: number | string;
  one_day_change_percent: number | string;
  five_day_change_percent: number | string;
  twenty_day_change_percent: number | string;
};

type StockScoreRow = {
  id: string;
  report_id: string;
  report_date: string;
  session: ReportSession;
  rank: number;
  symbol: string;
  name: string;
  sector: string;
  total_score: number | string;
  relative_strength_score: number | string;
  volume_spike_score: number | string;
  breakout_score: number | string;
  trend_strength_score: number | string;
  news_impact_score: number | string;
  one_day_change_percent: number | string;
  five_day_change_percent: number | string;
  twenty_day_change_percent: number | string;
  volume_ratio: number | string;
  breakout_percent: number | string;
  attention_score?: number | string;
  setup_quality_score?: number | string;
  setup_direction?: string;
  reference_price?: number | string;
  support_zone_low?: number | string;
  support_zone_high?: number | string;
  resistance_zone_low?: number | string;
  resistance_zone_high?: number | string;
  historical_edge_score?: number | string;
  confidence_score?: number | string;
  risk_score?: number | string;
  why_in_focus?: string;
  risk_note?: string;
  market_context?: string;
  catalyst_summary?: string;
  research_note: string;
};

type RealtimeSnapshotRow = {
  snapshot_at: string;
  attention_scores?: unknown[];
};

function numberValue(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function mapMarketMoodDetails(details: Record<string, unknown> | undefined): MarketMoodDetails | undefined {
  if (!details) {
    return undefined;
  }

  return {
    mood: stringValue(details.mood, "Sideways") as MarketReport["marketMood"],
    score: numberValue(details.score),
    niftyTrendScore: numberValue(details.nifty_trend_score),
    bankNiftyTrendScore: numberValue(details.bank_nifty_trend_score),
    indiaVixScore: numberValue(details.india_vix_score),
    advanceDeclineScore: numberValue(details.advance_decline_score),
    advanceDeclineRatio: numberValue(details.advance_decline_ratio),
    niftyValue: numberValue(details.nifty_value, NaN),
    niftyChangePercent: numberValue(details.nifty_change_percent, NaN),
    bankNiftyValue: numberValue(details.bank_nifty_value, NaN),
    bankNiftyChangePercent: numberValue(details.bank_nifty_change_percent, NaN),
    indiaVixValue: numberValue(details.india_vix_value, NaN),
    indiaVixChangePercent: numberValue(details.india_vix_change_percent, NaN),
    explanation: stringValue(details.explanation)
  };
}

function mapCatalysts(catalysts: Record<string, unknown> | undefined): CatalystSummary | undefined {
  if (!catalysts) {
    return undefined;
  }

  const rawItems = Array.isArray(catalysts.items) ? catalysts.items : [];
  return {
    score: numberValue(catalysts.score, 50),
    sentiment: stringValue(catalysts.sentiment, "mixed"),
    riskFlags: Array.isArray(catalysts.risk_flags) ? catalysts.risk_flags.filter((item): item is string => typeof item === "string") : [],
    items: rawItems
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        title: stringValue(item.title),
        source: stringValue(item.source, "News"),
        url: stringValue(item.url),
        sentiment: stringValue(item.sentiment, "neutral"),
        score: numberValue(item.score, 50)
      }))
  };
}

function mapOptionCandidate(candidate: Record<string, unknown>): OptionStrikeCandidate {
  return {
    index: stringValue(candidate.index),
    optionType: stringValue(candidate.option_type || candidate.optionType, "CALL") as OptionStrikeCandidate["optionType"],
    strike: numberValue(candidate.strike),
    expiry: stringValue(candidate.expiry),
    lastPrice: numberValue(candidate.last_price || candidate.lastPrice),
    openInterest: numberValue(candidate.open_interest || candidate.openInterest),
    changeInOpenInterest: numberValue(candidate.change_in_open_interest || candidate.changeInOpenInterest),
    volume: numberValue(candidate.volume),
    impliedVolatility: numberValue(candidate.implied_volatility || candidate.impliedVolatility),
    distanceFromSpotPercent: numberValue(candidate.distance_from_spot_percent || candidate.distanceFromSpotPercent),
    score: numberValue(candidate.score),
    confidenceScore: numberValue(candidate.confidence_score || candidate.confidenceScore || candidate.score),
    riskScore: numberValue(candidate.risk_score || candidate.riskScore, 50),
    attentionScore: numberValue(candidate.attention_score || candidate.attentionScore || candidate.score),
    whyInFocus: stringValue(candidate.why_in_focus || candidate.whyInFocus || candidate.reason),
    marketContext: stringValue(candidate.market_context || candidate.marketContext, "Research-only option market context."),
    reason: stringValue(candidate.reason),
    riskNote: stringValue(candidate.risk_note || candidate.riskNote)
  };
}

function mapOptionsResearch(optionsResearch: unknown[] | undefined): IndexOptionResearch[] {
  if (!Array.isArray(optionsResearch)) {
    return [];
  }

  return optionsResearch
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row) => ({
      index: stringValue(row.index),
      spot: numberValue(row.spot),
      expiry: stringValue(row.expiry),
      putCallRatio: numberValue(row.putCallRatio || row.put_call_ratio),
      maxCallOiStrike: numberValue(row.maxCallOiStrike || row.max_call_oi_strike),
      maxPutOiStrike: numberValue(row.maxPutOiStrike || row.max_put_oi_strike),
      maxPainStrike: numberValue(row.maxPainStrike || row.max_pain_strike),
      trendContext: stringValue(row.trendContext || row.trend_context),
      dataStatus: stringValue(row.dataStatus || row.data_status, "unavailable"),
      calls: Array.isArray(row.calls)
        ? row.calls.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object").map(mapOptionCandidate)
        : [],
      puts: Array.isArray(row.puts)
        ? row.puts.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object").map(mapOptionCandidate)
        : [],
      note: stringValue(row.note)
    }));
}

function mapSectorScore(row: SectorScoreRow): SectorScore {
  return {
    id: row.id,
    reportId: row.report_id,
    reportDate: row.report_date,
    session: row.session,
    rank: row.rank,
    sector: row.sector,
    symbol: row.symbol,
    sectorScore: numberValue(row.sector_score),
    relativeStrengthScore: numberValue(row.relative_strength_score),
    momentumScore: numberValue(row.momentum_score),
    trendScore: numberValue(row.trend_score),
    oneDayChangePercent: numberValue(row.one_day_change_percent),
    fiveDayChangePercent: numberValue(row.five_day_change_percent),
    twentyDayChangePercent: numberValue(row.twenty_day_change_percent)
  };
}

function mapStockScore(row: StockScoreRow): StockScore {
  return {
    id: row.id,
    reportId: row.report_id,
    reportDate: row.report_date,
    session: row.session,
    rank: row.rank,
    symbol: row.symbol,
    name: row.name,
    sector: row.sector,
    totalScore: numberValue(row.total_score),
    relativeStrengthScore: numberValue(row.relative_strength_score),
    volumeSpikeScore: numberValue(row.volume_spike_score),
    breakoutScore: numberValue(row.breakout_score),
    trendStrengthScore: numberValue(row.trend_strength_score),
    newsImpactScore: numberValue(row.news_impact_score),
    oneDayChangePercent: numberValue(row.one_day_change_percent),
    fiveDayChangePercent: numberValue(row.five_day_change_percent),
    twentyDayChangePercent: numberValue(row.twenty_day_change_percent),
    volumeRatio: numberValue(row.volume_ratio),
    breakoutPercent: numberValue(row.breakout_percent),
    attentionScore: numberValue(row.attention_score),
    setupQualityScore: numberValue(row.setup_quality_score),
    setupDirection: row.setup_direction ?? "neutral-watch",
    referencePrice: numberValue(row.reference_price),
    supportZoneLow: numberValue(row.support_zone_low),
    supportZoneHigh: numberValue(row.support_zone_high),
    resistanceZoneLow: numberValue(row.resistance_zone_low),
    resistanceZoneHigh: numberValue(row.resistance_zone_high),
    historicalEdgeScore: numberValue(row.historical_edge_score),
    confidenceScore: numberValue(row.confidence_score, numberValue(row.total_score)),
    riskScore: numberValue(row.risk_score, 50),
    whyInFocus: row.why_in_focus ?? row.research_note,
    marketContext: row.market_context ?? "Research-only market context.",
    riskNote: row.risk_note ?? "Research-only risk context.",
    catalystSummary: row.catalyst_summary ?? "Catalyst tone unavailable.",
    researchNote: row.research_note
  };
}

function mapLivePriceItem(row: Record<string, unknown>): LivePriceItem {
  return {
    symbol: stringValue(row.symbol),
    name: stringValue(row.name || row.symbol),
    group: "stock",
    price: numberValue(row.referencePrice || row.reference_price, NaN),
    changePercent: numberValue(row.changePercent || row.change_percent, NaN),
    confidenceScore: numberValue(row.confidenceScore || row.confidence_score, NaN),
    riskScore: numberValue(row.riskScore || row.risk_score, NaN),
    attentionScore: numberValue(row.attentionScore || row.attention_score, NaN)
  };
}

function buildLivePrices(report: MarketReport, stocks: StockScore[], realtimeSnapshot?: RealtimeSnapshotRow | null): LivePriceItem[] {
  const details = report.marketMoodDetails;
  const indices: LivePriceItem[] = [
    {
      symbol: "NIFTY",
      name: "Nifty",
      group: "index",
      price: details?.niftyValue,
      changePercent: details?.niftyChangePercent,
      attentionScore: details?.niftyTrendScore
    },
    {
      symbol: "BANKNIFTY",
      name: "Bank Nifty",
      group: "index",
      price: details?.bankNiftyValue,
      changePercent: details?.bankNiftyChangePercent,
      attentionScore: details?.bankNiftyTrendScore
    },
    {
      symbol: "INDIA VIX",
      name: "India VIX",
      group: "index",
      price: details?.indiaVixValue,
      changePercent: details?.indiaVixChangePercent,
      attentionScore: details?.indiaVixScore
    }
  ];

  const realtimeRows = Array.isArray(realtimeSnapshot?.attention_scores)
    ? realtimeSnapshot.attention_scores
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map(mapLivePriceItem)
        .filter((item) => item.symbol)
    : [];

  const stockRows = realtimeRows.length > 0
    ? realtimeRows
    : stocks.slice(0, 8).map((stock) => ({
        symbol: stock.symbol,
        name: stock.name,
        group: "stock" as const,
        price: stock.referencePrice,
        changePercent: stock.oneDayChangePercent,
        confidenceScore: stock.confidenceScore,
        riskScore: stock.riskScore,
        attentionScore: stock.attentionScore
      }));

  return [...indices, ...stockRows.slice(0, 8)];
}

function mapReportSummary(row: ReportRow): DashboardReportSummary {
  return {
    id: row.id,
    reportDate: row.report_date,
    session: row.session,
    marketMood: row.market_mood,
    sectorInFocus: row.sector_in_focus,
    createdAt: row.created_at
  };
}

function getReportStalenessMessage(report: MarketReport) {
  if (process.env.ALLOW_STALE_MARKET_REPORTS === "true") {
    return undefined;
  }

  return getPreMarketStaleMessage(report);
}

function assertReportIsCurrent(report: MarketReport) {
  const status = getPreMarketBriefStatus(report);
  if (status === "stale" || status === "waiting") {
    const staleMessage = getReportStalenessMessage(report) ?? "Latest market report is not current.";
    throw new Error(staleMessage);
  }
}

function isMissingOptionsResearchColumn(error: { message?: string; code?: string } | null) {
  return Boolean(
    error &&
      (error.message?.includes("options_research") ||
        error.message?.includes("market_reports.options_research") ||
        error.code === "PGRST204")
  );
}

function isMissingTradeIntelligenceColumn(error: { message?: string; code?: string } | null) {
  return Boolean(
    error &&
      (error.message?.includes("confidence_score") ||
        error.message?.includes("risk_score") ||
        error.message?.includes("why_in_focus") ||
        error.message?.includes("market_context") ||
        error.code === "PGRST204")
  );
}

async function fetchLatestReportRow(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const response = await supabase
    .from("market_reports")
    .select(reportSelect)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!isMissingOptionsResearchColumn(response.error)) {
    return response;
  }

  return supabase
    .from("market_reports")
    .select(reportSelectWithoutOptionsResearch)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function getLatestReport(): Promise<MarketReport> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const { data, error } = await fetchLatestReportRow(supabase);

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("No live market report found. Run the scanner to create the first report.");
  }

  const report = mapReportRow(data as unknown as ReportRow);
  assertReportIsCurrent(report);
  return report;
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const { data: latestReport, error: reportError } = await fetchLatestReportRow(supabase);

  if (reportError) {
    throw new Error(reportError.message);
  }

  if (!latestReport) {
    throw new Error("No live market report found. Run the scanner to create the first report.");
  }

  const report = mapReportRow(latestReport as unknown as ReportRow);
  const reportId = report.id;

  const [sectorResponse, stockResponse, recentReportsResponse] = await Promise.all([
    supabase.from("sector_scores").select(sectorScoreSelect).eq("report_id", reportId).order("rank", { ascending: true }),
    supabase.from("stock_scores").select(stockScoreSelect).eq("report_id", reportId).order("rank", { ascending: true }).limit(20),
    supabase.from("market_reports").select(reportSummarySelect).order("created_at", { ascending: false }).limit(6)
  ]);

  if (sectorResponse.error) {
    throw new Error(sectorResponse.error.message);
  }

  let stockRows = stockResponse.data;
  if (isMissingTradeIntelligenceColumn(stockResponse.error)) {
    const fallbackStockResponse = await supabase
      .from("stock_scores")
      .select(stockScoreSelectWithoutTradeIntelligence)
      .eq("report_id", reportId)
      .order("rank", { ascending: true })
      .limit(20);
    if (fallbackStockResponse.error) {
      throw new Error(fallbackStockResponse.error.message);
    }
    stockRows = fallbackStockResponse.data;
  } else if (stockResponse.error) {
    throw new Error(stockResponse.error.message);
  }

  if (recentReportsResponse.error) {
    throw new Error(recentReportsResponse.error.message);
  }

  const { data: realtimeSnapshot } = await supabase
    .from("realtime_market_snapshots")
    .select("snapshot_at,attention_scores")
    .order("snapshot_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const mappedSectors = ((sectorResponse.data ?? []) as unknown as SectorScoreRow[]).map(mapSectorScore);
  const mappedStocks = ((stockRows ?? []) as unknown as StockScoreRow[]).map(mapStockScore);
  const preMarketBrief = buildPreMarketBrief(report, mappedSectors);
  const staleMessage = getReportStalenessMessage(report);

  return {
    report,
    sectorScores: mappedSectors,
    stockScores: mappedStocks,
    recentReports: ((recentReportsResponse.data ?? []) as unknown as ReportRow[]).map(mapReportSummary),
    livePrices: buildLivePrices(report, mappedStocks, realtimeSnapshot as RealtimeSnapshotRow | null),
    liveUpdatedAt: (realtimeSnapshot as RealtimeSnapshotRow | null)?.snapshot_at ?? report.createdAt,
    staleMessage,
    preMarketBrief
  };
}
