import type { SlaPolicyApiResponse } from "../../domain/slaPolicyApi.js";
import {
  isSlaPolicyVersionConflict,
  slaPolicyVersionConflict,
  type SlaPolicyRepository
} from "../../domain/slaPolicyApi.js";
import type { TenantSlaPolicy, TenantSlaPolicyUpdatedBy } from "../../domain/tenantSlaPolicy.js";
import { validateTenantSlaPolicy } from "../../domain/tenantSlaPolicy.js";
import { resolveSlaPolicyUpdatedBy, toSlaPolicyApiResponse } from "./getTenantSlaPolicy.js";

export class UpdateTenantSlaPolicyUseCase {
  constructor(
    private readonly deps: {
      slaPolicyRepository: Pick<SlaPolicyRepository, "findByTenantId" | "create" | "update">;
      resolveUpdatedBy?: (authUserId: string) => Promise<TenantSlaPolicyUpdatedBy | null>;
    }
  ) {}

  async execute(input: {
    tenantId: string;
    updatedByAuthUserId: string;
    patch: TenantSlaPolicy;
  }): Promise<SlaPolicyApiResponse> {
    const validated = validateTenantSlaPolicy(input.patch);
    const existing = await this.deps.slaPolicyRepository.findByTenantId(input.tenantId);

    if (!existing && validated.version !== 0) {
      throw slaPolicyVersionConflict(0);
    }

    try {
      const saved = !existing
        ? await this.deps.slaPolicyRepository.create({
            tenantId: input.tenantId,
            policy: { ...validated, version: 1 },
            updatedByAuthUserId: input.updatedByAuthUserId
          })
        : await this.deps.slaPolicyRepository.update({
            tenantId: input.tenantId,
            expectedVersion: existing.version,
            policy: validated,
            updatedByAuthUserId: input.updatedByAuthUserId
          });

      const updatedBy = await resolveSlaPolicyUpdatedBy({
        updatedByAuthUserId: saved.updatedByAuthUserId,
        lookup: this.deps.resolveUpdatedBy
      });

      return toSlaPolicyApiResponse({
        policy: saved,
        source: "tenant",
        persisted: true,
        updatedAt: saved.updatedAt,
        updatedBy
      });
    } catch (error) {
      if (isSlaPolicyVersionConflict(error)) {
        throw error;
      }
      throw error;
    }
  }

  /** Validates version before write; exposed for route-level 409 mapping. */
  async assertPatchVersion(input: { tenantId: string; patchVersion: number }): Promise<void> {
    const existing = await this.deps.slaPolicyRepository.findByTenantId(input.tenantId);
    if (!existing) {
      if (input.patchVersion !== 0) {
        throw slaPolicyVersionConflict(0);
      }
      return;
    }
    if (input.patchVersion !== existing.version) {
      throw slaPolicyVersionConflict(existing.version);
    }
  }
}
