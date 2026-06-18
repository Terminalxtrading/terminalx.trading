export type StockFocus = {
  symbol: string;
  name: string;
  sector?: string;
  changePercent: number;
  volumeRatio: number;
  totalScore?: number;
  relativeStrengthScore?: number;
  breakoutScore?: number;
  trendStrengthScore?: number;
  newsImpactScore?: number;
  attentionScore?: number;
  setupQualityScore?: number;
  setupDirection?: string;
  referencePrice?: number;
  supportZoneLow?: number;
  supportZoneHigh?: number;
  resistanceZoneLow?: number;
  resistanceZoneHigh?: number;
  historicalEdgeScore?: number;
  confidenceScore?: number;
  riskScore?: number;
  whyInFocus?: string;
  marketContext?: string;
  riskNote?: string;
  catalystSummary?: string;
  reason: string;
};

export type ReportSession = "morning" | "midday" | "intraday" | "closing";

export type WatchlistItem = {
  symbol: string;
  name: string;
  note: string;
  changePercent?: number;
};

export type MarketReport = {
  id?: string;
  reportDate: string;
  session: ReportSession;
  marketMood: "Bullish" | "Bearish" | "Sideways";
  marketMoodDetails?: MarketMoodDetails;
  sectorInFocus: string;
  stocksInFocus: StockFocus[];
  extremeMovementAlerts: StockFocus[];
  watchlist: WatchlistItem[];
  catalysts?: CatalystSummary;
  optionsResearch: IndexOptionResearch[];
  summary: string;
  createdAt?: string;
};

export type CatalystItem = {
  title: string;
  source: string;
  url: string;
  sentiment: string;
  score: number;
};

export type CatalystSummary = {
  score: number;
  sentiment: string;
  riskFlags: string[];
  items: CatalystItem[];
};

export type OptionStrikeCandidate = {
  index: string;
  optionType: "CALL" | "PUT";
  strike: number;
  expiry: string;
  lastPrice: number;
  openInterest: number;
  changeInOpenInterest: number;
  volume: number;
  impliedVolatility: number;
  distanceFromSpotPercent: number;
  score: number;
  confidenceScore: number;
  riskScore: number;
  attentionScore: number;
  whyInFocus: string;
  marketContext: string;
  reason: string;
  riskNote: string;
};

export type IndexOptionResearch = {
  index: string;
  spot: number;
  expiry: string;
  putCallRatio: number;
  maxCallOiStrike: number;
  maxPutOiStrike: number;
  maxPainStrike: number;
  trendContext: string;
  dataStatus: string;
  calls: OptionStrikeCandidate[];
  puts: OptionStrikeCandidate[];
  note: string;
};

export type MarketMoodDetails = {
  mood: MarketReport["marketMood"];
  score: number;
  niftyTrendScore: number;
  bankNiftyTrendScore: number;
  indiaVixScore: number;
  advanceDeclineScore: number;
  advanceDeclineRatio: number;
  niftyValue?: number;
  niftyChangePercent?: number;
  bankNiftyValue?: number;
  bankNiftyChangePercent?: number;
  indiaVixValue?: number;
  indiaVixChangePercent?: number;
  explanation: string;
};

export type SectorScore = {
  id?: string;
  reportId?: string;
  reportDate: string;
  session: ReportSession;
  rank: number;
  sector: string;
  symbol: string;
  sectorScore: number;
  relativeStrengthScore: number;
  momentumScore: number;
  trendScore: number;
  oneDayChangePercent: number;
  fiveDayChangePercent: number;
  twentyDayChangePercent: number;
};

export type StockScore = {
  id?: string;
  reportId?: string;
  reportDate: string;
  session: ReportSession;
  rank: number;
  symbol: string;
  name: string;
  sector: string;
  totalScore: number;
  relativeStrengthScore: number;
  volumeSpikeScore: number;
  breakoutScore: number;
  trendStrengthScore: number;
  newsImpactScore: number;
  oneDayChangePercent: number;
  fiveDayChangePercent: number;
  twentyDayChangePercent: number;
  volumeRatio: number;
  breakoutPercent: number;
  attentionScore: number;
  setupQualityScore: number;
  setupDirection: string;
  referencePrice: number;
  supportZoneLow: number;
  supportZoneHigh: number;
  resistanceZoneLow: number;
  resistanceZoneHigh: number;
  historicalEdgeScore: number;
  confidenceScore: number;
  riskScore: number;
  whyInFocus: string;
  marketContext: string;
  riskNote: string;
  catalystSummary: string;
  researchNote: string;
};

export type DashboardReportSummary = {
  id?: string;
  reportDate: string;
  session: ReportSession;
  marketMood: MarketReport["marketMood"];
  sectorInFocus: string;
  createdAt?: string;
};

export type DashboardData = {
  report: MarketReport;
  sectorScores: SectorScore[];
  stockScores: StockScore[];
  recentReports: DashboardReportSummary[];
  livePrices: LivePriceItem[];
  liveUpdatedAt?: string;
  staleMessage?: string;
};

export type LivePriceItem = {
  symbol: string;
  name: string;
  group: "index" | "stock";
  price?: number;
  changePercent?: number;
  confidenceScore?: number;
  riskScore?: number;
  attentionScore?: number;
};

export type AlertPriority = "Critical" | "High" | "Medium" | "Low";

export type NotificationStatus = "created" | "sent" | "failed" | "duplicate" | "skipped";

export type NotificationHistoryItem = {
  id: string;
  reportId?: string | null;
  alertKey: string;
  priority: AlertPriority;
  title: string;
  reason: string;
  sector: string;
  stocksAffected: string[];
  alertType: string;
  triggerValue: number;
  thresholdValue: number;
  notificationStatus: NotificationStatus;
  sentCount: number;
  failedCount: number;
  errorMessage?: string | null;
  triggeredAt: string;
  createdAt: string;
};

export type NotificationAnalytics = {
  total: number;
  byPriority: Record<AlertPriority, number>;
  byStatus: Record<NotificationStatus, number>;
  recent: NotificationHistoryItem[];
};

export type WatchlistStock = {
  id: string;
  symbol: string;
  name: string;
  isTracked: boolean;
  trendScore: number;
  momentumScore: number;
  relativeStrengthScore: number;
  volumeScore: number;
  healthScore: number;
  oneDayChangePercent: number;
  fiveDayChangePercent: number;
  twentyDayChangePercent: number;
  volumeRatio: number;
  latestClose: number;
  researchNote: string;
  lastScannedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WatchlistDashboardData = {
  stocks: WatchlistStock[];
  healthScore: number;
  trackedCount: number;
};
