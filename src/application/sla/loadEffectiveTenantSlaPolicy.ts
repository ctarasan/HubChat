import type { SlaPolicyRepository } from "../../domain/slaPolicyApi.js";
import { buildDefaultTenantSlaPolicy, type TenantSlaPolicy } from "../../domain/tenantSlaPolicy.js";
import { toClientErrorDetail, type ClientErrorDetail } from "../../lib/supabasePostgrestError.js";
import { SupabaseSlaPolicyRepository } from "../../infrastructure/adapters/repositories/supabaseSlaPolicyRepository.js";
import { createServiceSupabaseClient } from "../../infrastructure/supabase/client.js";
import pino from "pino";

const logger = pino({ name: "sla-policy-loader" });

let runtimeSlaPolicyRepository: Pick<SlaPolicyRepository, "findByTenantId"> | null = null;

function defaultRuntimeSlaPolicyRepository(): Pick<SlaPolicyRepository, "findByTenantId"> {
  if (!runtimeSlaPolicyRepository) {
    runtimeSlaPolicyRepository = new SupabaseSlaPolicyRepository(createServiceSupabaseClient());
  }
  return runtimeSlaPolicyRepository;
}

export type SlaPolicyOperationalFallbackReason = "repository_unavailable" | "repository_query_failed";

export type SlaPolicyOperationalFallbackContext = {
  tenantId: string;
  operation: "resolveRepository" | "findByTenantId";
  reason: SlaPolicyOperationalFallbackReason;
  error: ClientErrorDetail;
};

export type LoadEffectiveTenantSlaPolicyOptions = {
  createRuntimeRepo?: () => Pick<SlaPolicyRepository, "findByTenantId">;
  onOperationalFallback?: (context: SlaPolicyOperationalFallbackContext) => void;
};

function logOperationalFallback(context: SlaPolicyOperationalFallbackContext): void {
  logger.error(
    {
      tenantId: context.tenantId,
      operation: context.operation,
      reason: context.reason,
      errorCode: context.error.code,
      errorMessage: context.error.message,
      errorDetails: context.error.details,
      errorHint: context.error.hint
    },
    "SLA policy operational fallback to default factory"
  );
}

function fallbackToDefaultPolicy(
  tenantId: string,
  operation: SlaPolicyOperationalFallbackContext["operation"],
  reason: SlaPolicyOperationalFallbackReason,
  error: unknown,
  onOperationalFallback?: LoadEffectiveTenantSlaPolicyOptions["onOperationalFallback"]
): TenantSlaPolicy {
  const context: SlaPolicyOperationalFallbackContext = {
    tenantId,
    operation,
    reason,
    error: toClientErrorDetail(error)
  };
  (onOperationalFallback ?? logOperationalFallback)(context);
  return buildDefaultTenantSlaPolicy();
}

async function loadFromRepository(
  tenantId: string,
  repo: Pick<SlaPolicyRepository, "findByTenantId">,
  onOperationalFallback?: LoadEffectiveTenantSlaPolicyOptions["onOperationalFallback"]
): Promise<TenantSlaPolicy> {
  try {
    const row = await repo.findByTenantId(tenantId);
    if (!row) {
      return buildDefaultTenantSlaPolicy();
    }
    return row;
  } catch (error) {
    return fallbackToDefaultPolicy(
      tenantId,
      "findByTenantId",
      "repository_query_failed",
      error,
      onOperationalFallback
    );
  }
}

/**
 * Load tenant SLA policy for inbound runtime.
 * Missing row (null) uses centralized default factory without operational fallback logging.
 * Repository/DB failures log safe context then fall back to default factory.
 */
export async function loadEffectiveTenantSlaPolicy(
  tenantId: string,
  repo?: Pick<SlaPolicyRepository, "findByTenantId">,
  options?: LoadEffectiveTenantSlaPolicyOptions
): Promise<TenantSlaPolicy> {
  if (repo) {
    return loadFromRepository(tenantId, repo, options?.onOperationalFallback);
  }

  const createRuntimeRepo = options?.createRuntimeRepo ?? defaultRuntimeSlaPolicyRepository;
  let resolvedRepo: Pick<SlaPolicyRepository, "findByTenantId">;
  try {
    resolvedRepo = createRuntimeRepo();
  } catch (error) {
    return fallbackToDefaultPolicy(
      tenantId,
      "resolveRepository",
      "repository_unavailable",
      error,
      options?.onOperationalFallback
    );
  }

  return loadFromRepository(tenantId, resolvedRepo, options?.onOperationalFallback);
}
