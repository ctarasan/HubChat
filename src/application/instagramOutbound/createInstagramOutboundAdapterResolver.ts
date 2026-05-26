import type { Logger } from "pino";
import type { ChannelAdapter, ChannelSettingRepository } from "../../domain/ports.js";
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
  channelSettingRepository: ChannelSettingRepository;
  logger?: Logger;
}): InstagramOutboundAdapterResolver {
  const { channelSettingRepository } = input;
  return {
    async resolve(tenantId: string): Promise<ChannelAdapter> {
      const resolved = await resolveInstagramOutboundConfig({
        mode: input.mode,
        tenantId,
        env: input.env,
        getRuntimeConfig: (id) =>
          channelSettingRepository.getRuntimeConfig({ tenantId: id, channel: "INSTAGRAM" }),
        findChannelSetting: (id) => channelSettingRepository.findByTenantAndChannel(id, "INSTAGRAM")
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
