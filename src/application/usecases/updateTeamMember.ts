import type { AuthContext } from "../../interfaces/api/auth.js";
import type { PatchSalesAgentInput, SalesAgentRepository, TeamMemberRole, TeamMemberRow } from "../../domain/ports.js";
import { normalizeEmailForStorage } from "../../infrastructure/supabase/emailIlike.js";
import {
  assertCanDeactivateOrDemoteAdmin,
  canManagerUpdateExistingTarget,
  canUpdateTeamMemberRole
} from "../authorization/teamMemberPermissions.js";

export class UpdateTeamMemberUseCase {
  constructor(private readonly deps: { salesAgentRepository: SalesAgentRepository }) {}

  async execute(input: {
    auth: AuthContext;
    salesAgentId: string;
    patch: PatchSalesAgentInput["patch"];
  }): Promise<TeamMemberRow> {
    const target = await this.deps.salesAgentRepository.findByIdInTenant(input.auth.tenantId, input.salesAgentId);
    if (!target) {
      throw new Error("Team member not found");
    }
    const targetRole = target.role as TeamMemberRole;
    const targetStatus = target.status as "ACTIVE" | "INACTIVE";

    if (input.auth.role === "MANAGER" && !canManagerUpdateExistingTarget(targetRole)) {
      throw new Error("Forbidden update team member");
    }
    if (!canUpdateTeamMemberRole(input.auth.role, targetRole, input.patch.role)) {
      throw new Error("Forbidden update team member role");
    }

    if (input.patch.email !== undefined) {
      const nextEmail = normalizeEmailForStorage(input.patch.email);
      const currentEmail = normalizeEmailForStorage(target.email);
      if (nextEmail !== currentEmail) {
        const dup = await this.deps.salesAgentRepository.findByEmailInTenant(input.auth.tenantId, nextEmail);
        if (dup && dup.id !== input.salesAgentId) {
          throw new Error("Duplicate team member email");
        }
      }
    }

    const activeAdminCount = await this.deps.salesAgentRepository.countActiveAdmins(input.auth.tenantId);
    assertCanDeactivateOrDemoteAdmin({
      actorSalesAgentId: input.auth.salesAgentId,
      targetId: input.salesAgentId,
      targetRole,
      targetStatus,
      patchStatus: input.patch.status,
      patchRole: input.patch.role,
      activeAdminCount
    });

    return this.deps.salesAgentRepository.update({
      tenantId: input.auth.tenantId,
      salesAgentId: input.salesAgentId,
      patch: input.patch
    });
  }
}
