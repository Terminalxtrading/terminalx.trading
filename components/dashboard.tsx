"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  BellRing,
  CalendarDays,
  Clock3,
  Gauge,
  LineChart,
  Newspaper,
  RefreshCw,
  TrendingUp
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PushButton } from "@/components/push-button";
import type { DashboardData, DashboardReportSummary, IndexOptionResearch, LivePriceItem, OptionStrikeCandidate, SectorScore, StockFocus, StockScore } from "@/lib/types";

const MARKET_TIME_ZONE = "Asia/Kolkata";
const DASHBOARD_REFRESH_MS = 30_000;

function pct(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/a";
  }
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function score(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  return value.toFixed(0);
}

function numberLabel(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/a";
  }
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function timeLabel(value: string | undefined) {
  if (!value) {
    return "n/a";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "n/a";
  }
  return parsed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: MARKET_TIME_ZONE });
}

function isMarketHours(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MARKET_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday = values.weekday;
  const hour = Number(values.hour);
  const minute = Number(values.minute);

  if (weekday === "Sat" || weekday === "Sun" || Number.isNaN(hour) || Number.isNaN(minute)) {
    return false;
  }

  const totalMinutes = hour * 60 + minute;
  return totalMinutes >= 9 * 60 + 15 && totalMinutes <= 15 * 60 + 30;
}

function scoreTone(value: number) {
  if (value >= 65) {
    return "border-mint/30 bg-mint/15 text-ink";
  }
  if (value <= 45) {
    return "border-coral/30 bg-coral/15 text-ink";
  }
  return "border-gold/30 bg-gold/15 text-ink";
}

function riskTone(value: number) {
  if (value >= 70) {
    return "border-coral/30 bg-coral/15 text-ink";
  }
  if (value <= 40) {
    return "border-mint/30 bg-mint/15 text-ink";
  }
  return "border-gold/30 bg-gold/15 text-ink";
}

function heatColor(value: number) {
  if (value >= 75) return "bg-emerald-700 text-white";
  if (value >= 65) return "bg-emerald-600 text-white";
  if (value >= 55) return "bg-emerald-100 text-ink";
  if (value >= 45) return "bg-amber-100 text-ink";
  if (value >= 35) return "bg-red-100 text-ink";
  return "bg-red-700 text-white";
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-md border border-ink/15 bg-white p-4 shadow-sm ${className}`}>{children}</section>;
}

function WidgetTitle({ icon, title, aside }: { icon: React.ReactNode; title: string; aside?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex min-w-0 items-center gap-2 text-base font-bold text-ink">
        {icon}
        <span className="truncate">{title}</span>
      </h2>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <main className="min-h-screen bg-paper px-3 py-4 sm:px-4 sm:py-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="h-28 animate-pulse rounded-md bg-white" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-md bg-white" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
          <div className="h-96 animate-pulse rounded-md bg-white" />
          <div className="h-96 animate-pulse rounded-md bg-white" />
        </div>
      </div>
    </main>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="min-h-screen bg-paper px-3 py-6 sm:px-4 sm:py-8">
      <div className="mx-auto max-w-3xl rounded-md border border-coral/30 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-coral" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-ink">Dashboard data unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-ink/70">{message}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/90"
            >
              <RefreshCw className="size-4" />
              Retry
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function OverviewCard({
  label,
  value,
  change,
  detail,
  icon
}: {
  label: string;
  value: string;
  change?: number;
  detail?: string;
  icon: React.ReactNode;
}) {
  const positive = typeof change === "number" && change >= 0;

  return (
    <Card className="p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink/65">
          {icon}
          {label}
        </div>
        {typeof change === "number" && !Number.isNaN(change) ? (
          <span className={positive ? "text-sm font-bold text-mint" : "text-sm font-bold text-coral"}>
            {pct(change)}
          </span>
        ) : null}
      </div>
      <div className="mt-3 text-2xl font-bold text-ink sm:mt-4">{value}</div>
      {detail ? <div className="mt-2 text-xs font-semibold text-ink/55">{detail}</div> : null}
    </Card>
  );
}

function LivePriceStrip({ prices, updatedAt }: { prices: LivePriceItem[]; updatedAt?: string }) {
  return (
    <Card className="p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <WidgetTitle icon={<Activity className="size-5 text-mint" />} title="Live Price Watch" aside={null} />
        <div className="flex items-center gap-1 text-xs font-semibold text-ink/55">
          <Clock3 className="size-3.5" />
          {timeLabel(updatedAt)}
        </div>
      </div>
      {prices.length === 0 ? (
        <EmptyState text="No live price rows available yet." />
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {prices.map((item) => (
            <div key={`${item.group}-${item.symbol}`} className="min-w-40 rounded-md border border-ink/10 bg-paper p-3 sm:min-w-44">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-ink">{item.symbol}</div>
                  <div className="mt-1 truncate text-xs text-ink/50">{item.name}</div>
                </div>
                <span className={`rounded border px-1.5 py-0.5 text-[11px] font-bold uppercase ${item.group === "index" ? "border-river/25 bg-river/10 text-river" : "border-ink/10 bg-white text-ink/55"}`}>
                  {item.group}
                </span>
              </div>
              <div className="mt-3 text-xl font-black text-ink">{numberLabel(item.price)}</div>
              <div className={typeof item.changePercent === "number" && item.changePercent >= 0 ? "mt-1 text-sm font-bold text-mint" : "mt-1 text-sm font-bold text-coral"}>
                {pct(item.changePercent)}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-1 text-[11px]">
                <div className="rounded bg-white px-2 py-1">
                  <span className="block font-semibold text-ink/45">Conf</span>
                  <span className="font-black text-ink">{score(item.confidenceScore ?? item.attentionScore)}</span>
                </div>
                <div className="rounded bg-white px-2 py-1">
                  <span className="block font-semibold text-ink/45">Risk</span>
                  <span className="font-black text-ink">{score(item.riskScore)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SectorHeatmap({ sectors }: { sectors: SectorScore[] }) {
  return (
    <Card className="scroll-mt-4">
      <WidgetTitle icon={<BarChart3 className="size-5 text-river" />} title="Sector Heatmap" />
      {sectors.length === 0 ? (
        <EmptyState text="No sector rankings have been saved yet." />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {sectors.map((sector) => (
            <div key={sector.sector} className={`min-h-24 rounded-md p-3 sm:min-h-28 ${heatColor(sector.sectorScore)}`}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-bold leading-5">{sector.sector}</h3>
                <span className="rounded bg-white/20 px-2 py-1 text-xs font-bold">#{sector.rank}</span>
              </div>
              <div className="mt-3 text-2xl font-black sm:mt-4 sm:text-3xl">{score(sector.sectorScore)}</div>
              <div className="mt-2 text-xs opacity-90">RS {score(sector.relativeStrengthScore)} · MOM {score(sector.momentumScore)}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function TopSectors({ sectors }: { sectors: SectorScore[] }) {
  return (
    <Card>
      <WidgetTitle icon={<TrendingUp className="size-5 text-mint" />} title="Top Sectors" />
      <div className="space-y-3">
        {sectors.slice(0, 5).map((sector) => (
          <div key={sector.sector} className="rounded-md bg-paper p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold">{sector.sector}</div>
                <div className="mt-1 text-xs text-ink/55">20D {pct(sector.twentyDayChangePercent)}</div>
              </div>
              <span className={`rounded-md border px-2.5 py-1 text-sm font-bold ${scoreTone(sector.sectorScore)}`}>{score(sector.sectorScore)}</span>
            </div>
          </div>
        ))}
        {sectors.length === 0 ? <EmptyState text="No sector rows available." /> : null}
      </div>
    </Card>
  );
}

function TopStocks({ stocks }: { stocks: StockScore[] }) {
  return (
    <Card>
      <WidgetTitle icon={<LineChart className="size-5 text-river" />} title="Top Stocks In Focus" />
      {stocks.length === 0 ? (
        <EmptyState text="No stock rankings have been saved yet." />
      ) : (
        <>
          <div className="space-y-2 sm:hidden">
            {stocks.slice(0, 20).map((stock) => (
              <article key={stock.symbol} className="rounded-md border border-ink/10 bg-paper p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-ink/45">#{stock.rank}</span>
                      <h3 className="truncate text-base font-black text-ink">{stock.symbol}</h3>
                    </div>
                    <p className="mt-1 truncate text-xs text-ink/55">{stock.name}</p>
                  </div>
                  <span className={`rounded-md border px-2 py-1 text-sm font-bold ${scoreTone(stock.totalScore)}`}>{score(stock.totalScore)}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-white p-2">
                    <div className="font-semibold text-ink/50">Move</div>
                    <div className={stock.oneDayChangePercent >= 0 ? "mt-1 font-black text-mint" : "mt-1 font-black text-coral"}>{pct(stock.oneDayChangePercent)}</div>
                  </div>
                  <div className="rounded bg-white p-2">
                    <div className="font-semibold text-ink/50">Volume</div>
                    <div className="mt-1 font-black text-ink">{stock.volumeRatio.toFixed(2)}x</div>
                  </div>
                  <div className="rounded bg-white p-2">
                    <div className="font-semibold text-ink/50">Confidence</div>
                    <div className="mt-1 font-black text-ink">{score(stock.confidenceScore)}</div>
                  </div>
                  <div className="rounded bg-white p-2">
                    <div className="font-semibold text-ink/50">Risk</div>
                    <div className="mt-1 font-black text-ink">{score(stock.riskScore)}</div>
                  </div>
                </div>
                <div className="mt-3 rounded bg-white p-2">
                  <div className="text-xs font-black uppercase text-ink/45">Why In Focus</div>
                  <p className="mt-1 text-xs leading-5 text-ink/65">{stock.whyInFocus}</p>
                </div>
                <p className="mt-2 text-xs leading-5 text-coral">{stock.riskNote}</p>
              </article>
            ))}
          </div>
          <div className="hidden overflow-hidden rounded-md border border-ink/10 sm:block">
            <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-river/10 text-xs uppercase text-ink/60">
              <tr>
                <th className="px-3 py-3">Rank</th>
                <th className="px-3 py-3">Stock</th>
                <th className="px-3 py-3">Score</th>
                <th className="hidden px-3 py-3 sm:table-cell">Move</th>
                <th className="hidden px-3 py-3 md:table-cell">Volume</th>
                <th className="hidden px-3 py-3 lg:table-cell">Confidence</th>
                <th className="hidden px-3 py-3 lg:table-cell">Risk</th>
                <th className="hidden px-3 py-3 xl:table-cell">Why In Focus</th>
              </tr>
            </thead>
            <tbody>
              {stocks.slice(0, 20).map((stock) => (
                <tr key={stock.symbol} className="border-t border-ink/10">
                  <td className="px-3 py-3 font-bold text-ink/60">#{stock.rank}</td>
                  <td className="px-3 py-3">
                    <div className="font-bold">{stock.symbol}</div>
                    <div className="max-w-48 truncate text-xs text-ink/55">{stock.name}</div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-md border px-2 py-1 font-bold ${scoreTone(stock.totalScore)}`}>{score(stock.totalScore)}</span>
                  </td>
                  <td className={stock.oneDayChangePercent >= 0 ? "hidden px-3 py-3 font-semibold text-mint sm:table-cell" : "hidden px-3 py-3 font-semibold text-coral sm:table-cell"}>
                    {pct(stock.oneDayChangePercent)}
                  </td>
                  <td className="hidden px-3 py-3 md:table-cell">{stock.volumeRatio.toFixed(2)}x</td>
                  <td className="hidden px-3 py-3 lg:table-cell">
                    <span className={`rounded-md border px-2 py-1 font-bold ${scoreTone(stock.confidenceScore)}`}>{score(stock.confidenceScore)}</span>
                  </td>
                  <td className="hidden px-3 py-3 lg:table-cell">
                    <span className={`rounded-md border px-2 py-1 font-bold ${riskTone(stock.riskScore)}`}>{score(stock.riskScore)}</span>
                  </td>
                  <td className="hidden max-w-sm px-3 py-3 text-xs leading-5 text-ink/65 xl:table-cell">
                    <div>{stock.whyInFocus}</div>
                    <div className="mt-1 text-coral">{stock.riskNote}</div>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

function OptionStrikeRow({ candidate }: { candidate: OptionStrikeCandidate }) {
  return (
    <div className="rounded-md border border-ink/10 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase text-ink/45">{candidate.optionType}</div>
          <div className="mt-1 text-lg font-black text-ink">{numberLabel(candidate.strike)}</div>
        </div>
        <span className={`rounded-md border px-2.5 py-1 text-sm font-bold ${scoreTone(candidate.score)}`}>
          {score(candidate.score)}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded bg-paper p-2">
          <div className="font-semibold text-ink/50">Confidence</div>
          <div className="mt-1 font-black text-ink">{score(candidate.confidenceScore)}</div>
        </div>
        <div className="rounded bg-paper p-2">
          <div className="font-semibold text-ink/50">Risk</div>
          <div className="mt-1 font-black text-ink">{score(candidate.riskScore)}</div>
        </div>
        <div className="rounded bg-paper p-2">
          <div className="font-semibold text-ink/50">OI</div>
          <div className="mt-1 font-black text-ink">{numberLabel(candidate.openInterest)}</div>
        </div>
        <div className="rounded bg-paper p-2">
          <div className="font-semibold text-ink/50">OI Chg</div>
          <div className="mt-1 font-black text-ink">{numberLabel(candidate.changeInOpenInterest)}</div>
        </div>
        <div className="rounded bg-paper p-2">
          <div className="font-semibold text-ink/50">Volume</div>
          <div className="mt-1 font-black text-ink">{numberLabel(candidate.volume)}</div>
        </div>
        <div className="rounded bg-paper p-2">
          <div className="font-semibold text-ink/50">IV</div>
          <div className="mt-1 font-black text-ink">{candidate.impliedVolatility.toFixed(2)}</div>
        </div>
      </div>
      <div className="mt-3 rounded bg-paper p-2">
        <div className="text-xs font-black uppercase text-ink/45">Why In Focus</div>
        <p className="mt-1 text-xs leading-5 text-ink/65">{candidate.whyInFocus || candidate.reason}</p>
      </div>
      <p className="mt-2 text-xs leading-5 text-ink/60">{candidate.marketContext}</p>
      <p className="mt-2 text-xs leading-5 text-coral">{candidate.riskNote}</p>
    </div>
  );
}

function WarningState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-gold/35 bg-gold/10 p-4 text-sm text-ink shadow-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-gold" />
        <div className="min-w-0">
          <div className="font-bold text-ink">Automation is catching up</div>
          <p className="mt-1 leading-6 text-ink/75">{message}</p>
        </div>
      </div>
    </div>
  );
}

function defaultOptionTab(item: IndexOptionResearch): "CALL" | "PUT" {
  if (item.calls.length > 0) {
    return "CALL";
  }
  return "PUT";
}

function OptionsResearchPanel({ optionsResearch }: { optionsResearch: IndexOptionResearch[] }) {
  const [activeTabs, setActiveTabs] = useState<Record<string, "CALL" | "PUT">>({});

  return (
    <Card>
      <WidgetTitle icon={<Activity className="size-5 text-gold" />} title="Call / Put Strike Research" />
      {optionsResearch.length === 0 ? (
        <EmptyState text="No options research has been saved yet. Run the scanner after applying migration 005." />
      ) : (
        <div className="space-y-4">
          {optionsResearch.map((item) => {
            const activeTab = activeTabs[item.index] ?? defaultOptionTab(item);
            const visibleCandidates = activeTab === "CALL" ? item.calls : item.puts;

            return (
            <article key={item.index} className="rounded-md border border-ink/10 bg-paper p-3">
              <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                <div>
                  <h3 className="text-base font-black text-ink">{item.index}</h3>
                  <p className="mt-1 text-xs leading-5 text-ink/60">{item.trendContext}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`w-fit rounded-md border px-2.5 py-1 text-xs font-bold uppercase ${item.dataStatus === "ok" ? "border-mint/30 bg-mint/15 text-mint" : "border-coral/30 bg-coral/15 text-coral"}`}>
                    {item.dataStatus}
                  </span>
                  {item.dataStatus === "ok" ? (
                    <div className="grid grid-cols-2 overflow-hidden rounded-md border border-ink/15 bg-white p-0.5">
                      {([
                        { tab: "CALL" as const, count: item.calls.length },
                        { tab: "PUT" as const, count: item.puts.length }
                      ]).map(({ tab, count }) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setActiveTabs((current) => ({ ...current, [item.index]: tab }))}
                          disabled={count === 0}
                          className={`min-h-8 px-3 text-xs font-black ${
                            activeTab === tab ? "rounded bg-ink text-white" : "text-ink/60 hover:text-ink"
                          } ${count === 0 ? "cursor-not-allowed opacity-40" : ""}`}
                        >
                          {tab} {count}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              {item.dataStatus !== "ok" ? (
                <p className="mt-3 rounded-md bg-white p-3 text-sm leading-6 text-ink/70">{item.note}</p>
              ) : (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
                    <div className="rounded bg-white p-2">
                      <div className="font-semibold text-ink/50">Spot</div>
                      <div className="mt-1 font-black text-ink">{numberLabel(item.spot)}</div>
                    </div>
                    <div className="rounded bg-white p-2">
                      <div className="font-semibold text-ink/50">PCR</div>
                      <div className="mt-1 font-black text-ink">{item.putCallRatio.toFixed(2)}</div>
                    </div>
                    <div className="rounded bg-white p-2">
                      <div className="font-semibold text-ink/50">Call OI wall</div>
                      <div className="mt-1 font-black text-ink">{numberLabel(item.maxCallOiStrike)}</div>
                    </div>
                    <div className="rounded bg-white p-2">
                      <div className="font-semibold text-ink/50">Put OI wall</div>
                      <div className="mt-1 font-black text-ink">{numberLabel(item.maxPutOiStrike)}</div>
                    </div>
                    <div className="rounded bg-white p-2">
                      <div className="font-semibold text-ink/50">Max pain</div>
                      <div className="mt-1 font-black text-ink">{numberLabel(item.maxPainStrike)}</div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className={activeTab === "CALL" ? "mb-2 text-xs font-black uppercase text-mint" : "mb-2 text-xs font-black uppercase text-coral"}>
                      {activeTab === "CALL" ? "Call watch strikes" : "Put watch strikes"}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {visibleCandidates.length > 0 ? (
                        visibleCandidates.map((candidate) => (
                          <OptionStrikeRow key={`${item.index}-${activeTab}-${candidate.strike}`} candidate={candidate} />
                        ))
                      ) : (
                        <EmptyState text={`No ${activeTab.toLowerCase()} strike candidates saved for this index.`} />
                      )}
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-ink/55">{item.note}</p>
                </>
              )}
            </article>
          )})}
        </div>
      )}
    </Card>
  );
}

function CatalystPanel({ catalysts }: { catalysts: DashboardData["report"]["catalysts"] }) {
  return (
    <Card>
      <WidgetTitle icon={<Newspaper className="size-5 text-river" />} title="Market Catalysts" />
      {!catalysts ? (
        <EmptyState text="No catalyst scan has been saved yet." />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-md bg-paper p-3">
            <div>
              <div className="text-xs font-semibold uppercase text-ink/50">News tone</div>
              <div className="mt-1 text-lg font-black capitalize text-ink">{catalysts.sentiment}</div>
            </div>
            <span className={`rounded-md border px-3 py-1 text-sm font-bold ${scoreTone(catalysts.score)}`}>
              {score(catalysts.score)}
            </span>
          </div>
          {catalysts.riskFlags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {catalysts.riskFlags.map((flag) => (
                <span key={flag} className="rounded-md border border-coral/25 bg-coral/10 px-2.5 py-1 text-xs font-bold uppercase text-coral">
                  {flag}
                </span>
              ))}
            </div>
          ) : null}
          <div className="space-y-2">
            {catalysts.items.slice(0, 4).map((item) => (
              <a
                key={item.title}
                href={item.url || undefined}
                target="_blank"
                rel="noreferrer"
                className="block rounded-md bg-paper p-3 text-sm font-semibold leading-5 text-ink hover:bg-river/10"
              >
                {item.title}
                <span className="mt-1 block text-xs font-medium text-ink/50">{item.source}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function ExtremeAlerts({ alerts }: { alerts: StockFocus[] }) {
  return (
    <Card>
      <WidgetTitle icon={<BellRing className="size-5 text-coral" />} title="Extreme Alerts" />
      {alerts.length === 0 ? (
        <EmptyState text="No extreme movement alerts in the latest report." />
      ) : (
        <div className="space-y-3">
          {alerts.slice(0, 6).map((stock) => (
            <article key={stock.symbol} className="rounded-md bg-paper p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold">{stock.symbol}</h3>
                  <p className="truncate text-xs text-ink/55">{stock.name}</p>
                </div>
                <span className={stock.changePercent >= 0 ? "font-bold text-mint" : "font-bold text-coral"}>{pct(stock.changePercent)}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-ink/65">{stock.reason}</p>
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}

function RecentReports({ reports }: { reports: DashboardReportSummary[] }) {
  return (
    <Card>
      <WidgetTitle icon={<Newspaper className="size-5 text-gold" />} title="Recent Reports" />
      <div className="space-y-3">
        {reports.map((report) => (
          <div key={`${report.id ?? report.reportDate}-${report.session}`} className="flex items-center justify-between gap-3 rounded-md bg-paper p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-bold capitalize">
                <CalendarDays className="size-4 text-ink/55" />
                {report.session}
              </div>
              <div className="mt-1 truncate text-xs text-ink/55">{report.reportDate} · {report.sectorInFocus}</div>
            </div>
            <span className={`rounded-md border px-2.5 py-1 text-xs font-bold ${report.marketMood === "Bullish" ? "border-mint/30 bg-mint/15 text-mint" : report.marketMood === "Bearish" ? "border-coral/30 bg-coral/15 text-coral" : "border-gold/30 bg-gold/15 text-gold"}`}>
              {report.marketMood}
            </span>
          </div>
        ))}
        {reports.length === 0 ? <EmptyState text="No recent reports available." /> : null}
      </div>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-ink/20 bg-paper p-4 text-sm text-ink/60">{text}</div>;
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const dataRef = useRef<DashboardData | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const loadDashboard = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background ?? false;
    const hasData = Boolean(dataRef.current);

    if (background && hasData) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    if (!background) {
      setError(null);
    }

    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load dashboard data.");
      }

      setData(payload as DashboardData);
    } catch (loadError) {
      if (!background || !hasData) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard data.");
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && isMarketHours()) {
        void loadDashboard({ background: true });
      }
    }, DASHBOARD_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadDashboard]);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void loadDashboard({ background: true });
      }
    };

    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [loadDashboard]);

  const sortedSectors = useMemo(
    () => [...(data?.sectorScores ?? [])].sort((left, right) => left.rank - right.rank),
    [data?.sectorScores]
  );
  const sortedStocks = useMemo(
    () => [...(data?.stockScores ?? [])].sort((left, right) => left.rank - right.rank),
    [data?.stockScores]
  );

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error || !data) {
    return <ErrorState message={error ?? "Dashboard data did not load."} onRetry={loadDashboard} />;
  }

  const { report } = data;
  const details = report.marketMoodDetails;
  const title = `${report.session} market dashboard`;

  return (
    <main className="min-h-screen bg-paper">
      <section className="px-3 pb-4 pt-3 sm:px-4 sm:pb-5 sm:pt-4">
        <div className="mx-auto flex max-w-7xl flex-col gap-4">
          <div className="flex flex-col justify-between gap-4 rounded-md border border-ink/15 bg-white p-4 shadow-sm lg:flex-row lg:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase text-ink/55">
                <span>{title}</span>
                <span>·</span>
                <span>{report.reportDate}</span>
                <span>·</span>
                <span>{isRefreshing ? "refreshing live" : `live ${timeLabel(data.liveUpdatedAt)}`}</span>
              </div>
              <h1 className="mt-2 text-2xl font-black leading-tight text-ink sm:text-4xl">TerminalX.Trading</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-ink/70 sm:text-base">{report.summary}</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-center">
              <Link
                href="/watchlist"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-paper"
              >
                <BarChart3 className="size-4" />
                Watchlist
              </Link>
              <Link
                href="/notifications"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-paper"
              >
                <BellRing className="size-4" />
                Alert analytics
              </Link>
              <PushButton />
            </div>
          </div>

          {data.staleMessage ? <WarningState message={data.staleMessage} /> : null}

          <div id="market" className="grid scroll-mt-4 grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <OverviewCard label="Nifty" value={numberLabel(details?.niftyValue)} change={details?.niftyChangePercent} icon={<TrendingUp className="size-4 text-mint" />} />
            <OverviewCard label="Bank Nifty" value={numberLabel(details?.bankNiftyValue)} change={details?.bankNiftyChangePercent} icon={<BarChart3 className="size-4 text-river" />} />
            <OverviewCard label="India VIX" value={numberLabel(details?.indiaVixValue)} change={details?.indiaVixChangePercent} icon={<Activity className="size-4 text-coral" />} />
            <OverviewCard label="Market Mood" value={report.marketMood} detail={`Score ${score(details?.score)}/100`} icon={<Gauge className="size-4 text-gold" />} />
          </div>
          <LivePriceStrip prices={data.livePrices} updatedAt={data.liveUpdatedAt} />
        </div>
      </section>

      <section className="px-3 pb-6 sm:px-4">
        <div className="mx-auto grid max-w-7xl gap-4 xl:grid-cols-[1.5fr_0.9fr]">
          <div className="space-y-4">
            <SectorHeatmap sectors={sortedSectors} />
            <OptionsResearchPanel optionsResearch={report.optionsResearch} />
            <TopStocks stocks={sortedStocks} />
          </div>

          <aside className="space-y-4">
            <TopSectors sectors={sortedSectors} />
            <CatalystPanel catalysts={report.catalysts} />
            <ExtremeAlerts alerts={report.extremeMovementAlerts} />
            <RecentReports reports={data.recentReports} />
          </aside>
        </div>
      </section>
    </main>
  );
}
