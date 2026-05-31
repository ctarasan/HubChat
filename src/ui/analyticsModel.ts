import type {
  AnalyticsChannel,
  AnalyticsLeadManagementRollup,
  AnalyticsOverviewDto,
  AnalyticsRange,
  AnalyticsSummaryCard
} from "../domain/analyticsOverview.js";
import { ANALYTICS_CHANNELS } from "../domain/analyticsOverview.js";
import { getLeadFunnelStatusLabel } from "./leadStatusEditorModel.js";

export const ANALYTICS_RANGE_OPTIONS: { value: AnalyticsRange; label: string }[] = [
  { value: "today", label: "วันนี้" },
  { value: "7d", label: "7 วัน" },
  { value: "30d", label: "30 วัน" }
];

export const MANAGEMENT_ROLLUP_LABELS: Record<keyof AnalyticsLeadManagementRollup, string> = {
  NEW: "ใหม่ (New)",
  IN_PROGRESS: "กำลังดำเนินการ (In progress)",
  FOLLOW_UP: "Follow-up scheduled",
  WON: "ชนะ (Won)",
  LOST: "แพ้ (Lost)",
  CLOSED: "ไม่ผ่านคุณสมบัติ (Unqualified)"
};

export function buildAnalyticsOverviewPath(range: AnalyticsRange): string {
  return `/api/analytics/overview?range=${encodeURIComponent(range)}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function safeCount(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

export function formatAnalyticsCount(value: number | null | undefined): string {
  return String(safeCount(value));
}

/** API breachRate is ratio 0..1; display as percent with two decimals. */
export function formatBreachRatePercent(ratio: number | null | undefined): string {
  const n = typeof ratio === "number" && Number.isFinite(ratio) ? Math.max(0, ratio) : 0;
  return `${(n * 100).toFixed(2)}%`;
}

export function formatSummaryCardValue(card: AnalyticsSummaryCard): string {
  const value = safeCount(card.value);
  if (card.unit === "percent") return formatBreachRatePercent(value / 100);
  return formatAnalyticsCount(value);
}

export function parseAnalyticsOverviewGetResponse(
  body: unknown
): { ok: true; data: AnalyticsOverviewDto } | { ok: false; error: string } {
  if (!isRecord(body) || !isRecord(body.data)) {
    return { ok: false, error: "รูปแบบข้อมูล Analytics ไม่ถูกต้อง" };
  }
  const data = body.data as AnalyticsOverviewDto;
  if (!data.range || !data.period?.startAt || !data.period?.endAt) {
    return { ok: false, error: "รูปแบบข้อมูล Analytics ไม่ครบถ้วน" };
  }
  return { ok: true, data };
}

export function mapAnalyticsLoadError(status: number, body: unknown): string {
  if (status === 401) return "Sign in required. Your session may have expired.";
  if (status === 403) return "คุณไม่มีสิทธิ์เข้าถึงหน้านี้";
  if (isRecord(body) && typeof body.error === "string" && body.error.trim()) {
    return body.error.trim();
  }
  if (status >= 500) return "โหลด Analytics ไม่สำเร็จ";
  return `โหลด Analytics ไม่สำเร็จ (HTTP ${status})`;
}

export function formatAnalyticsGeneratedAt(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

export function formatAnalyticsPeriodLabel(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "—";
  const fmt = (d: Date) =>
    d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function barWidthPercent(value: number, max: number): number {
  const v = safeCount(value);
  const m = safeCount(max);
  if (m <= 0) return v > 0 ? 100 : 0;
  return Math.min(100, Math.round((v / m) * 100));
}

export function leadStatusLabel(status: string): string {
  return getLeadFunnelStatusLabel(status) || status;
}

export function channelLabel(channel: AnalyticsChannel): string {
  if (channel === "FACEBOOK") return "Facebook";
  if (channel === "INSTAGRAM") return "Instagram";
  return channel;
}

export function isAnalyticsOverviewSparse(data: AnalyticsOverviewDto): boolean {
  const snap = data.conversations?.snapshot;
  const total = safeCount(snap?.total);
  const messages =
    safeCount(data.channelBreakdown?.period?.inboundMessages?.LINE) +
    safeCount(data.channelBreakdown?.period?.inboundMessages?.FACEBOOK) +
    safeCount(data.channelBreakdown?.period?.inboundMessages?.INSTAGRAM);
  return total === 0 && messages === 0 && (data.teamWorkload?.length ?? 0) === 0;
}

export function orderedLeadStatusEntries(byStatus: Record<string, number> | undefined): { status: string; count: number }[] {
  const src = byStatus ?? {};
  const preferred = [
    "NEW",
    "ASSIGNED",
    "CONTACTED",
    "QUALIFIED",
    "PROPOSAL_SENT",
    "NEGOTIATION",
    "WON",
    "LOST",
    "UNQUALIFIED"
  ];
  const seen = new Set<string>();
  const rows: { status: string; count: number }[] = [];
  for (const status of preferred) {
    if (Object.prototype.hasOwnProperty.call(src, status)) {
      rows.push({ status, count: safeCount(src[status]) });
      seen.add(status);
    }
  }
  for (const status of Object.keys(src).sort()) {
    if (!seen.has(status)) rows.push({ status, count: safeCount(src[status]) });
  }
  return rows;
}

export function managementRollupRows(
  rollup: AnalyticsLeadManagementRollup | undefined
): { key: keyof AnalyticsLeadManagementRollup; label: string; count: number }[] {
  const r = rollup ?? {
    NEW: 0,
    IN_PROGRESS: 0,
    FOLLOW_UP: 0,
    WON: 0,
    LOST: 0,
    CLOSED: 0
  };
  return (Object.keys(MANAGEMENT_ROLLUP_LABELS) as (keyof AnalyticsLeadManagementRollup)[]).map((key) => ({
    key,
    label: MANAGEMENT_ROLLUP_LABELS[key],
    count: safeCount(r[key])
  }));
}

export function ensureChannelMessageCounts(
  record: Partial<Record<AnalyticsChannel, number>> | undefined
): Record<AnalyticsChannel, number> {
  const out = { LINE: 0, FACEBOOK: 0, INSTAGRAM: 0 } as Record<AnalyticsChannel, number>;
  for (const ch of ANALYTICS_CHANNELS) {
    out[ch] = safeCount(record?.[ch]);
  }
  return out;
}
