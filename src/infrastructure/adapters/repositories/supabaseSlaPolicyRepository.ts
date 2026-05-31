import type { SupabaseClient } from "@supabase/supabase-js";
import type { SlaPolicyRepository } from "../../../domain/slaPolicyApi.js";
import { slaPolicyVersionConflict } from "../../../domain/slaPolicyApi.js";
import type { TenantSlaPolicy, TenantSlaPolicyRecord } from "../../../domain/tenantSlaPolicy.js";
import {
  parseTenantSlaPolicyRulesJson,
  validateTenantSlaPolicy
} from "../../../domain/tenantSlaPolicy.js";
import { throwIfSupabaseError } from "../../../lib/supabasePostgrestError.js";

const SELECT_COLUMNS =
  "tenant_id,enabled,warning_before_breach_minutes,exclude_resolved,exclude_archived,rules,version,updated_at,updated_by_auth_user_id";

type DbRow = {
  tenant_id: string;
  enabled: boolean;
  warning_before_breach_minutes: number;
  exclude_resolved: boolean;
  exclude_archived: boolean;
  rules: unknown;
  version: number;
  updated_at: string;
  updated_by_auth_user_id: string | null;
};

function mapRow(row: DbRow): TenantSlaPolicyRecord {
  const rules = parseTenantSlaPolicyRulesJson(row.rules);
  const policy = validateTenantSlaPolicy({
    enabled: row.enabled,
    warningBeforeBreachMinutes: row.warning_before_breach_minutes,
    excludeResolved: row.exclude_resolved,
    excludeArchived: row.exclude_archived,
    rules,
    version: row.version
  });

  return {
    tenantId: row.tenant_id,
    ...policy,
    updatedAt: row.updated_at,
    updatedByAuthUserId: row.updated_by_auth_user_id
  };
}

function toDbPayload(
  tenantId: string,
  policy: TenantSlaPolicy,
  updatedByAuthUserId: string,
  updatedAtIso: string
): Record<string, unknown> {
  const validated = validateTenantSlaPolicy(policy);
  return {
    tenant_id: tenantId,
    enabled: validated.enabled,
    warning_before_breach_minutes: validated.warningBeforeBreachMinutes,
    exclude_resolved: validated.excludeResolved,
    exclude_archived: validated.excludeArchived,
    rules: validated.rules,
    version: validated.version,
    updated_at: updatedAtIso,
    updated_by_auth_user_id: updatedByAuthUserId
  };
}

export class SupabaseSlaPolicyRepository implements SlaPolicyRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findByTenantId(tenantId: string): Promise<TenantSlaPolicyRecord | null> {
    const { data, error } = await this.supabase
      .from("tenant_sla_policies")
      .select(SELECT_COLUMNS)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    throwIfSupabaseError(error);
    if (!data) return null;
    return mapRow(data as DbRow);
  }

  async create(input: {
    tenantId: string;
    policy: TenantSlaPolicy;
    updatedByAuthUserId: string;
  }): Promise<TenantSlaPolicyRecord> {
    const nowIso = new Date().toISOString();
    const payload = toDbPayload(input.tenantId, input.policy, input.updatedByAuthUserId, nowIso);
    const { data, error } = await this.supabase
      .from("tenant_sla_policies")
      .insert(payload)
      .select(SELECT_COLUMNS)
      .single();
    throwIfSupabaseError(error);
    return mapRow(data as DbRow);
  }

  async update(input: {
    tenantId: string;
    expectedVersion: number;
    policy: TenantSlaPolicy;
    updatedByAuthUserId: string;
  }): Promise<TenantSlaPolicyRecord> {
    const existing = await this.findByTenantId(input.tenantId);
    if (!existing) {
      throw slaPolicyVersionConflict(0);
    }
    if (existing.version !== input.expectedVersion) {
      throw slaPolicyVersionConflict(existing.version);
    }

    const nowIso = new Date().toISOString();
    const nextPolicy: TenantSlaPolicy = {
      ...input.policy,
      version: existing.version + 1
    };
    const payload = toDbPayload(input.tenantId, nextPolicy, input.updatedByAuthUserId, nowIso);

    const { data, error } = await this.supabase
      .from("tenant_sla_policies")
      .update(payload)
      .eq("tenant_id", input.tenantId)
      .eq("version", input.expectedVersion)
      .select(SELECT_COLUMNS)
      .maybeSingle();
    throwIfSupabaseError(error);

    if (!data) {
      const latest = await this.findByTenantId(input.tenantId);
      throw slaPolicyVersionConflict(latest?.version ?? existing.version);
    }

    return mapRow(data as DbRow);
  }
}
