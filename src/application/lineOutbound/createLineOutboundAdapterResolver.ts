import type { Logger } from "pino";
import type { ChannelRuntimeConfig, ChannelSettingPublicDto } from "../../domain/channelSettings.js";
import type { ChannelAdapter } from "../../domain/ports.js";
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
  getRuntimeConfig: (args: { tenantId: string; channel: "LINE" }) => Promise<ChannelRuntimeConfig | null>;
  findChannelSetting?: (tenantId: string) => Promise<ChannelSettingPublicDto | null>;
  logger?: Logger;
}): LineOutboundAdapterResolver {
  return {
    async resolve(tenantId: string): Promise<ChannelAdapter> {
      const resolved = await resolveLineOutboundConfig({
        mode: input.mode,
        tenantId,
        env: input.env,
        getRuntimeConfig: (id) => input.getRuntimeConfig({ tenantId: id, channel: "LINE" }),
        findChannelSetting: input.findChannelSetting
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
