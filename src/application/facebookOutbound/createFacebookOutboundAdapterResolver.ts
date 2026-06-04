import type { Logger } from "pino";
import { resolveFacebookWorkerOutboundConfig } from "../channelConnect/resolveWorkerOutboundWithChannelConnect.js";
import type { ChannelAdapter, ChannelConnectionRepository, ChannelSettingRepository } from "../../domain/ports.js";
import { FacebookAdapter } from "../../infrastructure/adapters/channels/facebookAdapter.js";
import { type FacebookEnvInput, type FacebookRuntimeConfigMode } from "../../lib/facebookOutboundRuntimeConfig.js";

export type FacebookOutboundAdapterResolver = {
  resolve(tenantId: string): Promise<ChannelAdapter>;
};

export function createFacebookOutboundAdapterResolver(input: {
  mode: FacebookRuntimeConfigMode;
  env: FacebookEnvInput;
  channelSettingRepository: ChannelSettingRepository;
  channelConnectionRepository?: ChannelConnectionRepository;
  resolverEnabled?: boolean;
  logger?: Logger;
}): FacebookOutboundAdapterResolver {
  return {
    async resolve(tenantId: string): Promise<ChannelAdapter> {
      const resolved = await resolveFacebookWorkerOutboundConfig({
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
          channel: "FACEBOOK",
          runtimeSource: resolved.source,
          fallbackReason: resolved.fallbackReason ?? null,
          providerPageId: resolved.credentials.providerPageId ?? null
        },
        "Facebook outbound runtime config resolved"
      );

      return new FacebookAdapter({
        pageAccessToken: resolved.credentials.pageAccessToken,
        graphVersion: resolved.credentials.graphVersion
      });
    }
  };
}
