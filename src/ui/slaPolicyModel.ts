import type { SlaPolicyApiResponse } from "../domain/slaPolicyApi.js";
import {
  SLA_POLICY_RULE_KEYS,
  type TenantSlaPolicyRule
} from "../domain/tenantSlaPolicy.js";
import type { SlaPolicyRuleKey } from "../domain/tenantSlaPolicy.js";

export type { SlaPolicyRuleKey };

export type SlaTimeUnit = "minutes" | "hours" | "days";

export type SlaPolicyApiData = SlaPolicyApiResponse;

export type SlaRuleFormState = {
  enabled: boolean;
  targetValue: string;
  targetUnit: SlaTimeUnit;
  warningOverrideValue: string;
  warningOverrideUnit: SlaTimeUnit;
  label: string;
};

export type SlaPolicyFormState = {
  enabled: boolean;
  warningValue: string;
  warningUnit: SlaTimeUnit;
  excludeResolved: boolean;
  excludeArchived: boolean;
  version: number;
  rules: Record<SlaPolicyRuleKey, SlaRuleFormState>;
};

export type SlaPolicyPageMeta = {
  source: "default" | "tenant";
  persisted: boolean;
  updatedAt: string | null;
  updatedByDisplay: string | null;
};

export type SlaPolicySummaryCard = {
  id: string;
  label: string;
  value: string;
  hint?: string;
};

export type SlaPolicyPreviewItem = {
  id: string;
  title: string;
  subtitle: string;
  tone: "ok" | "warning" | "breached" | "neutral" | "followup";
};

export const SLA_POLICY_RULE_ORDER: readonly SlaPolicyRuleKey[] = SLA_POLICY_RULE_KEYS;

export const SLA_POLICY_CONFLICT_MESSAGE_TH =
  "Policy ถูกแก้ไขโดยผู้ใช้อื่น กรุณาโหลดข้อมูลใหม่ก่อนบันทึก";

export const SLA_POLICY_RULE_META: Record<
  SlaPolicyRuleKey,
  {
    titleEn: string;
    titleTh: string;
    behavior: string;
    runtimeDeferred?: boolean;
  }
> = {
  NEW_FIRST_RESPONSE: {
    titleEn: "New first response",
    titleTh: "ลูกค้าใหม่ / conversation ใหม่",
    behavior: "ต้องตอบครั้งแรกก่อนครบ SLA"
  },
  ONGOING_INBOUND_RESPONSE: {
    titleEn: "Ongoing inbound response",
    titleTh: "ลูกค้าส่งข้อความเข้ามาระหว่างกำลังคุย",
    behavior: "เริ่มนับใหม่เมื่อมี inbound message"
  },
  QUALIFIED_FOLLOW_UP: {
    titleEn: "Qualified follow-up",
    titleTh: "Lead ที่มีโอกาสขายสูง",
    behavior: "ต้อง follow-up ภายในเวลาที่กำหนด",
    runtimeDeferred: true
  },
  GENERAL_FOLLOW_UP: {
    titleEn: "General follow-up",
    titleTh: "Lead ที่ต้องติดตามทั่วไป",
    behavior: "แจ้งเตือนเมื่อถึงเวลาติดตาม",
    runtimeDeferred: true
  },
  REOPENED_RESPONSE: {
    titleEn: "Reopened response",
    titleTh: "ลูกค้ากลับมาทักหลังจากปิดเคส",
    behavior: "นับ SLA ใหม่เมื่อ conversation ถูก reopen"
  }
};

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePositiveIntInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export function minutesToUnitValue(minutes: number, unit: SlaTimeUnit): number {
  if (unit === "hours") return minutes / MINUTES_PER_HOUR;
  if (unit === "days") return minutes / MINUTES_PER_DAY;
  return minutes;
}

export function unitValueToMinutes(value: number, unit: SlaTimeUnit): number {
  if (unit === "hours") return value * MINUTES_PER_HOUR;
  if (unit === "days") return value * MINUTES_PER_DAY;
  return value;
}

export function pickDisplayUnit(minutes: number): SlaTimeUnit {
  if (minutes > 0 && minutes % MINUTES_PER_DAY === 0) return "days";
  if (minutes > 0 && minutes % MINUTES_PER_HOUR === 0) return "hours";
  return "minutes";
}

export function formatMinutesAsUnitLabel(minutes: number | null): string {
  if (minutes == null) return "—";
  const unit = pickDisplayUnit(minutes);
  const value = minutesToUnitValue(minutes, unit);
  const unitLabel = unit === "minutes" ? "นาที" : unit === "hours" ? "ชั่วโมง" : "วัน";
  return `${value} ${unitLabel}`;
}

function minutesToFormFields(minutes: number | null): { value: string; unit: SlaTimeUnit } {
  if (minutes == null) return { value: "", unit: "minutes" };
  const unit = pickDisplayUnit(minutes);
  const display = minutesToUnitValue(minutes, unit);
  return { value: String(display), unit };
}

function ruleFromApi(rule: TenantSlaPolicyRule): SlaRuleFormState {
  const target = minutesToFormFields(rule.enabled ? rule.targetMinutes : null);
  const warning = minutesToFormFields(rule.warningBeforeBreachMinutes);
  return {
    enabled: rule.enabled,
    targetValue: target.value,
    targetUnit: target.unit,
    warningOverrideValue: warning.value,
    warningOverrideUnit: warning.unit,
    label: rule.label
  };
}

export function apiDataToFormState(data: SlaPolicyApiData): SlaPolicyFormState {
  const warning = minutesToFormFields(data.warningBeforeBreachMinutes);
  const rules = {} as Record<SlaPolicyRuleKey, SlaRuleFormState>;
  for (const key of SLA_POLICY_RULE_ORDER) {
    rules[key] = ruleFromApi(data.rules[key]);
  }
  return {
    enabled: data.enabled,
    warningValue: warning.value,
    warningUnit: warning.unit,
    excludeResolved: data.excludeResolved,
    excludeArchived: data.excludeArchived,
    version: data.version,
    rules
  };
}

export function apiDataToPageMeta(data: SlaPolicyApiData): SlaPolicyPageMeta {
  const updatedBy = data.updatedBy;
  const updatedByDisplay =
    updatedBy?.displayName?.trim() ||
    updatedBy?.email?.trim() ||
    (updatedBy?.authUserId ? updatedBy.authUserId : null);
  return {
    source: data.source,
    persisted: data.persisted,
    updatedAt: data.updatedAt,
    updatedByDisplay
  };
}

function resolveRuleTargetMinutes(rule: SlaRuleFormState): number | null {
  if (!rule.enabled) return null;
  const parsed = parsePositiveIntInput(rule.targetValue);
  if (parsed == null) return null;
  return unitValueToMinutes(parsed, rule.targetUnit);
}

function resolveRuleWarningMinutes(rule: SlaRuleFormState): number | null {
  if (!rule.warningOverrideValue.trim()) return null;
  const parsed = parsePositiveIntInput(rule.warningOverrideValue);
  if (parsed == null) return null;
  return unitValueToMinutes(parsed, rule.warningOverrideUnit);
}

function resolveGlobalWarningMinutes(form: SlaPolicyFormState): number | null {
  const parsed = parsePositiveIntInput(form.warningValue);
  if (parsed == null) return null;
  return unitValueToMinutes(parsed, form.warningUnit);
}

export function formStateToPatchBody(form: SlaPolicyFormState): {
  version: number;
  enabled: boolean;
  warningBeforeBreachMinutes: number;
  excludeResolved: boolean;
  excludeArchived: boolean;
  rules: Record<SlaPolicyRuleKey, TenantSlaPolicyRule>;
} {
  const warningBeforeBreachMinutes = resolveGlobalWarningMinutes(form)!;
  const rules = {} as Record<SlaPolicyRuleKey, TenantSlaPolicyRule>;
  for (const key of SLA_POLICY_RULE_ORDER) {
    const rule = form.rules[key];
    const targetMinutes = resolveRuleTargetMinutes(rule);
    const warningBeforeBreachMinutesRule = resolveRuleWarningMinutes(rule);
    rules[key] = {
      enabled: rule.enabled,
      targetMinutes: rule.enabled ? targetMinutes : null,
      warningBeforeBreachMinutes: rule.enabled ? warningBeforeBreachMinutesRule : null,
      label: rule.label.trim()
    };
  }
  return {
    version: form.version,
    enabled: form.enabled,
    warningBeforeBreachMinutes,
    excludeResolved: form.excludeResolved,
    excludeArchived: form.excludeArchived,
    rules
  };
}

export type SlaPolicyValidationErrors = Record<string, string>;

export function validateSlaPolicyForm(form: SlaPolicyFormState): {
  valid: boolean;
  errors: SlaPolicyValidationErrors;
} {
  const errors: SlaPolicyValidationErrors = {};
  const globalWarning = resolveGlobalWarningMinutes(form);
  if (globalWarning == null) {
    errors["global.warning"] = "ต้องระบุเวลาเตือนก่อนครบ SLA เป็นจำนวนเต็มอย่างน้อย 1 นาที";
  }

  for (const key of SLA_POLICY_RULE_ORDER) {
    const rule = form.rules[key];
    const targetMinutes = resolveRuleTargetMinutes(rule);
    const ruleWarning = resolveRuleWarningMinutes(rule);

    if (rule.enabled) {
      if (targetMinutes == null) {
        errors[`rule.${key}.target`] = "ต้องระบุเป้าหมาย SLA เมื่อเปิดใช้งาน rule นี้";
      }
      if (rule.warningOverrideValue.trim() && ruleWarning == null) {
        errors[`rule.${key}.warning`] = "ค่าเตือนก่อนครบ SLA ต้องเป็นจำนวนเต็มอย่างน้อย 1 นาที";
      }
      if (
        targetMinutes != null &&
        ruleWarning != null &&
        ruleWarning >= targetMinutes
      ) {
        errors[`rule.${key}.warning`] = "เวลาเตือนต่อ rule ต้องน้อยกว่าเป้าหมาย SLA";
      }
    } else if (rule.targetValue.trim()) {
      errors[`rule.${key}.target`] = "ปิด rule แล้วไม่ต้องระบุเป้าหมาย SLA";
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function isSlaPolicyFormDirty(
  form: SlaPolicyFormState,
  baseline: SlaPolicyFormState
): boolean {
  return JSON.stringify(formStateToPatchBody(form)) !== JSON.stringify(formStateToPatchBody(baseline));
}

export function buildSlaPolicySummaryCards(form: SlaPolicyFormState): SlaPolicySummaryCard[] {
  const globalWarning = resolveGlobalWarningMinutes(form);
  const newFirst = resolveRuleTargetMinutes(form.rules.NEW_FIRST_RESPONSE);
  const ongoing = resolveRuleTargetMinutes(form.rules.ONGOING_INBOUND_RESPONSE);
  const reopened = resolveRuleTargetMinutes(form.rules.REOPENED_RESPONSE);

  return [
    {
      id: "global-warning",
      label: "เตือนก่อนครบ SLA (ทั้งระบบ)",
      value: globalWarning == null ? "—" : formatMinutesAsUnitLabel(globalWarning)
    },
    {
      id: "new-first",
      label: "New first response",
      value: form.rules.NEW_FIRST_RESPONSE.enabled
        ? formatMinutesAsUnitLabel(newFirst)
        : "ปิดใช้งาน"
    },
    {
      id: "ongoing",
      label: "Ongoing inbound response",
      value: form.rules.ONGOING_INBOUND_RESPONSE.enabled
        ? formatMinutesAsUnitLabel(ongoing)
        : "ปิดใช้งาน"
    },
    {
      id: "reopened",
      label: "Reopened response",
      value: form.rules.REOPENED_RESPONSE.enabled
        ? formatMinutesAsUnitLabel(reopened)
        : "ปิดใช้งาน"
    },
    {
      id: "policy-enabled",
      label: "สถานะ Policy",
      value: form.enabled ? "เปิดใช้งาน" : "ปิดใช้งาน"
    }
  ];
}

export function buildSlaPolicyPreviewItems(form: SlaPolicyFormState): SlaPolicyPreviewItem[] {
  const globalWarning = resolveGlobalWarningMinutes(form) ?? 0;
  const newTarget = resolveRuleTargetMinutes(form.rules.NEW_FIRST_RESPONSE);
  const qualifiedEnabled = form.rules.QUALIFIED_FOLLOW_UP.enabled;

  return [
    {
      id: "line-ok",
      title: "New lead from LINE · SLA OK",
      subtitle:
        newTarget != null && form.enabled
          ? `เหลือเวลามากกว่า ${formatMinutesAsUnitLabel(globalWarning)} ก่อนครบ ${formatMinutesAsUnitLabel(newTarget)}`
          : "ไม่มี SLA ที่ใช้งานสำหรับตัวอย่างนี้",
      tone: "ok"
    },
    {
      id: "fb-warning",
      title: "Facebook comment lead · Warning",
      subtitle: `อยู่ในช่วงเตือนก่อนครบ (${formatMinutesAsUnitLabel(globalWarning) || "—"})`,
      tone: "warning"
    },
    {
      id: "ig-breached",
      title: "Instagram DM · Breached",
      subtitle: "เลยเวลา SLA แล้ว — แสดง overdue",
      tone: "breached"
    },
    {
      id: "qualified-followup",
      title: "Qualified lead · Follow-up policy",
      subtitle: qualifiedEnabled
        ? "Rule ตั้งค่าแล้ว — runtime follow-up SLA อาจยังไม่เปิดใช้"
        : "Rule ปิดอยู่",
      tone: "followup"
    },
    {
      id: "no-sla",
      title: "No active SLA",
      subtitle: form.enabled ? "ไม่มี sla_due_at หรือ rule ที่เกี่ยวข้องปิดอยู่" : "Policy ปิด — ไม่ตั้ง sla_due_at",
      tone: "neutral"
    }
  ];
}

export function formatSlaPolicyUpdatedAt(iso: string | null): string {
  if (!iso?.trim()) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function sourcePolicyBadgeLabel(source: "default" | "tenant"): string {
  return source === "tenant" ? "Tenant policy" : "Default policy";
}

export function parseSlaPolicyGetResponse(
  body: unknown
): { ok: true; data: SlaPolicyApiData } | { ok: false; error: string } {
  if (!isRecord(body) || !isRecord(body.data)) {
    return { ok: false, error: "Invalid response: missing data object." };
  }
  const data = body.data;
  if (data.source !== "default" && data.source !== "tenant") {
    return { ok: false, error: "Invalid response: unknown policy source." };
  }
  if (typeof data.enabled !== "boolean") {
    return { ok: false, error: "Invalid response: enabled flag missing." };
  }
  if (!isRecord(data.rules)) {
    return { ok: false, error: "Invalid response: rules missing." };
  }
  for (const key of SLA_POLICY_RULE_ORDER) {
    if (!isRecord(data.rules[key])) {
      return { ok: false, error: `Invalid response: rule ${key} missing.` };
    }
  }
  return { ok: true, data: data as SlaPolicyApiData };
}

export function parseSlaPolicyPatchResponse(
  body: unknown
): { ok: true; data: SlaPolicyApiData } | { ok: false; error: string } {
  return parseSlaPolicyGetResponse(body);
}

export function mapSlaPolicyLoadError(status: number, body: unknown): string {
  if (status === 401) return "Sign in required. Your session may have expired.";
  if (status === 403) return "คุณไม่มีสิทธิ์เข้าถึงหน้านี้";
  if (isRecord(body) && typeof body.error === "string" && body.error.trim()) {
    return body.error.trim();
  }
  if (status >= 500) return "โหลด SLA Policy ไม่สำเร็จ";
  return `โหลด SLA Policy ไม่สำเร็จ (HTTP ${status})`;
}

export function mapSlaPolicySaveError(status: number, body: unknown): string {
  if (status === 409) return SLA_POLICY_CONFLICT_MESSAGE_TH;
  if (status === 400) {
    if (isRecord(body) && typeof body.error === "string" && body.error.trim()) {
      return body.error.trim();
    }
    return "ไม่สามารถบันทึกได้ กรุณาตรวจสอบข้อมูล";
  }
  if (status === 403) return "คุณไม่มีสิทธิ์แก้ไข SLA Policy";
  if (status >= 500) return "ไม่สามารถบันทึกได้ กรุณาตรวจสอบข้อมูล";
  return "ไม่สามารถบันทึกได้ กรุณาตรวจสอบข้อมูล";
}

export function isSlaPolicyConflictResponse(status: number): boolean {
  return status === 409;
}
