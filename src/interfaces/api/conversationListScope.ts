import type { AuthContext } from "./auth.js";

/** Frozen scope values; `assigned_to_me` is accepted as alias for `mine` at parse time. */
export type ConversationListScopeParam = "all" | "unassigned" | "mine" | "team" | undefined;

/** Assignment-related filter applied in addition to tenant and existing list filters. */
export type ConversationListAssignmentFilter =
  | { kind: "none" }
  | { kind: "unassigned" }
  | { kind: "team" }
  | { kind: "assigned_to_agent"; agentId: string };

export type ResolveConversationListScopeResult =
  | { ok: true; filter: ConversationListAssignmentFilter }
  | { ok: false; message: string };

/**
 * Resolves `scope` query param into a repository-level assignment filter with role-based rules.
 * SALES defaults to mine when scope is omitted.
 */
export function resolveConversationListScope(
  auth: AuthContext,
  scope: ConversationListScopeParam
): ResolveConversationListScopeResult {
  if (auth.role === "SALES") {
    if (!auth.salesAgentId) {
      return { ok: false, message: "Sales agent profile required for conversation list." };
    }
    if (scope === "all" || scope === "unassigned" || scope === "team") {
      return { ok: false, message: "Forbidden conversation list scope for sales role." };
    }
    return { ok: true, filter: { kind: "assigned_to_agent", agentId: auth.salesAgentId } };
  }

  if (auth.role === "MANAGER" || auth.role === "ADMIN") {
    if (!scope || scope === "all") {
      return { ok: true, filter: { kind: "none" } };
    }
    if (scope === "unassigned") {
      return { ok: true, filter: { kind: "unassigned" } };
    }
    if (scope === "team") {
      return { ok: true, filter: { kind: "team" } };
    }
    if (scope === "mine") {
      if (!auth.salesAgentId) {
        return {
          ok: false,
          message: "No active sales agent profile for this user; cannot use mine scope."
        };
      }
      return { ok: true, filter: { kind: "assigned_to_agent", agentId: auth.salesAgentId } };
    }
  }

  return { ok: false, message: "Forbidden conversation list scope." };
}
