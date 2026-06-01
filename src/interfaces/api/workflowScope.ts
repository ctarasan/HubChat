import type { AuthContext } from "./auth.js";
import type { WorkflowScope } from "../../domain/workflow.js";

export type WorkflowScopeParam = WorkflowScope | undefined;

export type ResolveWorkflowScopeResult =
  | { ok: true; scope: WorkflowScope; assignedAgentId: string | null }
  | { ok: false; message: string; forbidden?: boolean };

/**
 * Resolves workflow list/summary scope with role rules.
 * SALES is always forced to `mine`. MANAGER/ADMIN default to `team`.
 */
export function resolveWorkflowScope(
  auth: AuthContext,
  scopeParam: WorkflowScopeParam,
  assignedAgentIdParam?: string
): ResolveWorkflowScopeResult {
  if (auth.role === "SALES") {
    if (!auth.salesAgentId) {
      return {
        ok: false,
        message: "Sales agent profile required for workflow access."
      };
    }
    if (scopeParam === "team") {
      return { ok: false, message: "Forbidden workflow scope for sales role.", forbidden: true };
    }
    if (assignedAgentIdParam && assignedAgentIdParam !== auth.salesAgentId) {
      return { ok: false, message: "Forbidden assignedAgentId for sales role.", forbidden: true };
    }
    return { ok: true, scope: "mine", assignedAgentId: auth.salesAgentId };
  }

  if (auth.role === "MANAGER" || auth.role === "ADMIN") {
    if (assignedAgentIdParam) {
      return { ok: true, scope: scopeParam ?? "team", assignedAgentId: assignedAgentIdParam };
    }
    if (scopeParam === "mine") {
      if (!auth.salesAgentId) {
        return {
          ok: false,
          message: "No active sales agent profile for this user; cannot use mine scope."
        };
      }
      return { ok: true, scope: "mine", assignedAgentId: auth.salesAgentId };
    }
    return { ok: true, scope: scopeParam ?? "team", assignedAgentId: null };
  }

  return { ok: false, message: "Forbidden workflow scope.", forbidden: true };
}
