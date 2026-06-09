import { z } from "zod";
import type { AuthContext } from "./auth.js";
import type { ConnectionScopeMode } from "../../domain/channelConnectionScope.js";

export const CONNECTION_SCOPE_VALUES = ["active", "all"] as const;

export const ConnectionScopeQuerySchema = z.object({
  connectionScope: z.enum(CONNECTION_SCOPE_VALUES).optional()
});

export type ConnectionScopeQuery = z.infer<typeof ConnectionScopeQuerySchema>;

export function parseConnectionScopeQuery(
  qs: Record<string, string | undefined>
): { ok: true; value: ConnectionScopeQuery } | { ok: false; message: string } {
  const parsed = ConnectionScopeQuerySchema.safeParse({
    connectionScope: qs.connectionScope?.trim() || undefined
  });
  if (!parsed.success) return { ok: false, message: parsed.error.message };
  return { ok: true, value: parsed.data };
}

export type ResolveConnectionScopeResult =
  | { ok: true; mode: ConnectionScopeMode }
  | { ok: false; status: 403; message: string };

/**
 * Default active scope for all roles.
 * `connectionScope=all` allowed for MANAGER and ADMIN only.
 */
export function resolveConnectionScopeMode(
  auth: Pick<AuthContext, "role">,
  requested?: ConnectionScopeMode
): ResolveConnectionScopeResult {
  const mode = requested ?? "active";
  if (mode === "all" && auth.role === "SALES") {
    return { ok: false, status: 403, message: "Forbidden: connectionScope=all requires MANAGER or ADMIN" };
  }
  return { ok: true, mode };
}
