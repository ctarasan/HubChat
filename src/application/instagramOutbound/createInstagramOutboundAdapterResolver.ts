import type { Logger } from "pino";
import type { ChannelRuntimeConfig, ChannelSettingPublicDto } from "../../domain/channelSettings.js";
import type { ChannelAdapter } from "../../domain/ports.js";
import { InstagramAdapter } from "../../infrastructure/adapters/channels/instagramAdapter.js";
import {
  type InstagramEnvInput,
  type InstagramRuntimeConfigMode,
  resolveInstagramOutboundConfig
} from "../../lib/instagramOutboundRuntimeConfig.js";

export type InstagramOutboundAdapterResolver = {
  resolve(tenantId: string): Promise<ChannelAdapter>;
};

export function createInstagramOutboundAdapterResolver(input: {
  mode: InstagramRuntimeConfigMode;
  env: InstagramEnvInput;
  getRuntimeConfig: (args: { tenantId: string; channel: "INSTAGRAM" }) => Promise<ChannelRuntimeConfig | null>;
  findChannelSetting?: (tenantId: string) => Promise<ChannelSettingPublicDto | null>;
  logger?: Logger;
}): InstagramOutboundAdapterResolver {
  return {
    async resolve(tenantId: string): Promise<ChannelAdapter> {
      const resolved = await resolveInstagramOutboundConfig({
        mode: input.mode,
        tenantId,
        env: input.env,
        getRuntimeConfig: (id) => input.getRuntimeConfig({ tenantId: id, channel: "INSTAGRAM" }),
        findChannelSetting: input.findChannelSetting
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
