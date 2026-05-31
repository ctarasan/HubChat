import type { SlaPolicyRepository } from "../../domain/slaPolicyApi.js";
import { buildDefaultTenantSlaPolicy, type TenantSlaPolicy } from "../../domain/tenantSlaPolicy.js";
import { SupabaseSlaPolicyRepository } from "../../infrastructure/adapters/repositories/supabaseSlaPolicyRepository.js";
import { createServiceSupabaseClient } from "../../infrastructure/supabase/client.js";

let runtimeSlaPolicyRepository: Pick<SlaPolicyRepository, "findByTenantId"> | null = null;

function defaultRuntimeSlaPolicyRepository(): Pick<SlaPolicyRepository, "findByTenantId"> {
  if (!runtimeSlaPolicyRepository) {
    runtimeSlaPolicyRepository = new SupabaseSlaPolicyRepository(createServiceSupabaseClient());
  }
  return runtimeSlaPolicyRepository;
}

/** Load tenant SLA policy for inbound runtime; falls back to centralized default factory when no row exists. */
export async function loadEffectiveTenantSlaPolicy(
  tenantId: string,
  repo?: Pick<SlaPolicyRepository, "findByTenantId">
): Promise<TenantSlaPolicy> {
  try {
    const resolvedRepo = repo ?? defaultRuntimeSlaPolicyRepository();
    const row = await resolvedRepo.findByTenantId(tenantId);
    return row ?? buildDefaultTenantSlaPolicy();
  } catch {
    return buildDefaultTenantSlaPolicy();
  }
}
