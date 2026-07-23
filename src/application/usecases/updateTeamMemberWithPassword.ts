import type { AuthContext } from "../../interfaces/api/auth.js";
import type { PatchSalesAgentInput, SalesAgentRepository, TeamMemberRow } from "../../domain/ports.js";
import type { TeamMemberPasswordAuditSink } from "../../lib/teamMemberPasswordAudit.js";
import {
  buildTeamMemberPasswordAuditEvent,
  emitTeamMemberPasswordAudit,
  logTeamMemberPasswordCompensationFailure
} from "../../lib/teamMemberPasswordAudit.js";
import { UpdateTeamMemberUseCase } from "./updateTeamMember.js";

export type UpdateTeamMemberWithPasswordDeps = {
  salesAgentRepository: SalesAgentRepository;
  findAuthUserIdByEmail: (email: string) => Promise<string | null>;
  updateAuthUserPasswordById: (userId: string, password: string) => Promise<void>;
  recordPasswordAudit: TeamMemberPasswordAuditSink;
};

function snapshotMemberPatch(row: TeamMemberRow): PatchSalesAgentInput["patch"] {
  return {
    name: row.name,
    email: row.email,
    role: row.role as PatchSalesAgentInput["patch"]["role"],
    status: row.status as PatchSalesAgentInput["patch"]["status"],
    assignmentEnabled: row.assignmentEnabled,
    assignmentMode: row.assignmentMode,
    maxActiveConversations: row.maxActiveConversations,
    maxActiveLeads: row.maxActiveLeads
  };
}

export class UpdateTeamMemberWithPasswordUseCase {
  constructor(private readonly deps: UpdateTeamMemberWithPasswordDeps) {}

  async execute(input: {
    auth: AuthContext;
    salesAgentId: string;
    patch: PatchSalesAgentInput["patch"];
    newPassword?: string;
  }): Promise<TeamMemberRow> {
    const hasPassword = typeof input.newPassword === "string" && input.newPassword.length > 0;
    const hasProfilePatch = Object.keys(input.patch).length > 0;
    const updateTeamMember = new UpdateTeamMemberUseCase({ salesAgentRepository: this.deps.salesAgentRepository });

    if (!hasPassword) {
      return updateTeamMember.execute({
        auth: input.auth,
        salesAgentId: input.salesAgentId,
        patch: input.patch
      });
    }

    if (input.auth.role !== "ADMIN") {
      throw new Error("Forbidden update team member password");
    }

    const target = await this.deps.salesAgentRepository.findByIdInTenant(input.auth.tenantId, input.salesAgentId);
    if (!target) {
      throw new Error("Team member not found");
    }

    const authUserId = await this.deps.findAuthUserIdByEmail(target.email);
    if (!authUserId) {
      throw new Error("This team member does not have a login account.");
    }

    const originalPatch = snapshotMemberPatch(target);
    let updatedRow = target;

    if (hasProfilePatch) {
      updatedRow = await updateTeamMember.execute({
        auth: input.auth,
        salesAgentId: input.salesAgentId,
        patch: input.patch
      });
    }

    try {
      await this.deps.updateAuthUserPasswordById(authUserId, input.newPassword!);
      emitTeamMemberPasswordAudit(
        this.deps.recordPasswordAudit,
        buildTeamMemberPasswordAuditEvent({
          action: "TEAM_MEMBER_PASSWORD_UPDATED",
          actorUserId: input.auth.userId,
          targetMemberId: input.salesAgentId,
          tenantId: input.auth.tenantId,
          success: true,
          errorCategory: null
        })
      );
      return updatedRow;
    } catch {
      if (hasProfilePatch) {
        try {
          await this.deps.salesAgentRepository.update({
            tenantId: input.auth.tenantId,
            salesAgentId: input.salesAgentId,
            patch: originalPatch
          });
        } catch {
          logTeamMemberPasswordCompensationFailure({
            action: "TEAM_MEMBER_PASSWORD_COMPENSATION_FAILED",
            tenantId: input.auth.tenantId,
            targetMemberId: input.salesAgentId,
            actorUserId: input.auth.userId,
            errorCategory: "COMPENSATION_UPDATE_FAILED",
            timestamp: new Date().toISOString()
          });
        }
      }
      emitTeamMemberPasswordAudit(
        this.deps.recordPasswordAudit,
        buildTeamMemberPasswordAuditEvent({
          action: "TEAM_MEMBER_PASSWORD_UPDATED",
          actorUserId: input.auth.userId,
          targetMemberId: input.salesAgentId,
          tenantId: input.auth.tenantId,
          success: false,
          errorCategory: "AUTH_UPDATE_FAILED"
        })
      );
      throw new Error("Unable to update password");
    }
  }
}
