import type { AppRole } from "../../interfaces/api/auth.js";

export type TeamMemberRole = "SALES" | "MANAGER" | "ADMIN";

export function canManageTeamMembers(actorRole: AppRole): boolean {
  return actorRole === "MANAGER" || actorRole === "ADMIN";
}

/** MANAGER may create SALES only; ADMIN may create any role. */
export function canCreateTeamMemberRole(actorRole: AppRole, targetRole: TeamMemberRole): boolean {
  if (actorRole === "ADMIN") return true;
  if (actorRole === "MANAGER") return targetRole === "SALES";
  return false;
}

/** MANAGER may only update existing SALES rows; ADMIN may update any. */
export function canManagerUpdateExistingTarget(targetExistingRole: TeamMemberRole): boolean {
  return targetExistingRole === "SALES";
}

/** MANAGER cannot promote SALES to MANAGER/ADMIN; ADMIN unrestricted. */
export function canUpdateTeamMemberRole(
  actorRole: AppRole,
  targetExistingRole: TeamMemberRole,
  newRole: TeamMemberRole | undefined
): boolean {
  if (actorRole === "ADMIN") return true;
  if (actorRole !== "MANAGER") return false;
  if (targetExistingRole !== "SALES") return false;
  if (newRole === undefined) return true;
  return newRole === "SALES";
}

/**
 * Forbid self-deactivation (status → INACTIVE for own sales_agent row).
 * Forbid removing the last ACTIVE ADMIN from the tenant (deactivate or demote).
 */
export function assertCanDeactivateOrDemoteAdmin(params: {
  actorSalesAgentId: string | null;
  targetId: string;
  targetRole: TeamMemberRole;
  targetStatus: "ACTIVE" | "INACTIVE";
  patchStatus: "ACTIVE" | "INACTIVE" | undefined;
  patchRole: TeamMemberRole | undefined;
  activeAdminCount: number;
}): void {
  if (params.patchStatus === "INACTIVE" && params.actorSalesAgentId && params.actorSalesAgentId === params.targetId) {
    throw new Error("Cannot deactivate yourself");
  }
  const finalRole = (params.patchRole ?? params.targetRole) as TeamMemberRole;
  const finalStatus = (params.patchStatus ?? params.targetStatus) as "ACTIVE" | "INACTIVE";
  const wasActiveAdmin = params.targetRole === "ADMIN" && params.targetStatus === "ACTIVE";
  const stillActiveAdmin = finalRole === "ADMIN" && finalStatus === "ACTIVE";
  if (wasActiveAdmin && !stillActiveAdmin && params.activeAdminCount <= 1) {
    throw new Error("Cannot deactivate or demote the last active ADMIN");
  }
}
