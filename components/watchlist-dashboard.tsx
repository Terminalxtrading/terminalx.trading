"use client";

import { Activity, AlertTriangle, BarChart3, CheckCircle2, Plus, RefreshCw, Trash2, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { WatchlistDashboardData, WatchlistStock } from "@/lib/types";

function pct(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function scoreTone(value: number) {
  if (value >= 65) return "border-mint/30 bg-mint/15 text-mint";
  if (value <= 45) return "border-coral/30 bg-coral/15 text-coral";
  return "border-gold/30 bg-gold/15 text-gold";
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-md border border-ink/15 bg-white p-4 shadow-sm ${className}`}>{children}</section>;
}

function LoadingState() {
  return (
    <main className="min-h-screen bg-paper px-3 py-4 sm:px-4 sm:py-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="h-32 animate-pulse rounded-md bg-white" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-md bg-white" />)}
        </div>
        <div className="h-96 animate-pulse rounded-md bg-white" />
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
          <div>
            <h1 className="text-xl font-bold">Watchlist unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-ink/70">{message}</p>
            <button type="button" onClick={onRetry} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">
              <RefreshCw className="size-4" />
              Retry
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold text-ink/60">
        <span>{label}</span>
        <span>{value.toFixed(0)}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/10">
        <div className="h-full rounded-full bg-river" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function StockCard({
  stock,
  onRemove,
  onTrack,
  isBusy
}: {
  stock: WatchlistStock;
  onRemove: (stock: WatchlistStock) => void;
  onTrack: (stock: WatchlistStock) => void;
  isBusy: boolean;
}) {
  return (
    <article className="rounded-md border border-ink/10 bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-black text-ink">{stock.symbol}</h2>
            <span className={`rounded-md border px-2.5 py-1 text-xs font-bold ${scoreTone(stock.healthScore)}`}>{stock.healthScore.toFixed(0)}</span>
            <span className={stock.isTracked ? "rounded-md bg-mint/15 px-2.5 py-1 text-xs font-bold text-mint" : "rounded-md bg-ink/10 px-2.5 py-1 text-xs font-bold text-ink/55"}>
              {stock.isTracked ? "Tracked" : "Paused"}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink/55">{stock.name}</p>
          <p className="mt-3 text-sm leading-6 text-ink/70">{stock.researchNote}</p>
        </div>
        <div className="grid shrink-0 grid-cols-[1fr_auto] gap-2 sm:flex">
          <button
            type="button"
            onClick={() => onTrack(stock)}
            disabled={isBusy}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-ink/15 px-3 py-2 text-sm font-semibold hover:bg-paper disabled:opacity-50"
          >
            <CheckCircle2 className="size-4" />
            {stock.isTracked ? "Refresh" : "Track"}
          </button>
          <button
            type="button"
            onClick={() => onRemove(stock)}
            disabled={isBusy}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-coral/30 px-3 py-2 text-sm font-semibold text-coral hover:bg-coral/10 disabled:opacity-50"
            title="Remove stock"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ScoreBar label="Trend" value={stock.trendScore} />
        <ScoreBar label="Momentum" value={stock.momentumScore} />
        <ScoreBar label="Relative strength" value={stock.relativeStrengthScore} />
        <ScoreBar label="Volume" value={stock.volumeScore} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div className="rounded-md bg-paper p-3">
          <div className="text-xs font-semibold text-ink/50">1D</div>
          <div className={stock.oneDayChangePercent >= 0 ? "mt-1 font-bold text-mint" : "mt-1 font-bold text-coral"}>{pct(stock.oneDayChangePercent)}</div>
        </div>
        <div className="rounded-md bg-paper p-3">
          <div className="text-xs font-semibold text-ink/50">5D</div>
          <div className={stock.fiveDayChangePercent >= 0 ? "mt-1 font-bold text-mint" : "mt-1 font-bold text-coral"}>{pct(stock.fiveDayChangePercent)}</div>
        </div>
        <div className="rounded-md bg-paper p-3">
          <div className="text-xs font-semibold text-ink/50">20D</div>
          <div className={stock.twentyDayChangePercent >= 0 ? "mt-1 font-bold text-mint" : "mt-1 font-bold text-coral"}>{pct(stock.twentyDayChangePercent)}</div>
        </div>
        <div className="rounded-md bg-paper p-3">
          <div className="text-xs font-semibold text-ink/50">Volume</div>
          <div className="mt-1 font-bold">{stock.volumeRatio.toFixed(2)}x</div>
        </div>
      </div>
    </article>
  );
}

export function WatchlistDashboard() {
  const [data, setData] = useState<WatchlistDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const loadWatchlist = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/watchlist", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to load watchlist.");
      setData(payload as WatchlistDashboardData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load watchlist.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWatchlist();
  }, [loadWatchlist]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel("watchlist-stocks")
      .on("postgres_changes", { event: "*", schema: "public", table: "watchlist_stocks" }, () => {
        void loadWatchlist();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadWatchlist]);

  const trackedStocks = useMemo(() => data?.stocks.filter((stock) => stock.isTracked) ?? [], [data?.stocks]);

  async function addStock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsAdding(true);
    setError(null);
    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, name: name || undefined })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to add stock.");
      setSymbol("");
      setName("");
      await loadWatchlist();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Unable to add stock.");
    } finally {
      setIsAdding(false);
    }
  }

  async function removeStock(stock: WatchlistStock) {
    setBusyId(stock.id);
    setError(null);
    try {
      const response = await fetch(`/api/watchlist/${stock.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to remove stock.");
      await loadWatchlist();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to remove stock.");
    } finally {
      setBusyId(null);
    }
  }

  async function trackStock(stock: WatchlistStock) {
    setBusyId(stock.id);
    setError(null);
    try {
      const response = await fetch(`/api/watchlist/${stock.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isTracked: true })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to track stock.");
      await loadWatchlist();
    } catch (trackError) {
      setError(trackError instanceof Error ? trackError.message : "Unable to track stock.");
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading) return <LoadingState />;
  if (!data) return <ErrorState message={error ?? "Watchlist data did not load."} onRetry={loadWatchlist} />;

  return (
    <main className="min-h-screen bg-paper px-3 py-4 sm:px-4 sm:py-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <Card>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-bold uppercase text-ink/55">Realtime watchlist engine</div>
              <h1 className="mt-2 text-2xl font-black text-ink sm:text-4xl">Watchlist Health</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/70">
                Add, remove, and track stocks with research-only trend, momentum, relative strength, and volume scores. Supabase realtime refreshes this page when watchlist rows change.
              </p>
            </div>
            {data.isFallback ? <span className="rounded-md border border-gold/30 bg-gold/15 px-3 py-2 text-sm font-bold text-gold">Sample data</span> : null}
          </div>
        </Card>

        {error ? (
          <div className="rounded-md border border-coral/30 bg-coral/10 p-3 text-sm font-semibold text-coral">{error}</div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <Card className="p-3 sm:p-4">
            <div className="flex items-center justify-between text-sm font-semibold text-ink/60">
              Watchlist Health Score <Activity className="size-5 text-river" />
            </div>
            <div className="mt-3 text-3xl font-black">{data.healthScore.toFixed(0)}</div>
          </Card>
          <Card className="p-3 sm:p-4">
            <div className="flex items-center justify-between text-sm font-semibold text-ink/60">
              Tracked Stocks <CheckCircle2 className="size-5 text-mint" />
            </div>
            <div className="mt-3 text-3xl font-black">{data.trackedCount}</div>
          </Card>
          <Card className="p-3 sm:p-4">
            <div className="flex items-center justify-between text-sm font-semibold text-ink/60">
              Average Momentum <TrendingUp className="size-5 text-gold" />
            </div>
            <div className="mt-3 text-3xl font-black">{trackedStocks.length ? (trackedStocks.reduce((total, stock) => total + stock.momentumScore, 0) / trackedStocks.length).toFixed(0) : "0"}</div>
          </Card>
          <Card className="p-3 sm:p-4">
            <div className="flex items-center justify-between text-sm font-semibold text-ink/60">
              Average Volume <BarChart3 className="size-5 text-coral" />
            </div>
            <div className="mt-3 text-3xl font-black">{trackedStocks.length ? (trackedStocks.reduce((total, stock) => total + stock.volumeScore, 0) / trackedStocks.length).toFixed(0) : "0"}</div>
          </Card>
        </div>

        <Card>
          <form onSubmit={addStock} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <label className="block">
              <span className="text-xs font-bold uppercase text-ink/55">Symbol</span>
              <input
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
                placeholder="RELIANCE or RELIANCE.NS"
                required
                className="mt-1 min-h-11 w-full rounded-md border border-ink/15 bg-white px-3 text-sm outline-none focus:border-river"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase text-ink/55">Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Optional display name"
                className="mt-1 min-h-11 w-full rounded-md border border-ink/15 bg-white px-3 text-sm outline-none focus:border-river"
              />
            </label>
            <button
              type="submit"
              disabled={isAdding}
              className="inline-flex min-h-12 items-center justify-center gap-2 self-end rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-50"
            >
              <Plus className="size-4" />
              {isAdding ? "Adding..." : "Add stock"}
            </button>
          </form>
        </Card>

        <section className="space-y-3">
          {data.stocks.length > 0 ? (
            data.stocks.map((stock) => (
              <StockCard key={stock.id} stock={stock} onRemove={removeStock} onTrack={trackStock} isBusy={busyId === stock.id} />
            ))
          ) : (
            <Card>
              <p className="text-sm text-ink/65">No watchlist stocks yet. Add a symbol to calculate its research-only health score.</p>
            </Card>
          )}
        </section>
      </div>
    </main>
  );
}
