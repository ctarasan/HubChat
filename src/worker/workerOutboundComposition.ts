import type { Logger } from "pino";
import pino from "pino";
import { createFacebookOutboundAdapterResolver } from "../application/facebookOutbound/createFacebookOutboundAdapterResolver.js";
import type {
  ChannelConnectionRepository,
  ChannelSettingRepository,
  MetaPageCredentialRepository
} from "../domain/ports.js";
import type { FacebookEnvInput, FacebookRuntimeConfigMode } from "../lib/facebookOutboundRuntimeConfig.js";
import { isChannelConnectResolverEnabled } from "../lib/channelConnectRuntimeMode.js";
import { isMetaPageCredentialEnabled } from "../lib/metaPageCredentialRuntimeFlags.js";

export function createWorkerOutboundResolverLogger(): Logger {
  return pino({ name: "worker-outbound-resolver", level: "info" });
}

/** Mirrors `src/worker/main.ts` Facebook outbound adapter resolver wiring after observability hotfix. */
export function createWorkerFacebookOutboundAdapterResolver(input: {
  mode: FacebookRuntimeConfigMode;
  env: FacebookEnvInput;
  channelSettingRepository: ChannelSettingRepository;
  channelConnectionRepository?: ChannelConnectionRepository;
  metaPageCredentialRepository?: MetaPageCredentialRepository;
  resolverEnabled?: boolean;
  metaPageCredentialEnabled?: boolean;
  logger?: Logger;
}) {
  const resolverEnabled = input.resolverEnabled ?? isChannelConnectResolverEnabled(input.env);
  const metaPageCredentialEnabled =
    input.metaPageCredentialEnabled ?? isMetaPageCredentialEnabled(input.env);
  return createFacebookOutboundAdapterResolver({
    mode: input.mode,
    env: input.env,
    channelSettingRepository: input.channelSettingRepository,
    channelConnectionRepository: input.channelConnectionRepository,
    metaPageCredentialRepository: input.metaPageCredentialRepository,
    resolverEnabled,
    metaPageCredentialEnabled,
    logger: input.logger ?? createWorkerOutboundResolverLogger()
  });
}
