import type { TenantSlaPolicy } from "../../domain/tenantSlaPolicy.js";
import {
  utcInboxFilterClock,
  type UtcInboxFilterClock
} from "../../interfaces/api/conversationListInboxFilters.js";
import {
  loadEffectiveTenantSlaPolicy,
  type LoadEffectiveTenantSlaPolicyOptions
} from "./loadEffectiveTenantSlaPolicy.js";
import type { SlaPolicyRepository } from "../../domain/slaPolicyApi.js";

export function inboxFilterClockFromPolicy(
  now: Date,
  policy: Pick<TenantSlaPolicy, "warningBeforeBreachMinutes">
): UtcInboxFilterClock {
  return utcInboxFilterClock(now, policy.warningBeforeBreachMinutes);
}

export async function loadInboxFilterClockForTenant(
  tenantId: string,
  now: Date = new Date(),
  repo?: Pick<SlaPolicyRepository, "findByTenantId">,
  options?: LoadEffectiveTenantSlaPolicyOptions
): Promise<UtcInboxFilterClock> {
  const policy = await loadEffectiveTenantSlaPolicy(tenantId, repo, options);
  return inboxFilterClockFromPolicy(now, policy);
}
