import type { AuthContext } from "./auth.js";
import type { ConversationListAssignmentFilter } from "./conversationListScope.js";
import type { LeadsListOwnerParam } from "./leadsListQuery.js";

export type ResolveLeadsListOwnerResult =
  | { ok: true; filter: ConversationListAssignmentFilter }
  | { ok: false; status: 403 | 400; message: string };

/**
 * Resolves owner filter for GET /api/leads with the same assignment rules as Team Inbox.
 * SALES always see only conversations assigned to their sales agent profile.
 */
export function resolveLeadsListAssignmentFilter(
  auth: AuthContext,
  owner?: LeadsListOwnerParam
): ResolveLeadsListOwnerResult {
  if (auth.role === "SALES") {
    if (!auth.salesAgentId) {
      return {
        ok: false,
        status: 403,
        message: "Sales agent profile required for leads list."
      };
    }
    if (owner === "unassigned") {
      return { ok: false, status: 403, message: "Forbidden leads list owner filter for sales role." };
    }
    return { ok: true, filter: { kind: "assigned_to_agent", agentId: auth.salesAgentId } };
  }

  if (auth.role === "MANAGER" || auth.role === "ADMIN") {
    if (!owner) return { ok: true, filter: { kind: "none" } };
    if (owner === "unassigned") return { ok: true, filter: { kind: "unassigned" } };
    if (owner === "me") {
      if (!auth.salesAgentId) {
        return {
          ok: false,
          status: 403,
          message: "No active sales agent profile for this user; cannot use owner=me."
        };
      }
      return { ok: true, filter: { kind: "assigned_to_agent", agentId: auth.salesAgentId } };
    }
  }

  return { ok: false, status: 403, message: "Forbidden leads list access." };
}

export function toRepositoryAssignmentFilter(
  filter: ConversationListAssignmentFilter
): "none" | "unassigned" | "team" | { assignedToAgentId: string } {
  if (filter.kind === "none") return "none";
  if (filter.kind === "unassigned") return "unassigned";
  if (filter.kind === "team") return "team";
  return { assignedToAgentId: filter.agentId };
}
