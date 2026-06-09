import type { ChannelConnectionRecord } from "./channelConnections.js";
import {
  ACTIVE_CHANNEL_CONNECTION_STATUSES,
  buildTenantConnectionScopeContext,
  isActiveChannelConnectionStatus,
  type TenantConnectionScopeContext
} from "./channelConnectionScope.js";
import type {
  ChannelSettingPublicDto,
  ChannelSettingStatus,
  SupportedChannelSettingChannel
} from "./channelSettings.js";
import { SUPPORTED_CHANNEL_SETTING_CHANNELS } from "./channelSettings.js";
import { isChannelConfigured } from "../lib/channelSettingPublicDto.js";
import { isLikelyRawProviderId, maskProviderIdentity } from "../lib/maskProviderIdentity.js";

export type ChannelSetupLifecycleStatus =
  | "not_configured"
  | "configured"
  | "ready"
  | "needs_attention"
  | "disconnected";

export type ChannelSetupMissingStep =
  | "ENABLE_CHANNEL"
  | "SET_ACCESS_TOKEN"
  | "SET_CHANNEL_SECRET"
  | "SET_APP_SECRET"
  | "SET_VERIFY_TOKEN"
  | "SET_PROVIDER_PAGE_ID"
  | "CONFIGURE_WEBHOOK"
  | "RUN_TEST_CONNECTION"
  | "RESOLVE_CONNECTION_ERROR"
  | "RECONNECT_CHANNEL";

export type ChannelSetupCredentialsPresentDto = {
  accessToken: boolean;
  channelSecret?: boolean;
  appSecret?: boolean;
  verifyToken?: boolean;
  allRequiredPresent: boolean;
};

export type ChannelSetupActiveScopeSummaryDto = {
  hasActiveConnection: boolean;
  activeConnectionCount: number;
  scopeBucket: "active" | "none" | "historical_only";
  maskedProviderIdentity: string | null;
};

export type ChannelSetupStatusItemDto = {
  channel: SupportedChannelSettingChannel;
  setupStatus: ChannelSetupLifecycleStatus;
  connectionLabel: string | null;
  credentialsPresent: ChannelSetupCredentialsPresentDto;
  testConnectionAvailable: boolean;
  webhookCallbackUrl: string | null;
  missingSetupSteps: ChannelSetupMissingStep[];
  activeConnectionScope: ChannelSetupActiveScopeSummaryDto;
  channelSettingsStatus: ChannelSettingStatus | null;
  connectionPlatformStatus: string | null;
  enabled: boolean;
  lastVerifiedAt: string | null;
  safeLastError: string | null;
};

export type ChannelSetupStatusListDto = {
  data: ChannelSetupStatusItemDto[];
};

function defaultProviderLabel(channel: SupportedChannelSettingChannel): string {
  if (channel === "LINE") return "LINE Official Account";
  if (channel === "FACEBOOK") return "Facebook Page";
  return "Instagram Account";
}

function pickSafeLabel(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const trimmed = typeof candidate === "string" ? candidate.trim() : "";
    if (trimmed && !isLikelyRawProviderId(trimmed)) return trimmed;
  }
  return null;
}

function resolveConnectionLabel(
  channel: SupportedChannelSettingChannel,
  setting: ChannelSettingPublicDto | null,
  connection: ChannelConnectionRecord | null
): string | null {
  const label = pickSafeLabel(
    setting?.displayName,
    setting?.providerAccountName,
    connection?.providerAccountName
  );
  if (label) return label;
  if (setting || connection) return defaultProviderLabel(channel);
  return null;
}

function resolveMaskedProviderIdentity(
  setting: ChannelSettingPublicDto | null,
  connection: ChannelConnectionRecord | null
): string | null {
  const raw =
    connection?.providerPageId ??
    connection?.providerIgAccountId ??
    connection?.providerAccountId ??
    setting?.providerPageId ??
    (typeof setting?.configJson?.providerPageId === "string" ? setting.configJson.providerPageId : null) ??
    (typeof setting?.configJson?.channelId === "string" ? setting.configJson.channelId : null);
  return maskProviderIdentity(raw);
}

function buildCredentialsPresent(
  channel: SupportedChannelSettingChannel,
  setting: ChannelSettingPublicDto | null
): ChannelSetupCredentialsPresentDto {
  const secretState = setting?.secretState ?? { accessToken: "EMPTY" as const };
  const accessToken = secretState.accessToken === "SET";
  const channelSecret = secretState.channelSecret === "SET";
  const appSecret = secretState.appSecret === "SET";
  const verifyToken = secretState.verifyToken === "SET";

  const allRequiredPresent = setting
    ? isChannelConfigured(channel, setting.secretState)
    : false;

  if (channel === "LINE") {
    return { accessToken, channelSecret, allRequiredPresent };
  }
  return { accessToken, appSecret, verifyToken, allRequiredPresent };
}

function legacyWebhookPath(channel: SupportedChannelSettingChannel): string {
  if (channel === "LINE") return "/api/webhook/line";
  if (channel === "FACEBOOK") return "/api/webhook/facebook";
  return "/api/webhook/instagram";
}

function resolveWebhookCallbackUrl(
  channel: SupportedChannelSettingChannel,
  connection: ChannelConnectionRecord | null
): string | null {
  const endpoint = connection?.webhookEndpoint?.trim();
  if (endpoint?.startsWith("http://") || endpoint?.startsWith("https://")) {
    return endpoint;
  }
  if (connection?.publicConnectionKey?.trim()) {
    const segment = channel === "LINE" ? "line" : channel === "FACEBOOK" ? "facebook" : "instagram";
    return `/api/webhook/${segment}/connections/${connection.publicConnectionKey.trim()}`;
  }
  return legacyWebhookPath(channel);
}

function buildMissingSetupSteps(input: {
  channel: SupportedChannelSettingChannel;
  setting: ChannelSettingPublicDto | null;
  connection: ChannelConnectionRecord | null;
  credentialsPresent: ChannelSetupCredentialsPresentDto;
  setupStatus: ChannelSetupLifecycleStatus;
}): ChannelSetupMissingStep[] {
  const steps: ChannelSetupMissingStep[] = [];
  const { channel, setting, connection, credentialsPresent, setupStatus } = input;

  if (setupStatus === "disconnected") {
    steps.push("RECONNECT_CHANNEL");
    return steps;
  }

  if (!setting?.enabled) {
    steps.push("ENABLE_CHANNEL");
  }

  if (!credentialsPresent.accessToken) steps.push("SET_ACCESS_TOKEN");
  if (channel === "LINE") {
    if (!credentialsPresent.channelSecret) steps.push("SET_CHANNEL_SECRET");
  } else {
    if (!credentialsPresent.appSecret) steps.push("SET_APP_SECRET");
    if (!credentialsPresent.verifyToken) steps.push("SET_VERIFY_TOKEN");
    const pageId =
      setting?.providerPageId ??
      (typeof setting?.configJson?.providerPageId === "string" ? setting.configJson.providerPageId : null);
    if (!pageId?.trim() && !connection?.providerPageId && !connection?.providerIgAccountId) {
      steps.push("SET_PROVIDER_PAGE_ID");
    }
  }

  if (connection && !connection.webhookActive && connection.status !== "READY") {
    steps.push("CONFIGURE_WEBHOOK");
  }

  if (setupStatus === "needs_attention") {
    steps.push("RESOLVE_CONNECTION_ERROR");
  }

  if (setting?.enabled && credentialsPresent.allRequiredPresent && setupStatus !== "ready") {
    steps.push("RUN_TEST_CONNECTION");
  }

  return steps;
}

function resolveSetupStatus(input: {
  setting: ChannelSettingPublicDto | null;
  connection: ChannelConnectionRecord | null;
  credentialsPresent: ChannelSetupCredentialsPresentDto;
}): ChannelSetupLifecycleStatus {
  const { setting, connection, credentialsPresent } = input;

  if (connection?.status === "REVOKED" || connection?.status === "RECONNECT_REQUIRED") {
    return "disconnected";
  }

  if (setting?.enabled === false && (setting.configured || connection)) {
    return "disconnected";
  }

  const hasError =
    setting?.status === "ERROR" ||
    connection?.status === "ERROR" ||
    Boolean(setting?.lastError?.trim()) ||
    Boolean(connection?.lastErrorCode?.trim()) ||
    Boolean(connection?.lastErrorMessageSafe?.trim());

  if (hasError) {
    return "needs_attention";
  }

  const settingsReady = Boolean(setting?.enabled && setting.configured && setting.status === "READY");
  const connectionReady = Boolean(connection && isActiveChannelConnectionStatus(connection.status));

  if (settingsReady || connectionReady) {
    return "ready";
  }

  const hasPartialConfig =
    credentialsPresent.accessToken ||
    credentialsPresent.channelSecret ||
    credentialsPresent.appSecret ||
    credentialsPresent.verifyToken ||
    Boolean(connection && connection.status !== "DRAFT");

  if (hasPartialConfig) {
    return "configured";
  }

  return "not_configured";
}

function buildActiveScopeSummary(
  channel: SupportedChannelSettingChannel,
  ctx: TenantConnectionScopeContext,
  setting: ChannelSettingPublicDto | null,
  connection: ChannelConnectionRecord | null
): ChannelSetupActiveScopeSummaryDto {
  const activeForProvider = ctx.activeConnections.filter((c) => c.provider === channel);
  const anyForProvider = ctx.connections.filter((c) => c.provider === channel);
  const settingsActive = ctx.settingsFallback.some(
    (s) => s.provider === channel && s.enabled && s.status === "READY"
  );

  let scopeBucket: ChannelSetupActiveScopeSummaryDto["scopeBucket"] = "none";
  if (activeForProvider.length > 0 || settingsActive) {
    scopeBucket = "active";
  } else if (anyForProvider.length > 0) {
    scopeBucket = "historical_only";
  }

  return {
    hasActiveConnection: activeForProvider.length > 0 || settingsActive,
    activeConnectionCount: activeForProvider.length + (settingsActive && activeForProvider.length === 0 ? 1 : 0),
    scopeBucket,
    maskedProviderIdentity: resolveMaskedProviderIdentity(setting, connection)
  };
}

export function buildChannelSetupStatusItem(input: {
  channel: SupportedChannelSettingChannel;
  setting: ChannelSettingPublicDto | null;
  connection: ChannelConnectionRecord | null;
  scopeContext: TenantConnectionScopeContext;
}): ChannelSetupStatusItemDto {
  const { channel, setting, connection, scopeContext } = input;
  const credentialsPresent = buildCredentialsPresent(channel, setting);
  const setupStatus = resolveSetupStatus({ setting, connection, credentialsPresent });
  const safeLastError = setting?.lastError?.trim() || connection?.lastErrorMessageSafe?.trim() || null;

  return {
    channel,
    setupStatus,
    connectionLabel: resolveConnectionLabel(channel, setting, connection),
    credentialsPresent,
    testConnectionAvailable: Boolean(setting?.enabled && credentialsPresent.allRequiredPresent),
    webhookCallbackUrl: resolveWebhookCallbackUrl(channel, connection),
    missingSetupSteps: buildMissingSetupSteps({
      channel,
      setting,
      connection,
      credentialsPresent,
      setupStatus
    }),
    activeConnectionScope: buildActiveScopeSummary(channel, scopeContext, setting, connection),
    channelSettingsStatus: setting?.status ?? null,
    connectionPlatformStatus: connection?.status ?? null,
    enabled: Boolean(setting?.enabled),
    lastVerifiedAt: setting?.lastVerifiedAt ?? null,
    safeLastError
  };
}

export function buildChannelSetupStatusList(input: {
  settings: ChannelSettingPublicDto[];
  connections: ChannelConnectionRecord[];
}): ChannelSetupStatusListDto {
  const scopeContext = buildTenantConnectionScopeContext({
    connections: input.connections,
    settingsFallback: input.settings.map((row) => ({
      provider: row.channel,
      providerPageId: row.providerPageId,
      providerAccountName: row.providerAccountName ?? row.displayName ?? null,
      enabled: row.enabled,
      status: row.status
    }))
  });

  const settingsByChannel = new Map(input.settings.map((row) => [row.channel, row]));
  const connectionsByProvider = new Map(input.connections.map((row) => [row.provider, row]));

  const data = SUPPORTED_CHANNEL_SETTING_CHANNELS.map((channel) =>
    buildChannelSetupStatusItem({
      channel,
      setting: settingsByChannel.get(channel) ?? null,
      connection: connectionsByProvider.get(channel) ?? null,
      scopeContext
    })
  );

  return { data };
}

/** Guardrail: active connection statuses used for scope must stay aligned with CCW-1A. */
export const ACTIVE_SETUP_CONNECTION_STATUSES = ACTIVE_CHANNEL_CONNECTION_STATUSES;
