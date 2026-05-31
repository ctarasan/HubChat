/**
 * Tenant-scoped SLA policy (SLA-1 foundation).
 * Default business minutes exist only in buildDefaultTenantSlaPolicy().
 */

import type { ConversationStatus } from "./entities.js";
import { computeSlaDueAtFromCustomerMessage } from "./slaPolicy.js";

export const SLA_POLICY_RULE_KEYS = [
  "NEW_FIRST_RESPONSE",
  "ONGOING_INBOUND_RESPONSE",
  "QUALIFIED_FOLLOW_UP",
  "GENERAL_FOLLOW_UP",
  "REOPENED_RESPONSE"
] as const;

export type SlaPolicyRuleKey = (typeof SLA_POLICY_RULE_KEYS)[number];

export type TenantSlaPolicyRule = {
  enabled: boolean;
  targetMinutes: number | null;
  warningBeforeBreachMinutes: number | null;
  label: string;
};

export type TenantSlaPolicy = {
  enabled: boolean;
  warningBeforeBreachMinutes: number;
  excludeResolved: boolean;
  excludeArchived: boolean;
  rules: Record<SlaPolicyRuleKey, TenantSlaPolicyRule>;
  version: number;
};

export type TenantSlaPolicyUpdatedBy = {
  authUserId: string;
  displayName: string | null;
  email: string | null;
};

export type TenantSlaPolicyRecord = TenantSlaPolicy & {
  tenantId: string;
  updatedAt: string;
  updatedByAuthUserId: string | null;
};

export const SLA_POLICY_DEFERRED_FIELD_KEYS = [
  "businessHours",
  "channelOverrides",
  "auditHistory"
] as const;

/** Technical validation bounds (not business defaults). */
export const SLA_POLICY_MIN_MINUTES = 1;
export const SLA_POLICY_MAX_MINUTES = 10_080;

export const SLA_POLICY_DEFERRED_FIELDS = {
  businessHours: "not_supported",
  channelOverrides: "not_supported",
  auditHistory: "not_supported"
} as const;

const DEFAULT_RULE_LABELS: Record<SlaPolicyRuleKey, string> = {
  NEW_FIRST_RESPONSE: "First response",
  ONGOING_INBOUND_RESPONSE: "Ongoing inbound response",
  QUALIFIED_FOLLOW_UP: "Qualified follow-up",
  GENERAL_FOLLOW_UP: "General follow-up",
  REOPENED_RESPONSE: "Reopened conversation response"
};

function defaultRule(
  key: SlaPolicyRuleKey,
  opts: { enabled: boolean; targetMinutes: number | null }
): TenantSlaPolicyRule {
  return {
    enabled: opts.enabled,
    targetMinutes: opts.targetMinutes,
    warningBeforeBreachMinutes: null,
    label: DEFAULT_RULE_LABELS[key]
  };
}

/** Editable bootstrap policy returned when no tenant row exists (GET source=default). */
export function buildDefaultTenantSlaPolicy(): TenantSlaPolicy {
  const inboundTargetMinutes = 24 * 60;
  const warningBeforeBreachMinutes = 2 * 60;

  return {
    enabled: true,
    warningBeforeBreachMinutes,
    excludeResolved: false,
    excludeArchived: false,
    version: 0,
    rules: {
      NEW_FIRST_RESPONSE: defaultRule("NEW_FIRST_RESPONSE", {
        enabled: true,
        targetMinutes: inboundTargetMinutes
      }),
      ONGOING_INBOUND_RESPONSE: defaultRule("ONGOING_INBOUND_RESPONSE", {
        enabled: true,
        targetMinutes: inboundTargetMinutes
      }),
      QUALIFIED_FOLLOW_UP: defaultRule("QUALIFIED_FOLLOW_UP", {
        enabled: false,
        targetMinutes: null
      }),
      GENERAL_FOLLOW_UP: defaultRule("GENERAL_FOLLOW_UP", {
        enabled: false,
        targetMinutes: null
      }),
      REOPENED_RESPONSE: defaultRule("REOPENED_RESPONSE", {
        enabled: true,
        targetMinutes: inboundTargetMinutes
      })
    }
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertIntegerMinutes(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${field} must be an integer`);
  }
  if (value < min || value > max) {
    throw new Error(`${field} must be between ${min} and ${max}`);
  }
  return value;
}

function assertOptionalIntegerMinutes(
  value: unknown,
  field: string,
  min: number,
  max: number
): number | null {
  if (value === null || value === undefined) return null;
  return assertIntegerMinutes(value, field, min, max);
}

function assertSafeLabel(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} must not be empty`);
  }
  if (trimmed.length > 120) {
    throw new Error(`${field} must be at most 120 characters`);
  }
  if (/[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/.test(trimmed)) {
    throw new Error(`${field} contains unsupported control characters`);
  }
  return trimmed;
}

function validateRuleKeySet(ruleKeys: string[]): void {
  const unknown = ruleKeys.filter((key) => !SLA_POLICY_RULE_KEYS.includes(key as SlaPolicyRuleKey));
  if (unknown.length > 0) {
    throw new Error(`Unknown SLA policy rule keys: ${unknown.join(", ")}`);
  }
  const missing = SLA_POLICY_RULE_KEYS.filter((key) => !ruleKeys.includes(key));
  if (missing.length > 0) {
    throw new Error(`Missing SLA policy rule keys: ${missing.join(", ")}`);
  }
}

export function rejectDeferredSlaPolicyFields(input: Record<string, unknown>): void {
  for (const key of SLA_POLICY_DEFERRED_FIELD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      throw new Error(`Field not supported: ${key}`);
    }
  }
}

export function validateTenantSlaPolicy(input: TenantSlaPolicy): TenantSlaPolicy {
  if (typeof input.enabled !== "boolean") {
    throw new Error("enabled must be a boolean");
  }

  const warningBeforeBreachMinutes = assertIntegerMinutes(
    input.warningBeforeBreachMinutes,
    "warningBeforeBreachMinutes",
    SLA_POLICY_MIN_MINUTES,
    SLA_POLICY_MAX_MINUTES
  );

  if (typeof input.excludeResolved !== "boolean") {
    throw new Error("excludeResolved must be a boolean");
  }
  if (typeof input.excludeArchived !== "boolean") {
    throw new Error("excludeArchived must be a boolean");
  }

  if (typeof input.version !== "number" || !Number.isInteger(input.version) || input.version < 0) {
    throw new Error("version must be a non-negative integer");
  }

  if (!isPlainObject(input.rules)) {
    throw new Error("rules must be an object");
  }

  validateRuleKeySet(Object.keys(input.rules));

  const rules = {} as Record<SlaPolicyRuleKey, TenantSlaPolicyRule>;
  for (const key of SLA_POLICY_RULE_KEYS) {
    const raw = input.rules[key];
    if (!isPlainObject(raw)) {
      throw new Error(`rules.${key} must be an object`);
    }
    if (typeof raw.enabled !== "boolean") {
      throw new Error(`rules.${key}.enabled must be a boolean`);
    }

    const label = assertSafeLabel(raw.label, `rules.${key}.label`);
    const targetMinutes = assertOptionalIntegerMinutes(
      raw.targetMinutes,
      `rules.${key}.targetMinutes`,
      SLA_POLICY_MIN_MINUTES,
      SLA_POLICY_MAX_MINUTES
    );
    const ruleWarning = assertOptionalIntegerMinutes(
      raw.warningBeforeBreachMinutes,
      `rules.${key}.warningBeforeBreachMinutes`,
      SLA_POLICY_MIN_MINUTES,
      SLA_POLICY_MAX_MINUTES
    );

    if (raw.enabled) {
      if (targetMinutes === null) {
        throw new Error(`rules.${key}.targetMinutes is required when enabled`);
      }
    } else if (typeof raw.targetMinutes === "number") {
      throw new Error(`rules.${key}.targetMinutes must be null when disabled`);
    }

    if (ruleWarning !== null && targetMinutes !== null && ruleWarning >= targetMinutes) {
      throw new Error(`rules.${key}.warningBeforeBreachMinutes must be less than targetMinutes`);
    }

    rules[key] = {
      enabled: raw.enabled,
      targetMinutes: raw.enabled ? targetMinutes : null,
      warningBeforeBreachMinutes: ruleWarning,
      label
    };
  }

  return {
    enabled: input.enabled,
    warningBeforeBreachMinutes,
    excludeResolved: input.excludeResolved,
    excludeArchived: input.excludeArchived,
    rules,
    version: input.version
  };
}

export function parseTenantSlaPolicyRulesJson(value: unknown): Record<SlaPolicyRuleKey, TenantSlaPolicyRule> {
  if (!isPlainObject(value)) {
    throw new Error("rules must be a JSON object");
  }
  return validateTenantSlaPolicy({
    ...buildDefaultTenantSlaPolicy(),
    rules: value as Record<SlaPolicyRuleKey, TenantSlaPolicyRule>
  }).rules;
}

export type ResolveInboundSlaRuleInput = {
  policy: TenantSlaPolicy;
  conversationStatus: ConversationStatus;
  firstResponseAt: Date | null;
  reopenFromResolved: boolean;
};

export type ResolvedInboundSlaRule = {
  ruleKey: SlaPolicyRuleKey;
  targetMinutes: number;
};

/** Select inbound SLA stage rule; returns null when SLA must not be set. */
export function resolveInboundSlaRule(input: ResolveInboundSlaRuleInput): ResolvedInboundSlaRule | null {
  if (!input.policy.enabled) return null;

  if (input.conversationStatus === "ARCHIVED" && input.policy.excludeArchived) {
    return null;
  }

  if (input.conversationStatus === "RESOLVED" && input.policy.excludeResolved && !input.reopenFromResolved) {
    return null;
  }

  const ruleKey: SlaPolicyRuleKey = input.reopenFromResolved
    ? "REOPENED_RESPONSE"
    : !input.firstResponseAt
      ? "NEW_FIRST_RESPONSE"
      : "ONGOING_INBOUND_RESPONSE";

  const rule = input.policy.rules[ruleKey];
  if (!rule.enabled || rule.targetMinutes === null) {
    return null;
  }

  return { ruleKey, targetMinutes: rule.targetMinutes };
}

/** Compute inbound `sla_due_at` from tenant policy and conversation context. */
export function computeSlaDueAtFromPolicy(
  customerMessageAt: Date,
  input: ResolveInboundSlaRuleInput
): Date | null {
  const resolved = resolveInboundSlaRule(input);
  if (!resolved) return null;
  return computeSlaDueAtFromCustomerMessage(customerMessageAt, {
    slaMs: resolved.targetMinutes * 60_000
  });
}
