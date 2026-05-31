import type { SlaPolicyApiResponse } from "../../domain/slaPolicyApi.js";
import type { SlaPolicyRepository } from "../../domain/slaPolicyApi.js";
import type { TenantSlaPolicyUpdatedBy } from "../../domain/tenantSlaPolicy.js";
import {
  SLA_POLICY_DEFERRED_FIELDS,
  buildDefaultTenantSlaPolicy
} from "../../domain/tenantSlaPolicy.js";

export function resolveSlaPolicyUpdatedBy(input: {
  updatedByAuthUserId: string | null;
  lookup?: (authUserId: string) => Promise<TenantSlaPolicyUpdatedBy | null>;
}): Promise<TenantSlaPolicyUpdatedBy | null> {
  if (!input.updatedByAuthUserId) return Promise.resolve(null);
  if (!input.lookup) {
    return Promise.resolve({
      authUserId: input.updatedByAuthUserId,
      displayName: null,
      email: null
    });
  }
  return input.lookup(input.updatedByAuthUserId).then(
    (found) =>
      found ?? {
        authUserId: input.updatedByAuthUserId!,
        displayName: null,
        email: null
      }
  );
}

export function toSlaPolicyApiResponse(input: {
  policy: ReturnType<typeof buildDefaultTenantSlaPolicy> | import("../../domain/tenantSlaPolicy.js").TenantSlaPolicy;
  source: "default" | "tenant";
  persisted: boolean;
  updatedAt: string | null;
  updatedBy: TenantSlaPolicyUpdatedBy | null;
}): SlaPolicyApiResponse {
  return {
    source: input.source,
    persisted: input.persisted,
    enabled: input.policy.enabled,
    warningBeforeBreachMinutes: input.policy.warningBeforeBreachMinutes,
    excludeResolved: input.policy.excludeResolved,
    excludeArchived: input.policy.excludeArchived,
    rules: input.policy.rules,
    version: input.policy.version,
    updatedAt: input.updatedAt,
    updatedBy: input.updatedBy,
    deferredFields: SLA_POLICY_DEFERRED_FIELDS
  };
}

export class GetTenantSlaPolicyUseCase {
  constructor(
    private readonly deps: {
      slaPolicyRepository: Pick<SlaPolicyRepository, "findByTenantId">;
      resolveUpdatedBy?: (authUserId: string) => Promise<TenantSlaPolicyUpdatedBy | null>;
    }
  ) {}

  async execute(input: { tenantId: string }): Promise<SlaPolicyApiResponse> {
    const row = await this.deps.slaPolicyRepository.findByTenantId(input.tenantId);
    if (!row) {
      return toSlaPolicyApiResponse({
        policy: buildDefaultTenantSlaPolicy(),
        source: "default",
        persisted: false,
        updatedAt: null,
        updatedBy: null
      });
    }

    const updatedBy = await resolveSlaPolicyUpdatedBy({
      updatedByAuthUserId: row.updatedByAuthUserId,
      lookup: this.deps.resolveUpdatedBy
    });

    return toSlaPolicyApiResponse({
      policy: row,
      source: "tenant",
      persisted: true,
      updatedAt: row.updatedAt,
      updatedBy
    });
  }
}
