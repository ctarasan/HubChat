import type { AuthContext } from "./auth.js";

export type ConversationListScopeParam = "all" | "unassigned" | "assigned_to_me" | undefined;

/** Assignment-related filter applied in addition to tenant and existing list filters. */
export type ConversationListAssignmentFilter =
  | { kind: "none" }
  | { kind: "unassigned" }
  | { kind: "assigned_to_agent"; agentId: string };

export type ResolveConversationListScopeResult =
  | { ok: true; filter: ConversationListAssignmentFilter }
  | { ok: false; message: string };

/**
 * Resolves `scope` query param into a repository-level assignment filter with role-based rules.
 * SALES defaults to assigned_to_me when scope is omitted.
 */
export function resolveConversationListScope(auth: AuthContext, scope: ConversationListScopeParam): ResolveConversationListScopeResult {
  if (auth.role === "SALES") {
    if (!auth.salesAgentId) {
      return { ok: false, message: "Sales agent profile required for conversation list." };
    }
    if (scope === "all" || scope === "unassigned") {
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
    if (scope === "assigned_to_me") {
      if (!auth.salesAgentId) {
        return {
          ok: false,
          message: "No active sales agent profile for this user; cannot use assigned_to_me scope."
        };
      }
      return { ok: true, filter: { kind: "assigned_to_agent", agentId: auth.salesAgentId } };
    }
  }

  return { ok: false, message: "Forbidden conversation list scope." };
}
