import type { Logger } from "pino";
import pino from "pino";
import { createFacebookOutboundAdapterResolver } from "../application/facebookOutbound/createFacebookOutboundAdapterResolver.js";
import type { ChannelConnectionRepository, ChannelSettingRepository } from "../domain/ports.js";
import type { FacebookEnvInput, FacebookRuntimeConfigMode } from "../lib/facebookOutboundRuntimeConfig.js";
import { isChannelConnectResolverEnabled } from "../lib/channelConnectRuntimeMode.js";

export function createWorkerOutboundResolverLogger(): Logger {
  return pino({ name: "worker-outbound-resolver", level: "info" });
}

/** Mirrors `src/worker/main.ts` Facebook outbound adapter resolver wiring after observability hotfix. */
export function createWorkerFacebookOutboundAdapterResolver(input: {
  mode: FacebookRuntimeConfigMode;
  env: FacebookEnvInput;
  channelSettingRepository: ChannelSettingRepository;
  channelConnectionRepository?: ChannelConnectionRepository;
  resolverEnabled?: boolean;
  logger?: Logger;
}) {
  const resolverEnabled = input.resolverEnabled ?? isChannelConnectResolverEnabled(input.env);
  return createFacebookOutboundAdapterResolver({
    mode: input.mode,
    env: input.env,
    channelSettingRepository: input.channelSettingRepository,
    channelConnectionRepository: input.channelConnectionRepository,
    resolverEnabled,
    logger: input.logger ?? createWorkerOutboundResolverLogger()
  });
}
