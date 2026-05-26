import type { Logger } from "pino";
import type { ChannelAdapter, ChannelSettingRepository } from "../../domain/ports.js";
import { LineAdapter } from "../../infrastructure/adapters/channels/lineAdapter.js";
import {
  type LineEnvInput,
  type LineRuntimeConfigMode,
  resolveLineOutboundConfig
} from "../../lib/lineOutboundRuntimeConfig.js";

export type LineOutboundAdapterResolver = {
  resolve(tenantId: string): Promise<ChannelAdapter>;
};

export function createLineOutboundAdapterResolver(input: {
  mode: LineRuntimeConfigMode;
  env: LineEnvInput;
  channelSettingRepository: ChannelSettingRepository;
  logger?: Logger;
}): LineOutboundAdapterResolver {
  const { channelSettingRepository } = input;
  return {
    async resolve(tenantId: string): Promise<ChannelAdapter> {
      const resolved = await resolveLineOutboundConfig({
        mode: input.mode,
        tenantId,
        env: input.env,
        getRuntimeConfig: (id) => channelSettingRepository.getRuntimeConfig({ tenantId: id, channel: "LINE" }),
        findChannelSetting: (id) => channelSettingRepository.findByTenantAndChannel(id, "LINE")
      });

      input.logger?.info(
        {
          tenantId,
          channel: "LINE",
          runtimeSource: resolved.source,
          fallbackReason: resolved.fallbackReason ?? null
        },
        "LINE outbound runtime config resolved"
      );

      return new LineAdapter({
        channelAccessToken: resolved.credentials.channelAccessToken,
        channelSecret: resolved.credentials.channelSecret
      });
    }
  };
}
