import { loadTenantConnectionScope } from "../../application/channelConnection/loadTenantConnectionScope.js";
import {
  filterRowsByActiveConnectionScope,
  type ConnectionScopeMode,
  type TenantConnectionScopeContext
} from "../../domain/channelConnectionScope.js";
import type { ChannelConnectionRepository, ChannelSettingRepository } from "../../domain/ports.js";
import type { AuthContext } from "./auth.js";
import { resolveConnectionScopeMode } from "./connectionScopeQuery.js";

export type ConnectionScopeRepositories = {
  channelConnectionRepository?: Pick<ChannelConnectionRepository, "listByTenant"> | null;
  channelSettingRepository?: Pick<ChannelSettingRepository, "listByTenant"> | null;
};

export async function applyConnectionScopeToListRows<T extends Record<string, unknown>>(input: {
  tenantId: string;
  auth: Pick<AuthContext, "role">;
  connectionScope?: ConnectionScopeMode;
  rows: T[];
  repositories: ConnectionScopeRepositories;
}): Promise<{ rows: T[]; scopeContext: TenantConnectionScopeContext; mode: ConnectionScopeMode }> {
  const resolved = resolveConnectionScopeMode(input.auth, input.connectionScope);
  if (!resolved.ok) {
    const err = new Error(resolved.message);
    (err as Error & { httpStatus?: number }).httpStatus = resolved.status;
    throw err;
  }

  const scopeContext = await loadTenantConnectionScope({
    tenantId: input.tenantId,
    channelConnectionRepository: input.repositories.channelConnectionRepository,
    channelSettingRepository: input.repositories.channelSettingRepository
  });

  if (resolved.mode === "all") {
    return { rows: input.rows, scopeContext, mode: resolved.mode };
  }

  return {
    rows: filterRowsByActiveConnectionScope(input.rows, scopeContext),
    scopeContext,
    mode: resolved.mode
  };
}
