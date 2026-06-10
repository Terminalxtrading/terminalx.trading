import { getSupabaseAdmin } from "@/lib/supabase";
import type { DashboardData, DashboardReportSummary, MarketMoodDetails, MarketReport, SectorScore, StockScore } from "@/lib/types";

type ReportRow = {
  id: string;
  report_date: string;
  session: "morning" | "closing";
  market_mood: MarketReport["marketMood"];
  market_mood_details?: Record<string, unknown>;
  sector_in_focus: string;
  stocks_in_focus: MarketReport["stocksInFocus"];
  extreme_movement_alerts: MarketReport["extremeMovementAlerts"];
  watchlist: MarketReport["watchlist"];
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
    summary: row.summary,
    createdAt: row.created_at
  };
}

type SectorScoreRow = {
  id: string;
  report_id: string;
  report_date: string;
  session: "morning" | "closing";
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
  session: "morning" | "closing";
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
  research_note: string;
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
    researchNote: row.research_note
  };
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

export async function getLatestReport(): Promise<MarketReport> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const { data, error } = await supabase
    .from("market_reports")
    .select(reportSelect)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("No live market report found. Run the scanner to create the first report.");
  }

  return mapReportRow(data as unknown as ReportRow);
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const { data: latestReport, error: reportError } = await supabase
    .from("market_reports")
    .select(reportSelect)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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

  if (stockResponse.error) {
    throw new Error(stockResponse.error.message);
  }

  if (recentReportsResponse.error) {
    throw new Error(recentReportsResponse.error.message);
  }

  return {
    report,
    sectorScores: ((sectorResponse.data ?? []) as unknown as SectorScoreRow[]).map(mapSectorScore),
    stockScores: ((stockResponse.data ?? []) as unknown as StockScoreRow[]).map(mapStockScore),
    recentReports: ((recentReportsResponse.data ?? []) as unknown as ReportRow[]).map(mapReportSummary)
  };
}
