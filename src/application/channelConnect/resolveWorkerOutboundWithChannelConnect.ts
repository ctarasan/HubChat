import type { Logger } from "pino";
import type { ChannelConnectRuntimeMode } from "../../domain/channelConnectRuntime.js";
import type { ChannelConnectionRepository, ChannelSettingRepository } from "../../domain/ports.js";
import { toChannelConnectResolverLogPayload } from "../../lib/channelConnectRuntimeDiagnostics.js";
import { isChannelConnectResolverEnabled, shouldAttemptChannelConnectDb } from "../../lib/channelConnectRuntimeMode.js";
import {
  type FacebookEnvInput,
  type FacebookRuntimeConfigMode,
  normalizeFacebookGraphVersion,
  resolveFacebookOutboundConfig,
  type ResolvedFacebookOutboundConfig
} from "../../lib/facebookOutboundRuntimeConfig.js";
import {
  type InstagramEnvInput,
  type InstagramRuntimeConfigMode,
  normalizeInstagramGraphVersion,
  resolveInstagramOutboundConfig,
  type ResolvedInstagramOutboundConfig
} from "../../lib/instagramOutboundRuntimeConfig.js";
import {
  type LineEnvInput,
  type LineRuntimeConfigMode,
  resolveLineOutboundConfig,
  type ResolvedLineOutboundConfig
} from "../../lib/lineOutboundRuntimeConfig.js";
import {
  ChannelConnectRuntimeResolverError,
  resolveOutboundChannelCredential,
  type ChannelConnectRuntimeEnv
} from "./channelConnectRuntimeResolver.js";

type WorkerOutboundEnv = ChannelConnectRuntimeEnv;

function logChannelConnectDisabled(logger: Logger | undefined, tenantId: string, channel: string): void {
  logger?.info(
    { tenantId, channel, channelConnectResolver: "disabled", resolutionPath: "legacy" },
    "Channel Connect outbound resolver disabled; using legacy runtime config"
  );
}

function logLegacyFallback(
  logger: Logger | undefined,
  tenantId: string,
  channel: string,
  reason: string,
  diagnostics?: ReturnType<typeof toChannelConnectResolverLogPayload>
): void {
  logger?.info(
    {
      tenantId,
      channel,
      channelConnectResolver: "enabled",
      resolutionPath: "legacy_fallback",
      fallbackReason: reason,
      ...(diagnostics ?? {})
    },
    "Channel Connect outbound resolver missed; using legacy runtime config"
  );
}

function logChannelConnectDbUsed(
  logger: Logger | undefined,
  tenantId: string,
  channel: string,
  diagnostics: ReturnType<typeof toChannelConnectResolverLogPayload>
): void {
  logger?.info(
    {
      tenantId,
      channel,
      channelConnectResolver: "enabled",
      resolutionPath: "channel_connect_db",
      runtimeSource: "db",
      ...diagnostics
    },
    "Channel Connect outbound credentials resolved from channel_connections"
  );
}

async function tryResolveLineFromChannelConnect(input: {
  tenantId: string;
  mode: LineRuntimeConfigMode;
  env: WorkerOutboundEnv;
  channelConnectionRepository: ChannelConnectionRepository;
  logger?: Logger;
}): Promise<ResolvedLineOutboundConfig | null> {
  const resolved = await resolveOutboundChannelCredential(
    {
      channelConnectionRepository: input.channelConnectionRepository,
      env: input.env,
      log: (payload) => input.logger?.info(payload, "channel connect outbound resolver")
    },
    {
      provider: "LINE",
      tenantId: input.tenantId,
      mode: input.mode as ChannelConnectRuntimeMode,
      resolverEnabled: true
    }
  );

  if (resolved.configSource !== "DB") {
    return null;
  }

  const channelAccessToken = resolved.credentials.accessToken?.trim() ?? "";
  const channelSecret = resolved.credentials.channelSecret?.trim() ?? "";
  if (!channelAccessToken || !channelSecret) {
    return null;
  }

  logChannelConnectDbUsed(
    input.logger,
    input.tenantId,
    "LINE",
    toChannelConnectResolverLogPayload(resolved.diagnostics)
  );
  return {
    source: "db",
    credentials: { channelAccessToken, channelSecret }
  };
}

async function tryResolveFacebookFromChannelConnect(input: {
  tenantId: string;
  mode: FacebookRuntimeConfigMode;
  env: WorkerOutboundEnv;
  channelConnectionRepository: ChannelConnectionRepository;
  channelConnectionId?: string | null;
  providerPageId?: string | null;
  logger?: Logger;
}): Promise<ResolvedFacebookOutboundConfig | null> {
  const resolved = await resolveOutboundChannelCredential(
    {
      channelConnectionRepository: input.channelConnectionRepository,
      env: input.env,
      log: (payload) => input.logger?.info(payload, "channel connect outbound resolver")
    },
    {
      provider: "FACEBOOK",
      tenantId: input.tenantId,
      mode: input.mode as ChannelConnectRuntimeMode,
      resolverEnabled: true,
      channelConnectionId: input.channelConnectionId,
      providerPageId: input.providerPageId
    }
  );

  if (resolved.configSource !== "DB") {
    return null;
  }

  const pageAccessToken = resolved.credentials.accessToken?.trim() ?? "";
  if (!pageAccessToken) {
    return null;
  }

  logChannelConnectDbUsed(
    input.logger,
    input.tenantId,
    "FACEBOOK",
    toChannelConnectResolverLogPayload(resolved.diagnostics)
  );
  return {
    source: "db",
    credentials: {
      pageAccessToken,
      graphVersion: resolved.graphVersion ?? normalizeFacebookGraphVersion(input.env),
      providerPageId: resolved.providerPageId ?? input.env.FACEBOOK_PAGE_ID?.trim() ?? null
    }
  };
}

async function tryResolveInstagramFromChannelConnect(input: {
  tenantId: string;
  mode: InstagramRuntimeConfigMode;
  env: WorkerOutboundEnv;
  channelConnectionRepository: ChannelConnectionRepository;
  logger?: Logger;
}): Promise<ResolvedInstagramOutboundConfig | null> {
  const resolved = await resolveOutboundChannelCredential(
    {
      channelConnectionRepository: input.channelConnectionRepository,
      env: input.env,
      log: (payload) => input.logger?.info(payload, "channel connect outbound resolver")
    },
    {
      provider: "INSTAGRAM",
      tenantId: input.tenantId,
      mode: input.mode as ChannelConnectRuntimeMode,
      resolverEnabled: true
    }
  );

  if (resolved.configSource !== "DB") {
    return null;
  }

  const accessToken = resolved.credentials.accessToken?.trim() ?? "";
  const pageId = resolved.providerPageId?.trim() ?? "";
  if (!accessToken || !pageId) {
    return null;
  }

  const businessAccountId = resolved.providerIgAccountId?.trim() || input.env.INSTAGRAM_ACCOUNT_ID?.trim();

  logChannelConnectDbUsed(
    input.logger,
    input.tenantId,
    "INSTAGRAM",
    toChannelConnectResolverLogPayload(resolved.diagnostics)
  );
  return {
    source: "db",
    credentials: {
      accessToken,
      graphVersion: resolved.graphVersion ?? normalizeInstagramGraphVersion(input.env),
      pageId,
      ...(businessAccountId ? { businessAccountId } : {})
    }
  };
}

export async function resolveLineWorkerOutboundConfig(input: {
  mode: LineRuntimeConfigMode;
  tenantId: string;
  env: LineEnvInput;
  channelSettingRepository: ChannelSettingRepository;
  channelConnectionRepository?: ChannelConnectionRepository;
  resolverEnabled?: boolean;
  logger?: Logger;
}): Promise<ResolvedLineOutboundConfig> {
  const resolverEnabled = input.resolverEnabled ?? isChannelConnectResolverEnabled(input.env);
  const { channelSettingRepository } = input;

  if (!resolverEnabled) {
    logChannelConnectDisabled(input.logger, input.tenantId, "LINE");
  } else if (
    shouldAttemptChannelConnectDb(input.mode as ChannelConnectRuntimeMode, true) &&
    input.channelConnectionRepository
  ) {
    try {
      const fromChannelConnect = await tryResolveLineFromChannelConnect({
        tenantId: input.tenantId,
        mode: input.mode,
        env: input.env,
        channelConnectionRepository: input.channelConnectionRepository,
        logger: input.logger
      });
      if (fromChannelConnect) {
        return fromChannelConnect;
      }
      if (input.mode === "DB_ONLY") {
        throw new ChannelConnectRuntimeResolverError(
          "LINE outbound is not configured in channel connections.",
          "db_only_missing_config"
        );
      }
      logLegacyFallback(input.logger, input.tenantId, "LINE", "channel_connect_db_unavailable");
    } catch (err) {
      if (input.mode === "DB_ONLY") {
        throw err;
      }
      const diagnosticCode =
        err instanceof ChannelConnectRuntimeResolverError ? err.diagnosticCode : "channel_connect_error";
      logLegacyFallback(input.logger, input.tenantId, "LINE", diagnosticCode);
    }
  }

  return resolveLineOutboundConfig({
    mode: input.mode,
    tenantId: input.tenantId,
    env: input.env,
    getRuntimeConfig: (id) => channelSettingRepository.getRuntimeConfig({ tenantId: id, channel: "LINE" }),
    findChannelSetting: (id) => channelSettingRepository.findByTenantAndChannel(id, "LINE")
  });
}

export async function resolveFacebookWorkerOutboundConfig(input: {
  mode: FacebookRuntimeConfigMode;
  tenantId: string;
  env: FacebookEnvInput;
  channelSettingRepository: ChannelSettingRepository;
  channelConnectionRepository?: ChannelConnectionRepository;
  channelConnectionId?: string | null;
  providerPageId?: string | null;
  resolverEnabled?: boolean;
  logger?: Logger;
}): Promise<ResolvedFacebookOutboundConfig> {
  const resolverEnabled = input.resolverEnabled ?? isChannelConnectResolverEnabled(input.env);
  const { channelSettingRepository } = input;

  if (!resolverEnabled) {
    logChannelConnectDisabled(input.logger, input.tenantId, "FACEBOOK");
  } else if (
    shouldAttemptChannelConnectDb(input.mode as ChannelConnectRuntimeMode, true) &&
    input.channelConnectionRepository
  ) {
    try {
      const fromChannelConnect = await tryResolveFacebookFromChannelConnect({
        tenantId: input.tenantId,
        mode: input.mode,
        env: input.env,
        channelConnectionRepository: input.channelConnectionRepository,
        channelConnectionId: input.channelConnectionId,
        providerPageId: input.providerPageId,
        logger: input.logger
      });
      if (fromChannelConnect) {
        return fromChannelConnect;
      }
      if (input.mode === "DB_ONLY") {
        throw new ChannelConnectRuntimeResolverError(
          "Facebook outbound is not configured in channel connections.",
          "db_only_missing_config"
        );
      }
      logLegacyFallback(input.logger, input.tenantId, "FACEBOOK", "channel_connect_db_unavailable");
    } catch (err) {
      if (err instanceof ChannelConnectRuntimeResolverError && err.blockLegacyFallback) {
        throw err;
      }
      if (input.mode === "DB_ONLY") {
        throw err;
      }
      const diagnosticCode =
        err instanceof ChannelConnectRuntimeResolverError ? err.diagnosticCode : "channel_connect_error";
      logLegacyFallback(input.logger, input.tenantId, "FACEBOOK", diagnosticCode);
    }
  }

  return resolveFacebookOutboundConfig({
    mode: input.mode,
    tenantId: input.tenantId,
    env: input.env,
    getRuntimeConfig: (id) =>
      channelSettingRepository.getRuntimeConfig({ tenantId: id, channel: "FACEBOOK" }),
    findChannelSetting: (id) => channelSettingRepository.findByTenantAndChannel(id, "FACEBOOK")
  });
}

export async function resolveInstagramWorkerOutboundConfig(input: {
  mode: InstagramRuntimeConfigMode;
  tenantId: string;
  env: InstagramEnvInput;
  channelSettingRepository: ChannelSettingRepository;
  channelConnectionRepository?: ChannelConnectionRepository;
  resolverEnabled?: boolean;
  logger?: Logger;
}): Promise<ResolvedInstagramOutboundConfig> {
  const resolverEnabled = input.resolverEnabled ?? isChannelConnectResolverEnabled(input.env);
  const { channelSettingRepository } = input;

  if (!resolverEnabled) {
    logChannelConnectDisabled(input.logger, input.tenantId, "INSTAGRAM");
  } else if (
    shouldAttemptChannelConnectDb(input.mode as ChannelConnectRuntimeMode, true) &&
    input.channelConnectionRepository
  ) {
    try {
      const fromChannelConnect = await tryResolveInstagramFromChannelConnect({
        tenantId: input.tenantId,
        mode: input.mode,
        env: input.env,
        channelConnectionRepository: input.channelConnectionRepository,
        logger: input.logger
      });
      if (fromChannelConnect) {
        return fromChannelConnect;
      }
      if (input.mode === "DB_ONLY") {
        throw new ChannelConnectRuntimeResolverError(
          "Instagram outbound is not configured in channel connections.",
          "db_only_missing_config"
        );
      }
      logLegacyFallback(input.logger, input.tenantId, "INSTAGRAM", "channel_connect_db_unavailable");
    } catch (err) {
      if (input.mode === "DB_ONLY") {
        throw err;
      }
      const diagnosticCode =
        err instanceof ChannelConnectRuntimeResolverError ? err.diagnosticCode : "channel_connect_error";
      logLegacyFallback(input.logger, input.tenantId, "INSTAGRAM", diagnosticCode);
    }
  }

  return resolveInstagramOutboundConfig({
    mode: input.mode,
    tenantId: input.tenantId,
    env: input.env,
    getRuntimeConfig: (id) =>
      channelSettingRepository.getRuntimeConfig({ tenantId: id, channel: "INSTAGRAM" }),
    findChannelSetting: (id) => channelSettingRepository.findByTenantAndChannel(id, "INSTAGRAM")
  });
}
