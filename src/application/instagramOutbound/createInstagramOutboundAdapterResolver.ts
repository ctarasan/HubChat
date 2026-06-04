import type { Logger } from "pino";
import { resolveInstagramWorkerOutboundConfig } from "../channelConnect/resolveWorkerOutboundWithChannelConnect.js";
import type { ChannelAdapter, ChannelConnectionRepository, ChannelSettingRepository } from "../../domain/ports.js";
import { InstagramAdapter } from "../../infrastructure/adapters/channels/instagramAdapter.js";
import { type InstagramEnvInput, type InstagramRuntimeConfigMode } from "../../lib/instagramOutboundRuntimeConfig.js";

export type InstagramOutboundAdapterResolver = {
  resolve(tenantId: string): Promise<ChannelAdapter>;
};

export function createInstagramOutboundAdapterResolver(input: {
  mode: InstagramRuntimeConfigMode;
  env: InstagramEnvInput;
  channelSettingRepository: ChannelSettingRepository;
  channelConnectionRepository?: ChannelConnectionRepository;
  resolverEnabled?: boolean;
  logger?: Logger;
}): InstagramOutboundAdapterResolver {
  return {
    async resolve(tenantId: string): Promise<ChannelAdapter> {
      const resolved = await resolveInstagramWorkerOutboundConfig({
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
          channel: "INSTAGRAM",
          runtimeSource: resolved.source,
          fallbackReason: resolved.fallbackReason ?? null,
          providerPageId: resolved.credentials.pageId
        },
        "Instagram outbound runtime config resolved"
      );

      return new InstagramAdapter({
        accessToken: resolved.credentials.accessToken,
        graphVersion: resolved.credentials.graphVersion,
        ...(resolved.credentials.businessAccountId
          ? { businessAccountId: resolved.credentials.businessAccountId }
          : {}),
        pageId: resolved.credentials.pageId
      });
    }
  };
}
