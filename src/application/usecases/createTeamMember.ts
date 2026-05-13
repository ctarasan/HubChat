import type { AuthContext } from "../../interfaces/api/auth.js";
import type { SalesAgentRepository, SalesAssignmentMode, TeamMemberRole, TeamMemberRow } from "../../domain/ports.js";
import { canCreateTeamMemberRole } from "../authorization/teamMemberPermissions.js";

export class CreateTeamMemberUseCase {
  constructor(private readonly deps: { salesAgentRepository: SalesAgentRepository }) {}

  async execute(input: {
    auth: AuthContext;
    body: {
      name: string;
      email: string;
      role: TeamMemberRole;
      status?: "ACTIVE" | "INACTIVE";
      assignmentEnabled?: boolean;
      assignmentMode?: SalesAssignmentMode;
      maxActiveConversations?: number | null;
      maxActiveLeads?: number | null;
    };
  }): Promise<TeamMemberRow> {
    if (!canCreateTeamMemberRole(input.auth.role, input.body.role)) {
      throw new Error("Forbidden create team member role");
    }
    const email = input.body.email.trim();
    const dup = await this.deps.salesAgentRepository.findByEmailInTenant(input.auth.tenantId, email);
    if (dup) {
      throw new Error("Duplicate team member email");
    }
    return this.deps.salesAgentRepository.create({
      tenantId: input.auth.tenantId,
      name: input.body.name,
      email,
      role: input.body.role,
      status: input.body.status,
      assignmentEnabled: input.body.assignmentEnabled,
      assignmentMode: input.body.assignmentMode,
      maxActiveConversations: input.body.maxActiveConversations,
      maxActiveLeads: input.body.maxActiveLeads
    });
  }
}
