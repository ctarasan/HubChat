export type DashboardRole = "SALES" | "MANAGER" | "ADMIN";

export type InboxScopeFilter = "all" | "unassigned" | "assigned_to_me";

export type ConversationListStatusFilter = "all" | "open" | "pending" | "resolved" | "archived" | "closed_legacy";

/** Appends &status= for conversation lifecycle filter (Team Inbox list). */
export function conversationListStatusQueryParamFor(filter: ConversationListStatusFilter): string {
  if (filter === "all") return "";
  if (filter === "open") return "&status=OPEN";
  if (filter === "pending") return "&status=PENDING";
  if (filter === "resolved") return "&status=RESOLVED";
  if (filter === "archived") return "&status=ARCHIVED";
  return "&status=CLOSED";
}

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

export type ComposerOwnershipState = {
  canReplyByOwnership: boolean;
  reason: string | null;
};

function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/** Client-side hint for whether the current user may reply (SALES assignment); managers always pass when a thread is selected. */
export function getComposerOwnershipState(params: {
  role: DashboardRole | undefined;
  salesAgentId: string | null | undefined;
  selectedAssignedAgentId: string | null | undefined;
  hasSelectedConversation: boolean;
}): ComposerOwnershipState {
  if (!params.hasSelectedConversation) {
    return { canReplyByOwnership: false, reason: "Select a conversation to reply." };
  }
  const role = params.role;
  if (role === "MANAGER" || role === "ADMIN") {
    return { canReplyByOwnership: true, reason: null };
  }
  if (role !== "SALES") {
    return { canReplyByOwnership: false, reason: "You are not allowed to reply to this conversation." };
  }
  const salesAgentId = normalizeId(params.salesAgentId ?? null);
  const assignedId = normalizeId(params.selectedAssignedAgentId ?? null);
  if (!salesAgentId) {
    return { canReplyByOwnership: false, reason: "Your sales agent profile is not active for this tenant." };
  }
  if (!assignedId) {
    return { canReplyByOwnership: false, reason: "This conversation is not assigned to you yet." };
  }
  if (assignedId !== salesAgentId) {
    return { canReplyByOwnership: false, reason: "This conversation is assigned to another sales agent." };
  }
  return { canReplyByOwnership: true, reason: null };
}
