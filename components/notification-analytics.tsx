"use client";

import { AlertTriangle, BellRing, CheckCircle2, Clock, RefreshCw, Send, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AlertPriority, NotificationAnalytics, NotificationHistoryItem, NotificationStatus } from "@/lib/types";

const priorityStyles: Record<AlertPriority, string> = {
  Critical: "border-red-300 bg-red-50 text-red-700",
  High: "border-orange-300 bg-orange-50 text-orange-700",
  Medium: "border-amber-300 bg-amber-50 text-amber-700",
  Low: "border-slate-300 bg-slate-50 text-slate-700"
};

function dateTime(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-md border border-ink/15 bg-white p-4 shadow-sm ${className}`}>{children}</section>;
}

function LoadingState() {
  return (
    <main className="min-h-screen bg-paper px-3 py-4 sm:px-4 sm:py-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="h-28 animate-pulse rounded-md bg-white" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-md bg-white" />
          ))}
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
            <h1 className="text-xl font-bold">Notification analytics unavailable</h1>
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

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card className="p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-ink/60">{label}</div>
        {icon}
      </div>
      <div className="mt-3 text-3xl font-black">{value}</div>
    </Card>
  );
}

function StatusIcon({ status }: { status: NotificationStatus }) {
  if (status === "sent") return <CheckCircle2 className="size-4 text-mint" />;
  if (status === "failed") return <XCircle className="size-4 text-coral" />;
  if (status === "skipped") return <Clock className="size-4 text-gold" />;
  return <Send className="size-4 text-river" />;
}

function AlertRow({ alert }: { alert: NotificationHistoryItem }) {
  return (
    <article className="rounded-md border border-ink/10 bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md border px-2.5 py-1 text-xs font-bold ${priorityStyles[alert.priority]}`}>{alert.priority}</span>
            <span className="flex items-center gap-1 rounded-md bg-paper px-2.5 py-1 text-xs font-semibold text-ink/65">
              <StatusIcon status={alert.notificationStatus} />
              {alert.notificationStatus}
            </span>
          </div>
          <h2 className="mt-3 text-base font-bold leading-6 text-ink">{alert.title}</h2>
          <p className="mt-2 text-sm leading-6 text-ink/70">{alert.reason}</p>
        </div>
        <div className="shrink-0 text-left text-xs text-ink/55 sm:text-right">
          <div>{dateTime(alert.triggeredAt)}</div>
          <div className="mt-1">Sent {alert.sentCount} · Failed {alert.failedCount}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-md bg-paper p-3">
          <div className="text-xs font-semibold text-ink/50">Sector</div>
          <div className="mt-1 font-bold">{alert.sector}</div>
        </div>
        <div className="rounded-md bg-paper p-3 sm:col-span-2">
          <div className="text-xs font-semibold text-ink/50">Stocks affected</div>
          <div className="mt-1 break-words font-bold">{alert.stocksAffected.length > 0 ? alert.stocksAffected.join(", ") : "Broad market"}</div>
        </div>
      </div>
    </article>
  );
}

export function NotificationAnalyticsView() {
  const [data, setData] = useState<NotificationAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/notifications/analytics", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load notification analytics.");
      }
      setData(payload as NotificationAnalytics);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load notification analytics.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  if (isLoading) {
    return <LoadingState />;
  }

  if (error || !data) {
    return <ErrorState message={error ?? "Analytics data did not load."} onRetry={loadAnalytics} />;
  }

  return (
    <main className="min-h-screen bg-paper px-3 py-4 sm:px-4 sm:py-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <Card>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <div className="text-xs font-bold uppercase text-ink/55">Notification analytics</div>
              <h1 className="mt-2 text-2xl font-black text-ink sm:text-4xl">Alert History</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/70">
                Review alert priorities, delivery outcomes, affected sectors, and affected stocks. Research-only alerts do not contain buy/sell recommendations.
              </p>
            </div>
            {data.isFallback ? <span className="rounded-md border border-gold/30 bg-gold/15 px-3 py-2 text-sm font-bold text-gold">Sample data</span> : null}
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <StatCard label="Total alerts" value={data.total} icon={<BellRing className="size-5 text-river" />} />
          <StatCard label="Critical" value={data.byPriority.Critical} icon={<AlertTriangle className="size-5 text-coral" />} />
          <StatCard label="Sent" value={data.byStatus.sent} icon={<CheckCircle2 className="size-5 text-mint" />} />
          <StatCard label="Failed" value={data.byStatus.failed} icon={<XCircle className="size-5 text-coral" />} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.4fr]">
          <Card>
            <h2 className="text-base font-bold">Priority Breakdown</h2>
            <div className="mt-4 space-y-3">
              {(Object.keys(data.byPriority) as AlertPriority[]).map((priority) => (
                <div key={priority} className="flex items-center justify-between rounded-md bg-paper p-3">
                  <span className={`rounded-md border px-2.5 py-1 text-xs font-bold ${priorityStyles[priority]}`}>{priority}</span>
                  <span className="text-lg font-black">{data.byPriority[priority]}</span>
                </div>
              ))}
            </div>
          </Card>

          <section className="space-y-3">
            {data.recent.length > 0 ? data.recent.map((alert) => <AlertRow key={alert.id} alert={alert} />) : (
              <Card>
                <p className="text-sm text-ink/65">No notification history has been saved yet.</p>
              </Card>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
