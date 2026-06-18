import type {
  MarketReport,
  OptionStrikeCandidate,
  PreMarketBrief,
  PreMarketBriefStatus,
  PreferredSide,
  RiskLevel,
  SectorScore
} from "@/lib/types";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const PREMARKET_EXPECTATION_MINUTES = 8 * 60 + 30;
const MARKET_OPEN_MINUTES = 9 * 60 + 15;

function istParts(now = new Date()) {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const date = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()));
  const minutes = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();

  return {
    date,
    minutes,
    weekday: date.getUTCDay()
  };
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function previousTradingDate(now = new Date()) {
  const { date } = istParts(now);
  date.setUTCDate(date.getUTCDate() - 1);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return isoDate(date);
}

function todayTradingDate(now = new Date()) {
  return isoDate(istParts(now).date);
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function topOptionIdeas(options: MarketReport["optionsResearch"], optionType: "CALL" | "PUT") {
  const rows = options
    .filter((item) => item.dataStatus === "ok")
    .flatMap((item) => (optionType === "CALL" ? item.calls : item.puts))
    .sort((left, right) => {
      const rightScore = right.score + right.confidenceScore * 0.35 - right.riskScore * 0.15;
      const leftScore = left.score + left.confidenceScore * 0.35 - left.riskScore * 0.15;
      return rightScore - leftScore;
    });

  return rows.slice(0, 3);
}

function pcrAverage(options: MarketReport["optionsResearch"]) {
  return average(options.filter((item) => item.dataStatus === "ok").map((item) => item.putCallRatio));
}

function maxOptionScore(rows: OptionStrikeCandidate[]) {
  return average(rows.map((row) => row.score));
}

function confidenceFromAlignment(alignmentScore: number, callStrength: number, putStrength: number, riskPenalty: number) {
  return Math.max(0, Math.min(100, Math.round(alignmentScore * 0.55 + Math.max(callStrength, putStrength) * 0.35 - riskPenalty * 0.2)));
}

function riskLevelFromPenalty(penalty: number): RiskLevel {
  if (penalty >= 65) {
    return "High";
  }
  if (penalty >= 40) {
    return "Medium";
  }
  return "Low";
}

export function getPreMarketBriefStatus(report: MarketReport, now = new Date()): PreMarketBriefStatus {
  const { weekday, minutes } = istParts(now);
  const todayDate = todayTradingDate(now);
  const previousDate = previousTradingDate(now);

  if (weekday === 0 || weekday === 6) {
    return report.reportDate >= previousDate ? "current" : "stale";
  }

  if (minutes < PREMARKET_EXPECTATION_MINUTES) {
    return report.reportDate >= previousDate ? "current" : "stale";
  }

  if (minutes < MARKET_OPEN_MINUTES) {
    return report.reportDate === todayDate && report.session === "morning" ? "current" : "waiting";
  }

  return report.reportDate === todayDate ? "current" : "stale";
}

export function getPreMarketStaleMessage(report: MarketReport, now = new Date()) {
  const status = getPreMarketBriefStatus(report, now);

  if (status === "waiting") {
    return "Today morning pre-market report has not been generated yet.";
  }

  if (status === "stale") {
    const expectedDate = todayTradingDate(now);
    return `Latest market report is stale (${report.reportDate}). Expected a fresh report for ${expectedDate}.`;
  }

  return undefined;
}

export function buildPreMarketBrief(report: MarketReport, sectors: SectorScore[], now = new Date()): PreMarketBrief {
  const status = getPreMarketBriefStatus(report, now);
  const details = report.marketMoodDetails;
  const callIdeas = topOptionIdeas(report.optionsResearch, "CALL");
  const putIdeas = topOptionIdeas(report.optionsResearch, "PUT");
  const topSectors = [...sectors].sort((left, right) => left.rank - right.rank).slice(0, 3);
  const pcr = pcrAverage(report.optionsResearch);
  const callStrength = maxOptionScore(callIdeas);
  const putStrength = maxOptionScore(putIdeas);
  const trendComposite = average([details?.niftyTrendScore ?? 50, details?.bankNiftyTrendScore ?? 50]);
  const vixScore = details?.indiaVixScore ?? 50;
  const vixChange = details?.indiaVixChangePercent ?? 0;
  const catalystScore = report.catalysts?.score ?? 50;
  const sectorComposite = average(topSectors.map((sector) => sector.sectorScore));
  const riskFlags = report.catalysts?.riskFlags ?? [];
  const warnings: string[] = [];
  const reasons: string[] = [];
  const signalStrength = average([trendComposite, details?.score ?? 50, sectorComposite, catalystScore]);

  if (status === "waiting") {
    warnings.push("Today morning pre-market report has not been generated yet.");
  } else if (status === "stale") {
    warnings.push(`Latest report date is ${report.reportDate}; do not treat it as current pre-market research.`);
  }

  if (riskFlags.length > 0) {
    warnings.push(...riskFlags.slice(0, 3).map((flag) => `Risk flag: ${flag}`));
  }

  if (vixScore < 45 || vixChange >= 5) {
    warnings.push("Volatility risk is elevated; intraday direction can flip quickly.");
  }

  if (callIdeas.length === 0 || putIdeas.length === 0) {
    warnings.push("Options coverage is incomplete; bias confidence is reduced.");
  }

  if (pcr > 1.2) {
    reasons.push(`PCR is supportive for bullish continuation at ${pcr.toFixed(2)}.`);
  } else if (pcr > 0 && pcr < 0.85) {
    reasons.push(`PCR is defensive at ${pcr.toFixed(2)}, which favors bearish or cautious setups.`);
  }

  if (trendComposite >= 60) {
    reasons.push(`Index trend scores are strong at ${Math.round(trendComposite)}/100.`);
  } else if (trendComposite <= 45) {
    reasons.push(`Index trend scores are weak at ${Math.round(trendComposite)}/100.`);
  } else {
    reasons.push(`Index trend scores are mixed at ${Math.round(trendComposite)}/100.`);
  }

  if (topSectors.length > 0) {
    reasons.push(`Top sectors are ${topSectors.map((sector) => sector.sector).join(", ")}.`);
  }

  const riskPenalty = average([
    100 - vixScore,
    100 - catalystScore,
    riskFlags.length * 15,
    status === "current" ? 0 : status === "waiting" ? 35 : 55
  ]);

  let preferredSide: PreferredSide = "WAIT";

  const bullishSetup =
    report.marketMood === "Bullish" &&
    trendComposite >= 60 &&
    vixScore >= 50 &&
    callStrength >= putStrength + 4 &&
    (Number.isNaN(pcr) || pcr >= 0.9);

  const bearishSetup =
    report.marketMood === "Bearish" &&
    trendComposite <= 45 &&
    putStrength >= callStrength + 4 &&
    (Number.isNaN(pcr) || pcr <= 1.05);

  if (status === "current" && bullishSetup && riskPenalty < 55) {
    preferredSide = "CALL";
    reasons.push(`CALL side scores are stronger than PUT side scores (${Math.round(callStrength)} vs ${Math.round(putStrength)}).`);
  } else if (status === "current" && bearishSetup && riskPenalty < 60) {
    preferredSide = "PUT";
    reasons.push(`PUT side scores are stronger than CALL side scores (${Math.round(putStrength)} vs ${Math.round(callStrength)}).`);
  } else {
    preferredSide = "WAIT";
    reasons.push("Signals are mixed, stale, or risk-adjusted edge is not strong enough for a pre-open directional bet.");
  }

  const confidenceScore = confidenceFromAlignment(signalStrength, callStrength, putStrength, riskPenalty);
  const riskLevel = riskLevelFromPenalty(riskPenalty);

  const summary =
    preferredSide === "CALL"
      ? "Pre-market research leans bullish. CALL-side setups are stronger than PUTs, but this is decision support only."
      : preferredSide === "PUT"
        ? "Pre-market research leans bearish. PUT-side setups are stronger than CALLs, but this is decision support only."
        : "Pre-market research is not aligned enough for a directional call. WAIT is safer until the opening picture is clearer.";

  return {
    status,
    reportDate: report.reportDate,
    session: report.session,
    marketBias: report.marketMood,
    preferredSide,
    confidenceScore,
    riskLevel,
    summary,
    reasons: reasons.slice(0, 5),
    callIdeas,
    putIdeas,
    topSectors,
    warnings: warnings.slice(0, 5)
  };
}
