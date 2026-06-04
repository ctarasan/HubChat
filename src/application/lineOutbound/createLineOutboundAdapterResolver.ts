import type { Logger } from "pino";
import { resolveLineWorkerOutboundConfig } from "../channelConnect/resolveWorkerOutboundWithChannelConnect.js";
import type { ChannelAdapter, ChannelConnectionRepository, ChannelSettingRepository } from "../../domain/ports.js";
import { LineAdapter } from "../../infrastructure/adapters/channels/lineAdapter.js";
import { type LineEnvInput, type LineRuntimeConfigMode } from "../../lib/lineOutboundRuntimeConfig.js";

export type LineOutboundAdapterResolver = {
  resolve(tenantId: string): Promise<ChannelAdapter>;
};

export function createLineOutboundAdapterResolver(input: {
  mode: LineRuntimeConfigMode;
  env: LineEnvInput;
  channelSettingRepository: ChannelSettingRepository;
  channelConnectionRepository?: ChannelConnectionRepository;
  resolverEnabled?: boolean;
  logger?: Logger;
}): LineOutboundAdapterResolver {
  return {
    async resolve(tenantId: string): Promise<ChannelAdapter> {
      const resolved = await resolveLineWorkerOutboundConfig({
        mode: input.mode,
        tenantId,
        env: input.env,
        channelSettingRepository: input.channelSettingRepository,
        channelConnectionRepository: input.channelConnectionRepository,
        resolverEnabled: input.resolverEnabled,
        logger: input.logger
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
