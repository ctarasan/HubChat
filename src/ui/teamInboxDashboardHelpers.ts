export type DashboardRole = "SALES" | "MANAGER" | "ADMIN";

export type InboxScopeFilter = "all" | "unassigned" | "assigned_to_me";

export function formatSalesAgentDisplayLabel(agent: { id: string; email: string; name: string }): string {
  const name = typeof agent.name === "string" ? agent.name.trim() : "";
  if (name.length > 0) return name;
  const email = typeof agent.email === "string" ? agent.email.trim() : "";
  if (email.length > 0) return email;
  return agent.id;
}

/** MANAGER / ADMIN see three filters; SALES uses backend default (no scope param). */
export function inboxScopeQueryParamFor(role: DashboardRole, filter: InboxScopeFilter): string {
  if (role === "SALES") return "";
  if (filter === "all") return "&scope=all";
  if (filter === "unassigned") return "&scope=unassigned";
  return "&scope=assigned_to_me";
}

export function canManageConversationAssignments(role: DashboardRole | undefined): boolean {
  return role === "MANAGER" || role === "ADMIN";
}
