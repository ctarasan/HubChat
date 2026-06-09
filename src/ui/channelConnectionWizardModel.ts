/**
 * ACW-1B — Assisted Channel Connection Wizard UI model.
 * Primary: GET /api/channel-connections/setup-status (ACW-1A #201)
 * Fallback only: GET /api/channel-settings mapped per channel
 */

import type {
  ChannelSetupLifecycleStatus,
  ChannelSetupMissingStep,
  ChannelSetupStatusItemDto
} from "../domain/channelSetupStatus.js";
import type { ChannelSettingView } from "./channelSettingsModel.js";
import {
  CHANNEL_SECRET_FIELDS,
  channelDisplayLabel,
  formatLastErrorDisplay,
  formatLastVerifiedDisplay
} from "./channelSettingsModel.js";
import type { DashboardNavRole } from "./dashboardNavAccess.js";

export const CHANNEL_SETUP_STATUS_API_PATH = "/api/channel-connections/setup-status";

export const WIZARD_CHANNELS = ["LINE", "FACEBOOK", "INSTAGRAM"] as const;
export type WizardChannel = (typeof WIZARD_CHANNELS)[number];

export type WizardSetupStatus = ChannelSetupLifecycleStatus;

export type WizardSetupStepId =
  | "prerequisites"
  | "credential_source"
  | "webhook"
  | "credentials"
  | "verify";

export type WizardSetupStep = {
  id: WizardSetupStepId;
  title: string;
  description: string;
  completed: boolean;
};

export type WizardChannelCard = {
  channel: WizardChannel;
  setupStatus: WizardSetupStatus;
  statusLabel: string;
  statusClassName: string;
  connectionLabel: string | null;
  missingSteps: string[];
  lastStatusText: string;
  supportsTestConnection: boolean;
  supportsWizardSave: boolean;
  webhookUrl: string | null;
  steps: WizardSetupStep[];
  testId: string;
};

export type WizardDataScopeMessage = {
  title: string;
  body: string;
  adminHint: string;
  testId: string;
};

const UNSAFE_LABEL_PATTERNS = [/^\d{8,}$/, /^https?:\/\//i, /Bearer\s+/i, /…len=\d+/i];

const MISSING_STEP_LABELS: Record<ChannelSetupMissingStep, string> = {
  ENABLE_CHANNEL: "Enable channel",
  SET_ACCESS_TOKEN: "Set access token",
  SET_CHANNEL_SECRET: "Set channel secret",
  SET_APP_SECRET: "Set app secret",
  SET_VERIFY_TOKEN: "Set verify token",
  SET_PROVIDER_PAGE_ID: "Set Page ID metadata",
  CONFIGURE_WEBHOOK: "Configure webhook",
  RUN_TEST_CONNECTION: "Run test connection",
  RESOLVE_CONNECTION_ERROR: "Resolve connection error",
  RECONNECT_CHANNEL: "Reconnect channel"
};

export function isUnsafeWizardConnectionLabel(label: string): boolean {
  const trimmed = label.trim();
  if (!trimmed) return true;
  return UNSAFE_LABEL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function formatMissingSetupStepLabel(step: string): string {
  const key = step.trim().toUpperCase() as ChannelSetupMissingStep;
  if (key in MISSING_STEP_LABELS) return MISSING_STEP_LABELS[key];
  return step.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function wizardStatusLabel(status: WizardSetupStatus): string {
  if (status === "not_configured") return "Not connected";
  if (status === "configured") return "Configured";
  if (status === "ready") return "Ready";
  if (status === "needs_attention") return "Needs attention";
  return "Disconnected";
}

export function wizardStatusClassName(status: WizardSetupStatus): string {
  return `channel-wizard-status channel-wizard-status-${status.replace(/_/g, "-")}`;
}

export function canAccessChannelConnectionWizard(role: DashboardNavRole | null | undefined): boolean {
  return role === "ADMIN";
}

export function resolveWizardDataScopeMessage(): WizardDataScopeMessage {
  return {
    title: "Historical channel data is preserved",
    body:
      "Conversations and leads from disconnected or replaced channels stay in your tenant history. Team Inbox and Leads show active connections by default.",
    adminHint:
      "Admins and Managers can enable Include disconnected / history in inbox or leads filters to review older channel data. Nothing is deleted automatically when you reconnect.",
    testId: "channel-wizard-data-scope"
  };
}

export function resolveWizardWebhookDisplayUrl(
  webhookCallbackUrl: string | null | undefined,
  baseUrl: string
): string | null {
  const raw = webhookCallbackUrl?.trim() ?? "";
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  const origin = baseUrl.trim().replace(/\/$/, "");
  return `${origin}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function resolveLastStatusTextFromApi(item: {
  safeLastError?: string | null;
  lastVerifiedAt?: string | null;
}): string {
  if (item.safeLastError?.trim()) {
    return `Last error: ${formatLastErrorDisplay(item.safeLastError)}`;
  }
  return `Last verified: ${formatLastVerifiedDisplay(item.lastVerifiedAt ?? null)}`;
}

function wizardPrerequisites(channel: WizardChannel): string {
  if (channel === "LINE") {
    return "LINE Official Account and LINE Developers Console access with Messaging API enabled.";
  }
  if (channel === "FACEBOOK") {
    return "Facebook Page with Messenger enabled and a Meta developer app with webhook permissions.";
  }
  return "Instagram professional account linked to a Facebook Page and Meta developer app access.";
}

function wizardCredentialSource(channel: WizardChannel): string {
  if (channel === "LINE") {
    return "Copy the Channel secret and Channel access token from the LINE Developers Console → Messaging API.";
  }
  if (channel === "FACEBOOK") {
    return "Generate a Page access token, App secret, and Verify token from Meta for Developers.";
  }
  return "Use the Instagram-linked Page token, App secret, and Verify token from Meta for Developers.";
}

export function buildWizardSetupStepsFromApiItem(
  channel: WizardChannel,
  item: Pick<
    ChannelSetupStatusItemDto,
    "credentialsPresent" | "missingSetupSteps" | "setupStatus" | "lastVerifiedAt" | "webhookCallbackUrl"
  >,
  webhookUrl: string | null
): WizardSetupStep[] {
  const missing = item.missingSetupSteps ?? [];
  const creds = item.credentialsPresent;
  const verified = item.setupStatus === "ready" && Boolean(item.lastVerifiedAt?.trim());
  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      description: wizardPrerequisites(channel),
      completed: item.setupStatus !== "not_configured"
    },
    {
      id: "credential_source",
      title: "Where to get values",
      description: wizardCredentialSource(channel),
      completed: Boolean(
        creds.accessToken || creds.channelSecret || creds.appSecret || creds.verifyToken
      )
    },
    {
      id: "webhook",
      title: "Webhook URL",
      description: webhookUrl
        ? "Register this callback URL in the provider console."
        : "Webhook URL unavailable until connection is configured.",
      completed: !missing.includes("CONFIGURE_WEBHOOK")
    },
    {
      id: "credentials",
      title: "Credentials",
      description:
        creds.allRequiredPresent
          ? "Required credentials are stored (write-only)."
          : missing.length > 0
            ? `Still needed: ${missing.map(formatMissingSetupStepLabel).join(", ")}`
            : "Enter required credentials below.",
      completed: creds.allRequiredPresent
    },
    {
      id: "verify",
      title: "Test connection",
      description: verified
        ? "Last connection test succeeded."
        : "Run Test connection after saving credentials.",
      completed: verified
    }
  ];
}

export function buildWizardCardFromSetupStatusItem(
  item: ChannelSetupStatusItemDto,
  baseUrl: string
): WizardChannelCard {
  const channel = item.channel;
  const labelRaw = item.connectionLabel?.trim() ?? "";
  const connectionLabel =
    labelRaw && !isUnsafeWizardConnectionLabel(labelRaw) ? labelRaw : null;
  const missingSteps = item.missingSetupSteps.map(formatMissingSetupStepLabel);
  const webhookUrl = resolveWizardWebhookDisplayUrl(item.webhookCallbackUrl, baseUrl);

  return {
    channel,
    setupStatus: item.setupStatus,
    statusLabel: wizardStatusLabel(item.setupStatus),
    statusClassName: wizardStatusClassName(item.setupStatus),
    connectionLabel,
    missingSteps,
    lastStatusText: resolveLastStatusTextFromApi(item),
    supportsTestConnection: item.testConnectionAvailable === true,
    supportsWizardSave: true,
    webhookUrl,
    steps: buildWizardSetupStepsFromApiItem(channel, item, webhookUrl),
    testId: `channel-wizard-card-${channel.toLowerCase()}`
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readWizardChannel(value: unknown): WizardChannel | null {
  const raw = typeof value === "string" ? value.toUpperCase() : "";
  if (raw === "LINE" || raw === "FACEBOOK" || raw === "INSTAGRAM") return raw;
  return null;
}

function readSetupLifecycleStatus(value: unknown): WizardSetupStatus | null {
  const raw = typeof value === "string" ? value.toLowerCase() : "";
  if (
    raw === "not_configured" ||
    raw === "configured" ||
    raw === "ready" ||
    raw === "needs_attention" ||
    raw === "disconnected"
  ) {
    return raw;
  }
  return null;
}

function readMissingSetupSteps(raw: Record<string, unknown>): ChannelSetupMissingStep[] {
  const source = raw.missingSetupSteps ?? raw.missing_setup_steps;
  if (!Array.isArray(source)) return [];
  return source
    .filter((step): step is string => typeof step === "string" && step.trim().length > 0)
    .map((step) => step.trim().toUpperCase() as ChannelSetupMissingStep);
}

function readCredentialsPresent(raw: Record<string, unknown>): ChannelSetupStatusItemDto["credentialsPresent"] {
  const source = isRecord(raw.credentialsPresent)
    ? raw.credentialsPresent
    : isRecord(raw.credentials_present)
      ? raw.credentials_present
      : {};
  return {
    accessToken: source.accessToken === true || source.access_token === true,
    channelSecret: source.channelSecret === true || source.channel_secret === true,
    appSecret: source.appSecret === true || source.app_secret === true,
    verifyToken: source.verifyToken === true || source.verify_token === true,
    allRequiredPresent: source.allRequiredPresent === true || source.all_required_present === true
  };
}

function parseSetupStatusItem(raw: Record<string, unknown>): ChannelSetupStatusItemDto | null {
  const channel = readWizardChannel(raw.channel);
  const setupStatus = readSetupLifecycleStatus(raw.setupStatus ?? raw.setup_status);
  if (!channel || !setupStatus) return null;

  const labelRaw =
    typeof raw.connectionLabel === "string"
      ? raw.connectionLabel
      : typeof raw.connection_label === "string"
        ? raw.connection_label
        : null;
  const connectionLabel =
    labelRaw && !isUnsafeWizardConnectionLabel(labelRaw) ? labelRaw.trim() : null;

  const scopeRaw = isRecord(raw.activeConnectionScope)
    ? raw.activeConnectionScope
    : isRecord(raw.active_connection_scope)
      ? raw.active_connection_scope
      : {};

  return {
    channel,
    setupStatus,
    connectionLabel,
    credentialsPresent: readCredentialsPresent(raw),
    testConnectionAvailable:
      raw.testConnectionAvailable === true || raw.test_connection_available === true,
    webhookCallbackUrl:
      typeof raw.webhookCallbackUrl === "string"
        ? raw.webhookCallbackUrl
        : typeof raw.webhook_callback_url === "string"
          ? raw.webhook_callback_url
          : null,
    missingSetupSteps: readMissingSetupSteps(raw),
    activeConnectionScope: {
      hasActiveConnection:
        scopeRaw.hasActiveConnection === true || scopeRaw.has_active_connection === true,
      activeConnectionCount:
        typeof scopeRaw.activeConnectionCount === "number"
          ? scopeRaw.activeConnectionCount
          : typeof scopeRaw.active_connection_count === "number"
            ? scopeRaw.active_connection_count
            : 0,
      scopeBucket:
        scopeRaw.scopeBucket === "active" ||
        scopeRaw.scopeBucket === "historical_only" ||
        scopeRaw.scope_bucket === "active" ||
        scopeRaw.scope_bucket === "historical_only"
          ? ((scopeRaw.scopeBucket ?? scopeRaw.scope_bucket) as "active" | "historical_only")
          : "none",
      maskedProviderIdentity: null
    },
    channelSettingsStatus: null,
    connectionPlatformStatus:
      typeof raw.connectionPlatformStatus === "string"
        ? raw.connectionPlatformStatus
        : typeof raw.connection_platform_status === "string"
          ? raw.connection_platform_status
          : null,
    enabled: raw.enabled === true,
    lastVerifiedAt:
      typeof raw.lastVerifiedAt === "string"
        ? raw.lastVerifiedAt
        : typeof raw.last_verified_at === "string"
          ? raw.last_verified_at
          : null,
    safeLastError:
      typeof raw.safeLastError === "string"
        ? raw.safeLastError
        : typeof raw.safe_last_error === "string"
          ? raw.safe_last_error
          : null
  };
}

/** Primary ACW-1A adapter for GET /api/channel-connections/setup-status. */
export function parseChannelSetupStatusResponse(
  body: unknown,
  baseUrl: string
): { ok: true; cards: WizardChannelCard[] } | { ok: false; error: string } {
  const data = isRecord(body) && Array.isArray(body.data) ? body.data : null;
  if (!data) {
    return { ok: false, error: "Invalid channel setup status response." };
  }

  const parsed: ChannelSetupStatusItemDto[] = [];
  for (const raw of data) {
    if (!isRecord(raw)) continue;
    const item = parseSetupStatusItem(raw);
    if (item) parsed.push(item);
  }

  if (parsed.length === 0) {
    return { ok: false, error: "Channel setup status response is empty." };
  }

  const byChannel = new Map(parsed.map((item) => [item.channel, item]));
  const cards = WIZARD_CHANNELS.map((channel) => {
    const item = byChannel.get(channel);
    if (!item) return buildWizardCardPlaceholder(channel, baseUrl);
    return buildWizardCardFromSetupStatusItem(item, baseUrl);
  });

  return { ok: true, cards };
}

function buildWizardCardPlaceholder(channel: WizardChannel, baseUrl: string): WizardChannelCard {
  const placeholderItem: ChannelSetupStatusItemDto = {
    channel,
    setupStatus: "not_configured",
    connectionLabel: null,
    credentialsPresent: { accessToken: false, allRequiredPresent: false },
    testConnectionAvailable: false,
    webhookCallbackUrl: null,
    missingSetupSteps: ["ENABLE_CHANNEL", "SET_ACCESS_TOKEN"],
    activeConnectionScope: {
      hasActiveConnection: false,
      activeConnectionCount: 0,
      scopeBucket: "none",
      maskedProviderIdentity: null
    },
    channelSettingsStatus: null,
    connectionPlatformStatus: null,
    enabled: false,
    lastVerifiedAt: null,
    safeLastError: null
  };
  return buildWizardCardFromSetupStatusItem(placeholderItem, baseUrl);
}

/** Fallback only when setup-status API is unavailable. */
function mapChannelSettingToWizardStatus(row: ChannelSettingView): WizardSetupStatus {
  if (!row.enabled && row.configured) return "disconnected";
  if (row.status === "DISABLED") return "disconnected";
  if (row.status === "READY") return "ready";
  if (row.status === "ERROR") return "needs_attention";
  const missing = CHANNEL_SECRET_FIELDS[row.channel].filter(
    (field) => row.secretState[field.stateKey] !== "SET"
  );
  if (!row.configured && missing.length === CHANNEL_SECRET_FIELDS[row.channel].length) {
    return "not_configured";
  }
  if (missing.length > 0 || !row.configured) return "configured";
  return "not_configured";
}

function buildWizardCardFromChannelSettingFallback(
  row: ChannelSettingView,
  baseUrl: string
): WizardChannelCard {
  const setupStatus = mapChannelSettingToWizardStatus(row);
  const missingSteps = CHANNEL_SECRET_FIELDS[row.channel]
    .filter((field) => row.secretState[field.stateKey] !== "SET")
    .map((field) => field.label);
  const label =
    row.providerAccountName?.trim() && !isUnsafeWizardConnectionLabel(row.providerAccountName)
      ? row.providerAccountName.trim()
      : row.legacyDisplayName?.trim() && !isUnsafeWizardConnectionLabel(row.legacyDisplayName)
        ? row.legacyDisplayName.trim()
        : null;
  const webhookUrl = resolveWizardWebhookDisplayUrl(
    row.channel === "LINE"
      ? "/api/webhook/line"
      : row.channel === "FACEBOOK"
        ? "/api/webhook/facebook"
        : "/api/webhook/instagram",
    baseUrl
  );
  const item: ChannelSetupStatusItemDto = {
    channel: row.channel,
    setupStatus,
    connectionLabel: label,
    credentialsPresent: {
      accessToken: row.secretState.accessToken === "SET",
      channelSecret: row.secretState.channelSecret === "SET",
      appSecret: row.secretState.appSecret === "SET",
      verifyToken: row.secretState.verifyToken === "SET",
      allRequiredPresent: missingSteps.length === 0 && row.configured
    },
    testConnectionAvailable: row.enabled && missingSteps.length === 0,
    webhookCallbackUrl: webhookUrl,
    missingSetupSteps: missingSteps.map((label) => {
      if (label.includes("secret")) return "SET_CHANNEL_SECRET";
      if (label.includes("token")) return "SET_ACCESS_TOKEN";
      return "ENABLE_CHANNEL";
    }) as ChannelSetupMissingStep[],
    activeConnectionScope: {
      hasActiveConnection: setupStatus === "ready",
      activeConnectionCount: setupStatus === "ready" ? 1 : 0,
      scopeBucket: setupStatus === "ready" ? "active" : "none",
      maskedProviderIdentity: null
    },
    channelSettingsStatus: row.status,
    connectionPlatformStatus: null,
    enabled: row.enabled,
    lastVerifiedAt: row.lastVerifiedAt,
    safeLastError: row.lastError
  };
  return buildWizardCardFromSetupStatusItem(item, baseUrl);
}

export function buildWizardCardsFromChannelSettingsFallback(
  rows: ChannelSettingView[],
  baseUrl: string
): WizardChannelCard[] {
  const byChannel = new Map(rows.map((row) => [row.channel, row]));
  return WIZARD_CHANNELS.map((channel) => {
    const row = byChannel.get(channel);
    if (!row) return buildWizardCardPlaceholder(channel, baseUrl);
    return buildWizardCardFromChannelSettingFallback(row, baseUrl);
  });
}

export function resolveWizardCards(input: {
  baseUrl: string;
  setupStatusApiBody?: unknown;
  channelSettingsRows?: ChannelSettingView[];
}): WizardChannelCard[] {
  if (input.setupStatusApiBody) {
    const parsed = parseChannelSetupStatusResponse(input.setupStatusApiBody, input.baseUrl);
    if (parsed.ok) return parsed.cards;
  }
  return buildWizardCardsFromChannelSettingsFallback(input.channelSettingsRows ?? [], input.baseUrl);
}

export function wizardChannelTitle(channel: WizardChannel): string {
  return channelDisplayLabel(channel);
}

const WIZARD_VIEW_FORBIDDEN_PATTERNS = [
  /Bearer\s+\S+/i,
  /secret_json/i,
  /page_access_token/i,
  /channel_secret/i,
  /access_token/i,
  /providerPageId/i,
  /provider_page_id/i,
  /maskedProviderIdentity/i,
  /…len=\d+/i
];

export function wizardCardViewIsSafe(card: WizardChannelCard): boolean {
  const serialized = JSON.stringify(card);
  return !WIZARD_VIEW_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(serialized));
}
