import { getSupabaseAdmin } from "@/lib/supabase";
import type { WatchlistDashboardData, WatchlistStock } from "@/lib/types";

type ChartSeries = {
  symbol: string;
  closes: number[];
  volumes: number[];
};

type WatchlistRow = {
  id: string;
  symbol: string;
  name: string;
  is_tracked: boolean;
  trend_score: number | string;
  momentum_score: number | string;
  relative_strength_score: number | string;
  volume_score: number | string;
  health_score: number | string;
  one_day_change_percent: number | string;
  five_day_change_percent: number | string;
  twenty_day_change_percent: number | string;
  volume_ratio: number | string;
  latest_close: number | string;
  research_note: string;
  last_scanned_at: string | null;
  created_at: string;
  updated_at: string;
};

const watchlistSelect = [
  "id",
  "symbol",
  "name",
  "is_tracked",
  "trend_score",
  "momentum_score",
  "relative_strength_score",
  "volume_score",
  "health_score",
  "one_day_change_percent",
  "five_day_change_percent",
  "twenty_day_change_percent",
  "volume_ratio",
  "latest_close",
  "research_note",
  "last_scanned_at",
  "created_at",
  "updated_at"
].join(",");

function numberValue(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function mean(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function changePercent(series: ChartSeries, periods: number) {
  if (series.closes.length <= periods) {
    return 0;
  }
  const start = series.closes[series.closes.length - periods - 1];
  const end = series.closes[series.closes.length - 1];
  if (!start) {
    return 0;
  }
  return ((end - start) / start) * 100;
}

function sma(series: ChartSeries, periods: number) {
  return mean(series.closes.slice(-periods));
}

function volumeRatio(series: ChartSeries) {
  const latestVolume = series.volumes[series.volumes.length - 1] ?? 0;
  const averageVolume = mean(series.volumes.slice(-21, -1));
  if (!averageVolume) {
    return 1;
  }
  return latestVolume / averageVolume;
}

function normalizeSymbol(symbol: string) {
  const trimmed = symbol.trim().toUpperCase();
  if (trimmed.startsWith("^") || trimmed.endsWith(".NS") || trimmed.endsWith(".BO")) {
    return trimmed;
  }
  return `${trimmed}.NS`;
}

function mapWatchlistRow(row: WatchlistRow): WatchlistStock {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    isTracked: row.is_tracked,
    trendScore: numberValue(row.trend_score),
    momentumScore: numberValue(row.momentum_score),
    relativeStrengthScore: numberValue(row.relative_strength_score),
    volumeScore: numberValue(row.volume_score),
    healthScore: numberValue(row.health_score),
    oneDayChangePercent: numberValue(row.one_day_change_percent),
    fiveDayChangePercent: numberValue(row.five_day_change_percent),
    twentyDayChangePercent: numberValue(row.twenty_day_change_percent),
    volumeRatio: numberValue(row.volume_ratio),
    latestClose: numberValue(row.latest_close),
    researchNote: row.research_note,
    lastScannedAt: row.last_scanned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function fetchChart(symbol: string): Promise<ChartSeries> {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", "6mo");
  url.searchParams.set("interval", "1d");

  const response = await fetch(url, {
    headers: { "User-Agent": "TerminalXTradingWatchlist/1.0" },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch chart data for ${symbol}.`);
  }

  const payload = await response.json();
  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const closes = cleanNumbers(quote?.close ?? []);
  const volumes = cleanNumbers(quote?.volume ?? []);

  if (closes.length < 22) {
    throw new Error(`Not enough chart data for ${symbol}.`);
  }

  return { symbol, closes, volumes };
}

function cleanNumbers(values: unknown[]) {
  return values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
}

async function calculateScores(symbol: string, name?: string) {
  const [stock, benchmark] = await Promise.all([fetchChart(symbol), fetchChart("^NSEI")]);
  const stock20d = changePercent(stock, 20);
  const benchmark20d = changePercent(benchmark, 20);
  const ratio = volumeRatio(stock);
  const sma20 = sma(stock, 20);
  const sma50 = sma(stock, 50);
  const latest = stock.closes[stock.closes.length - 1];

  const trendScore = sma20 && sma50 ? clamp(50 + (((latest - sma20) / sma20) * 100 * 4) + (((sma20 - sma50) / sma50) * 100 * 3)) : 50;
  const momentumScore = clamp(50 + changePercent(stock, 5) * 5 + stock20d * 2);
  const relativeStrengthScore = clamp(50 + (stock20d - benchmark20d) * 5);
  const volumeScore = clamp(35 + ratio * 25);
  const healthScore = clamp((trendScore * 0.3) + (momentumScore * 0.25) + (relativeStrengthScore * 0.3) + (volumeScore * 0.15));

  return {
    symbol,
    name: name?.trim() || symbol.replace(".NS", ""),
    trend_score: round(trendScore),
    momentum_score: round(momentumScore),
    relative_strength_score: round(relativeStrengthScore),
    volume_score: round(volumeScore),
    health_score: round(healthScore),
    one_day_change_percent: round(changePercent(stock, 1)),
    five_day_change_percent: round(changePercent(stock, 5)),
    twenty_day_change_percent: round(stock20d),
    volume_ratio: round(ratio),
    latest_close: round(latest),
    research_note: buildResearchNote(healthScore, trendScore, momentumScore, relativeStrengthScore, volumeScore),
    last_scanned_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function buildResearchNote(health: number, trend: number, momentum: number, rs: number, volume: number) {
  const signals: string[] = [];
  if (trend >= 60) signals.push("trend support");
  if (momentum >= 60) signals.push("momentum support");
  if (rs >= 60) signals.push("relative strength");
  if (volume >= 70) signals.push("volume expansion");
  if (signals.length === 0) signals.push("mixed conditions");
  return `Watchlist health ${health.toFixed(0)}/100: ${signals.join(", ")}. Research only.`;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export async function getWatchlistDashboard(): Promise<WatchlistDashboardData> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const { data, error } = await supabase.from("watchlist_stocks").select(watchlistSelect).order("health_score", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }

  const stocks = ((data ?? []) as unknown as WatchlistRow[]).map(mapWatchlistRow);
  const tracked = stocks.filter((stock) => stock.isTracked);
  const healthScore = tracked.length ? mean(tracked.map((stock) => stock.healthScore)) : 0;

  return {
    stocks,
    trackedCount: tracked.length,
    healthScore: round(healthScore)
  };
}

export async function addWatchlistStock(input: { symbol: string; name?: string }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const symbol = normalizeSymbol(input.symbol);
  const scores = await calculateScores(symbol, input.name);
  const { data, error } = await supabase
    .from("watchlist_stocks")
    .upsert({ ...scores, is_tracked: true }, { onConflict: "symbol" })
    .select(watchlistSelect)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapWatchlistRow(data as unknown as WatchlistRow);
}

export async function removeWatchlistStock(id: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const { error } = await supabase.from("watchlist_stocks").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function trackWatchlistStock(id: string, isTracked: boolean) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const { data: existing, error: readError } = await supabase.from("watchlist_stocks").select("symbol,name").eq("id", id).single();
  if (readError) {
    throw new Error(readError.message);
  }

  const scores = await calculateScores(existing.symbol, existing.name);
  const { data, error } = await supabase
    .from("watchlist_stocks")
    .update({ ...scores, is_tracked: isTracked })
    .eq("id", id)
    .select(watchlistSelect)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapWatchlistRow(data as unknown as WatchlistRow);
}
