import type { Logger } from "pino";
import type { ChannelRuntimeConfig, ChannelSettingPublicDto } from "../../domain/channelSettings.js";
import type { ChannelAdapter } from "../../domain/ports.js";
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
  getRuntimeConfig: (args: { tenantId: string; channel: "FACEBOOK" }) => Promise<ChannelRuntimeConfig | null>;
  findChannelSetting?: (tenantId: string) => Promise<ChannelSettingPublicDto | null>;
  logger?: Logger;
}): FacebookOutboundAdapterResolver {
  return {
    async resolve(tenantId: string): Promise<ChannelAdapter> {
      const resolved = await resolveFacebookOutboundConfig({
        mode: input.mode,
        tenantId,
        env: input.env,
        getRuntimeConfig: (id) => input.getRuntimeConfig({ tenantId: id, channel: "FACEBOOK" }),
        findChannelSetting: input.findChannelSetting
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
