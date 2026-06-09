import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";
import {
  buildTenantConnectionScopeContext,
  type ChannelSettingsScopeFallback,
  type TenantConnectionScopeContext
} from "../../domain/channelConnectionScope.js";
import type { ChannelConnectionRepository, ChannelSettingRepository } from "../../domain/ports.js";
import type { SupportedChannelSettingChannel } from "../../domain/channelSettings.js";

export async function loadTenantConnectionScope(input: {
  tenantId: string;
  channelConnectionRepository?: Pick<ChannelConnectionRepository, "listByTenant"> | null;
  channelSettingRepository?: Pick<ChannelSettingRepository, "listByTenant"> | null;
}): Promise<TenantConnectionScopeContext> {
  const connections: ChannelConnectionRecord[] = input.channelConnectionRepository
    ? await input.channelConnectionRepository.listByTenant(input.tenantId)
    : [];

  const settingsFallback: ChannelSettingsScopeFallback[] = [];
  if (input.channelSettingRepository) {
    const settings = await input.channelSettingRepository.listByTenant(input.tenantId);
    for (const row of settings) {
      const provider = row.channel as SupportedChannelSettingChannel;
      const providerPageId =
        typeof row.providerPageId === "string" && row.providerPageId.trim()
          ? row.providerPageId.trim()
          : typeof row.configJson?.providerPageId === "string" && row.configJson.providerPageId.trim()
            ? row.configJson.providerPageId.trim()
            : typeof row.configJson?.channelId === "string" && row.configJson.channelId.trim()
              ? row.configJson.channelId.trim()
              : null;
      settingsFallback.push({
        provider,
        providerPageId,
        providerAccountName: row.providerAccountName ?? row.displayName ?? null,
        enabled: row.enabled,
        status: row.status
      });
    }
  }

  return buildTenantConnectionScopeContext({ connections, settingsFallback });
}
