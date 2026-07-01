import type { Logger } from "pino";
import { resolveFacebookWorkerOutboundConfig } from "../channelConnect/resolveWorkerOutboundWithChannelConnect.js";
import type {
  ChannelAdapter,
  ChannelConnectionRepository,
  ChannelSettingRepository,
  MetaPageCredentialRepository
} from "../../domain/ports.js";
import { FacebookAdapter } from "../../infrastructure/adapters/channels/facebookAdapter.js";
import { type FacebookEnvInput, type FacebookRuntimeConfigMode } from "../../lib/facebookOutboundRuntimeConfig.js";

export type FacebookOutboundAdapterResolver = {
  resolve(
    tenantId: string,
    context?: { providerPageId?: string | null; channelConnectionId?: string | null }
  ): Promise<ChannelAdapter>;
};

export function createFacebookOutboundAdapterResolver(input: {
  mode: FacebookRuntimeConfigMode;
  env: FacebookEnvInput;
  channelSettingRepository: ChannelSettingRepository;
  channelConnectionRepository?: ChannelConnectionRepository;
  metaPageCredentialRepository?: MetaPageCredentialRepository;
  resolverEnabled?: boolean;
  metaPageCredentialEnabled?: boolean;
  logger?: Logger;
}): FacebookOutboundAdapterResolver {
  return {
    async resolve(
      tenantId: string,
      context?: { providerPageId?: string | null; channelConnectionId?: string | null }
    ): Promise<ChannelAdapter> {
      const resolved = await resolveFacebookWorkerOutboundConfig({
        mode: input.mode,
        tenantId,
        env: input.env,
        channelSettingRepository: input.channelSettingRepository,
        channelConnectionRepository: input.channelConnectionRepository,
        metaPageCredentialRepository: input.metaPageCredentialRepository,
        channelConnectionId: context?.channelConnectionId ?? null,
        providerPageId: context?.providerPageId ?? null,
        resolverEnabled: input.resolverEnabled,
        metaPageCredentialEnabled: input.metaPageCredentialEnabled,
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
