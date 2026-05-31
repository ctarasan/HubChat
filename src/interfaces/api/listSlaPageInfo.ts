import {
  defaultSlaDueSoonMs,
  slaDueSoonMsFromWarningMinutes
} from "../../domain/tenantSlaPolicy.js";

/** SLA warning threshold metadata on list API pageInfo (conversations + leads). */
export type ListSlaPageInfoFields = {
  slaWarningBeforeBreachMinutes: number;
};

export function buildListSlaPageInfoFields(warningBeforeBreachMinutes: number): ListSlaPageInfoFields {
  return { slaWarningBeforeBreachMinutes: warningBeforeBreachMinutes };
}

export function readListSlaWarningBeforeBreachMinutes(source: unknown): number | null {
  if (typeof source !== "object" || source === null) return null;
  const record = source as Record<string, unknown>;
  const raw = record.slaWarningBeforeBreachMinutes ?? record.sla_warning_before_breach_minutes;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  return Math.floor(raw);
}

export function resolveSlaDueSoonMsFromPageInfo(pageInfo: unknown): number {
  const minutes = readListSlaWarningBeforeBreachMinutes(pageInfo);
  if (minutes != null) return slaDueSoonMsFromWarningMinutes(minutes);
  return defaultSlaDueSoonMs();
}

export type InboxBadgeSlaOptions = {
  slaWarningBeforeBreachMinutes?: number;
};

export function resolveSlaDueSoonMsFromBadgeOptions(options?: InboxBadgeSlaOptions): number {
  if (options?.slaWarningBeforeBreachMinutes != null) {
    return slaDueSoonMsFromWarningMinutes(options.slaWarningBeforeBreachMinutes);
  }
  return defaultSlaDueSoonMs();
}
