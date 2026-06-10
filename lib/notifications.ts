import { getSupabaseAdmin } from "@/lib/supabase";
import type { AlertPriority, NotificationAnalytics, NotificationHistoryItem, NotificationStatus } from "@/lib/types";

type NotificationHistoryRow = {
  id: string;
  report_id: string | null;
  alert_key: string;
  priority: AlertPriority;
  title: string;
  reason: string;
  sector: string;
  stocks_affected: string[];
  alert_type: string;
  trigger_value: number | string;
  threshold_value: number | string;
  notification_status: NotificationStatus;
  sent_count: number;
  failed_count: number;
  error_message: string | null;
  triggered_at: string;
  created_at: string;
};

const priorities: AlertPriority[] = ["Critical", "High", "Medium", "Low"];
const statuses: NotificationStatus[] = ["created", "sent", "failed", "duplicate", "skipped"];
const notificationSelect = [
  "id",
  "report_id",
  "alert_key",
  "priority",
  "title",
  "reason",
  "sector",
  "stocks_affected",
  "alert_type",
  "trigger_value",
  "threshold_value",
  "notification_status",
  "sent_count",
  "failed_count",
  "error_message",
  "triggered_at",
  "created_at"
].join(",");

function numberValue(value: number | string) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function mapNotification(row: NotificationHistoryRow): NotificationHistoryItem {
  return {
    id: row.id,
    reportId: row.report_id,
    alertKey: row.alert_key,
    priority: row.priority,
    title: row.title,
    reason: row.reason,
    sector: row.sector,
    stocksAffected: row.stocks_affected ?? [],
    alertType: row.alert_type,
    triggerValue: numberValue(row.trigger_value),
    thresholdValue: numberValue(row.threshold_value),
    notificationStatus: row.notification_status,
    sentCount: row.sent_count,
    failedCount: row.failed_count,
    errorMessage: row.error_message,
    triggeredAt: row.triggered_at,
    createdAt: row.created_at
  };
}

export async function getNotificationAnalytics(): Promise<NotificationAnalytics> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const { data, error } = await supabase
    .from("notification_history")
    .select(notificationSelect)
    .order("triggered_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  const recent = ((data ?? []) as unknown as NotificationHistoryRow[]).map(mapNotification);
  const byPriority = Object.fromEntries(priorities.map((priority) => [priority, 0])) as Record<AlertPriority, number>;
  const byStatus = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<NotificationStatus, number>;

  for (const item of recent) {
    byPriority[item.priority] += 1;
    byStatus[item.notificationStatus] += 1;
  }

  return {
    total: recent.length,
    byPriority,
    byStatus,
    recent
  };
}
