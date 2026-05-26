import type { Logger } from "pino";
import type { ChannelAdapter, ChannelSettingRepository } from "../../domain/ports.js";
import { FacebookAdapter } from "../../infrastructure/adapters/channels/facebookAdapter.js";
import {
  type FacebookEnvInput,
  type FacebookRuntimeConfigMode,
  resolveFacebookOutboundConfig
} from "../../lib/facebookOutboundRuntimeConfig.js";

export type FacebookOutboundAdapterResolver = {
  resolve(tenantId: string): Promise<ChannelAdapter>;
};

export function createFacebookOutboundAdapterResolver(input: {
  mode: FacebookRuntimeConfigMode;
  env: FacebookEnvInput;
  channelSettingRepository: ChannelSettingRepository;
  logger?: Logger;
}): FacebookOutboundAdapterResolver {
  const { channelSettingRepository } = input;
  return {
    async resolve(tenantId: string): Promise<ChannelAdapter> {
      const resolved = await resolveFacebookOutboundConfig({
        mode: input.mode,
        tenantId,
        env: input.env,
        getRuntimeConfig: (id) =>
          channelSettingRepository.getRuntimeConfig({ tenantId: id, channel: "FACEBOOK" }),
        findChannelSetting: (id) => channelSettingRepository.findByTenantAndChannel(id, "FACEBOOK")
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
