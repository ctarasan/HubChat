import type { AuthContext } from "../../interfaces/api/auth.js";

/** Minimal row shape for tenant-scoped permission checks (Phase II-B1). */
export interface ConversationTenantScoped {
  tenantId: string;
}

export function canViewConversation(ctx: AuthContext, conversation: ConversationTenantScoped): boolean {
  return conversation.tenantId === ctx.tenantId;
}

export function canAssignConversation(ctx: AuthContext, conversation: ConversationTenantScoped): boolean {
  if (conversation.tenantId !== ctx.tenantId) return false;
  return ctx.role === "MANAGER" || ctx.role === "ADMIN";
}

/** Minimal row shape for outbound reply permission (Phase II-B2). */
export interface ConversationReplyScoped {
  tenantId: string;
  assignedAgentId: string | null;
}

export function canReplyToConversation(ctx: AuthContext, conversation: ConversationReplyScoped): boolean {
  if (conversation.tenantId !== ctx.tenantId) return false;
  if (ctx.role === "MANAGER" || ctx.role === "ADMIN") return true;
  if (ctx.role !== "SALES") return false;
  if (!ctx.salesAgentId) return false;
  if (!conversation.assignedAgentId) return false;
  return conversation.assignedAgentId === ctx.salesAgentId;
}
