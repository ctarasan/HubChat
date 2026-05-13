export type TeamMembersRoleFilter = "all" | "SALES" | "MANAGER" | "ADMIN";
export type TeamMembersStatusFilter = "all" | "ACTIVE" | "INACTIVE";
export type TeamMembersAssignmentModeFilter = "all" | "AUTO" | "MANUAL_ONLY" | "PAUSED";

export type TeamMembersListQuery = {
  search: string;
  role: TeamMembersRoleFilter;
  status: TeamMembersStatusFilter;
  assignmentMode: TeamMembersAssignmentModeFilter;
};

/** Builds GET /api/sales-agents path with includeInactive=true and optional filters (Phase II-D1-B). */
export function buildTeamMembersSalesAgentsUrl(query: TeamMembersListQuery): string {
  const params = new URLSearchParams();
  params.set("includeInactive", "true");
  const q = typeof query.search === "string" ? query.search.trim() : "";
  if (q.length > 0) params.set("q", q);
  if (query.role !== "all") params.set("role", query.role);
  if (query.status !== "all") params.set("status", query.status);
  if (query.assignmentMode !== "all") params.set("assignmentMode", query.assignmentMode);
  return `/api/sales-agents?${params.toString()}`;
}
