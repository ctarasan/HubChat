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
