/**
 * ACW-1B — Assisted Channel Connection Wizard UI model.
 * Consumes safe status fields only; never renders secrets, tokens, or raw provider IDs.
 *
 * Data sources:
 * - Interim: GET /api/channel-settings (mapped per channel independently)
 * - ACW-1A (when merged): GET /api/channel-connection-wizard
 */

import type { ChannelSettingView, SupportedChannel } from "./channelSettingsModel.js";
import { CHANNEL_SECRET_FIELDS, channelDisplayLabel, formatLastErrorDisplay, formatLastVerifiedDisplay } from "./channelSettingsModel.js";
import type { DashboardNavRole } from "./dashboardNavAccess.js";

export const WIZARD_CHANNELS = ["LINE", "FACEBOOK", "INSTAGRAM"] as const;
export type WizardChannel = (typeof WIZARD_CHANNELS)[number];

export const WIZARD_SETUP_STATUSES = [
  "NOT_CONNECTED",
  "READY",
  "NEEDS_ATTENTION",
  "DISCONNECTED"
] as const;
export type WizardSetupStatus = (typeof WIZARD_SETUP_STATUSES)[number];

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
  status: WizardSetupStatus;
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

/** ACW-1A proposed per-channel row (camelCase). */
export type AcwWizardChannelDto = {
  channel: WizardChannel;
  setupStatus: WizardSetupStatus;
  connectionLabel?: string | null;
  missingSteps?: string[];
  lastStatusText?: string | null;
  webhookUrl?: string | null;
  supportsTestConnection?: boolean;
  supportsWizardSave?: boolean;
};

const UNSAFE_LABEL_PATTERNS = [/^\d{8,}$/, /^https?:\/\//i, /Bearer\s+/i];

export function isUnsafeWizardConnectionLabel(label: string): boolean {
  const trimmed = label.trim();
  if (!trimmed) return true;
  return UNSAFE_LABEL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function resolveSafeWizardConnectionLabel(input: {
  providerAccountName?: string | null;
  legacyDisplayName?: string | null;
  providerPageId?: string | null;
}): string | null {
  for (const candidate of [input.providerAccountName, input.legacyDisplayName]) {
    const trimmed = candidate?.trim() ?? "";
    if (!trimmed || isUnsafeWizardConnectionLabel(trimmed)) continue;
    if (input.providerPageId?.trim() && trimmed === input.providerPageId.trim()) continue;
    return trimmed;
  }
  return null;
}

export function wizardStatusLabel(status: WizardSetupStatus): string {
  if (status === "NOT_CONNECTED") return "Not connected";
  if (status === "READY") return "Ready";
  if (status === "NEEDS_ATTENTION") return "Needs attention";
  return "Disconnected";
}

export function wizardStatusClassName(status: WizardSetupStatus): string {
  return `channel-wizard-status channel-wizard-status-${status.toLowerCase().replace(/_/g, "-")}`;
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

export function resolveWizardWebhookUrl(channel: WizardChannel, baseUrl: string): string {
  const origin = baseUrl.trim().replace(/\/$/, "");
  if (channel === "LINE") return `${origin}/api/webhook/line`;
  if (channel === "FACEBOOK") return `${origin}/api/webhook/facebook`;
  return `${origin}/api/webhook/instagram`;
}

function requiredSecretLabels(channel: WizardChannel, row: ChannelSettingView): string[] {
  const missing: string[] = [];
  for (const field of CHANNEL_SECRET_FIELDS[channel]) {
    const presence = row.secretState[field.stateKey];
    if (presence !== "SET") {
      missing.push(field.label);
    }
  }
  if ((channel === "FACEBOOK" || channel === "INSTAGRAM") && !row.providerPageId?.trim()) {
    missing.push("Page ID metadata");
  }
  return missing;
}

function mapChannelSettingToWizardStatus(row: ChannelSettingView): WizardSetupStatus {
  if (!row.enabled && row.configured) return "DISCONNECTED";
  if (row.status === "DISABLED") return "DISCONNECTED";
  if (row.status === "READY") return "READY";
  if (row.status === "ERROR") return "NEEDS_ATTENTION";
  const missing = requiredSecretLabels(row.channel, row);
  if (!row.configured && missing.length === CHANNEL_SECRET_FIELDS[row.channel].length) {
    return "NOT_CONNECTED";
  }
  if (missing.length > 0 || !row.configured) return "NEEDS_ATTENTION";
  return "NOT_CONNECTED";
}

function resolveLastStatusText(row: ChannelSettingView): string {
  if (row.lastError?.trim()) {
    return `Last error: ${formatLastErrorDisplay(row.lastError)}`;
  }
  return `Last verified: ${formatLastVerifiedDisplay(row.lastVerifiedAt)}`;
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

export function buildWizardSetupSteps(
  channel: WizardChannel,
  row: ChannelSettingView,
  webhookUrl: string
): WizardSetupStep[] {
  const missingSecrets = requiredSecretLabels(channel, row);
  const hasWebhook = Boolean(webhookUrl.trim());
  const verified = Boolean(row.lastVerifiedAt?.trim()) && row.status === "READY";
  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      description: wizardPrerequisites(channel),
      completed: row.configured || row.enabled
    },
    {
      id: "credential_source",
      title: "Where to get values",
      description: wizardCredentialSource(channel),
      completed: missingSecrets.length < CHANNEL_SECRET_FIELDS[channel].length
    },
    {
      id: "webhook",
      title: "Webhook URL",
      description: hasWebhook
        ? "Register this callback URL in the provider console."
        : "Webhook URL unavailable until base URL is configured.",
      completed: row.configured
    },
    {
      id: "credentials",
      title: "Credentials",
      description:
        missingSecrets.length === 0
          ? "Required credentials are stored (write-only)."
          : `Still needed: ${missingSecrets.join(", ")}`,
      completed: missingSecrets.length === 0
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

export function buildWizardCardFromChannelSetting(
  row: ChannelSettingView,
  baseUrl: string
): WizardChannelCard {
  const channel = row.channel;
  const status = mapChannelSettingToWizardStatus(row);
  const missingSteps = requiredSecretLabels(channel, row);
  const webhookUrl = resolveWizardWebhookUrl(channel, baseUrl);
  return {
    channel,
    status,
    statusLabel: wizardStatusLabel(status),
    statusClassName: wizardStatusClassName(status),
    connectionLabel: resolveSafeWizardConnectionLabel(row),
    missingSteps,
    lastStatusText: resolveLastStatusText(row),
    supportsTestConnection: true,
    supportsWizardSave: true,
    webhookUrl,
    steps: buildWizardSetupSteps(channel, row, webhookUrl),
    testId: `channel-wizard-card-${channel.toLowerCase()}`
  };
}

/** Each channel card is derived only from its own settings row — no cross-channel state. */
export function buildWizardCardsFromChannelSettings(
  rows: ChannelSettingView[],
  baseUrl: string
): WizardChannelCard[] {
  const byChannel = new Map(rows.map((row) => [row.channel, row]));
  return WIZARD_CHANNELS.map((channel) => {
    const row = byChannel.get(channel);
    if (!row) {
      return buildWizardCardPlaceholder(channel, baseUrl);
    }
    return buildWizardCardFromChannelSetting(row, baseUrl);
  });
}

function buildWizardCardPlaceholder(channel: WizardChannel, baseUrl: string): WizardChannelCard {
  const webhookUrl = resolveWizardWebhookUrl(channel, baseUrl);
  const emptyRow: ChannelSettingView = {
    channel,
    enabled: false,
    configured: false,
    status: "NOT_CONFIGURED",
    providerPageId: null,
    providerAccountName: null,
    lastVerifiedAt: null,
    lastError: null,
    updatedAt: "",
    secretState: { accessToken: "EMPTY" }
  };
  return {
    channel,
    status: "NOT_CONNECTED",
    statusLabel: wizardStatusLabel("NOT_CONNECTED"),
    statusClassName: wizardStatusClassName("NOT_CONNECTED"),
    connectionLabel: null,
    missingSteps: CHANNEL_SECRET_FIELDS[channel].map((f) => f.label),
    lastStatusText: "Not configured yet",
    supportsTestConnection: true,
    supportsWizardSave: true,
    webhookUrl,
    steps: buildWizardSetupSteps(channel, emptyRow, webhookUrl),
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

function readWizardSetupStatus(value: unknown): WizardSetupStatus {
  const raw = typeof value === "string" ? value.toUpperCase() : "";
  if (raw === "READY" || raw === "NEEDS_ATTENTION" || raw === "DISCONNECTED") return raw;
  return "NOT_CONNECTED";
}

/** ACW-1A adapter — returns null until API response is valid. */
export function buildWizardCardsFromAcwApi(
  body: unknown,
  baseUrl: string
): WizardChannelCard[] | null {
  const data = isRecord(body) && Array.isArray(body.data) ? body.data : null;
  if (!data) return null;

  const cards: WizardChannelCard[] = [];
  for (const raw of data) {
    if (!isRecord(raw)) continue;
    const channel = readWizardChannel(raw.channel);
    if (!channel) continue;
    const status = readWizardSetupStatus(raw.setupStatus ?? raw.setup_status);
    const labelRaw =
      typeof raw.connectionLabel === "string"
        ? raw.connectionLabel
        : typeof raw.connection_label === "string"
          ? raw.connection_label
          : null;
    const connectionLabel =
      labelRaw && !isUnsafeWizardConnectionLabel(labelRaw) ? labelRaw.trim() : null;
    const rawMissing = raw.missingSteps ?? raw.missing_steps;
    const missingSteps = Array.isArray(rawMissing)
      ? rawMissing
          .filter((step: unknown): step is string => typeof step === "string" && step.trim().length > 0)
          .map((step) => step.trim())
      : [];
    const lastStatusText =
      typeof raw.lastStatusText === "string"
        ? raw.lastStatusText.trim()
        : typeof raw.last_status_text === "string"
          ? raw.last_status_text.trim()
          : "Status unavailable";
    const webhookUrl =
      typeof raw.webhookUrl === "string"
        ? raw.webhookUrl.trim()
        : typeof raw.webhook_url === "string"
          ? raw.webhook_url.trim()
          : resolveWizardWebhookUrl(channel, baseUrl);

    cards.push({
      channel,
      status,
      statusLabel: wizardStatusLabel(status),
      statusClassName: wizardStatusClassName(status),
      connectionLabel,
      missingSteps,
      lastStatusText,
      supportsTestConnection: raw.supportsTestConnection !== false && raw.supports_test_connection !== false,
      supportsWizardSave: raw.supportsWizardSave === true || raw.supports_wizard_save === true,
      webhookUrl,
      steps: [],
      testId: `channel-wizard-card-${channel.toLowerCase()}`
    });
  }

  if (cards.length === 0) return null;
  const present = new Set(cards.map((c) => c.channel));
  for (const channel of WIZARD_CHANNELS) {
    if (!present.has(channel)) {
      cards.push(buildWizardCardPlaceholder(channel, baseUrl));
    }
  }
  return cards.sort(
    (a, b) => WIZARD_CHANNELS.indexOf(a.channel) - WIZARD_CHANNELS.indexOf(b.channel)
  );
}

export function resolveWizardCards(input: {
  baseUrl: string;
  channelSettingsRows?: ChannelSettingView[];
  acwApiBody?: unknown;
}): WizardChannelCard[] {
  const fromAcw = input.acwApiBody ? buildWizardCardsFromAcwApi(input.acwApiBody, input.baseUrl) : null;
  if (fromAcw) return fromAcw;
  return buildWizardCardsFromChannelSettings(input.channelSettingsRows ?? [], input.baseUrl);
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
  /provider_page_id/i
];

export function wizardCardViewIsSafe(card: WizardChannelCard): boolean {
  const serialized = JSON.stringify(card);
  return !WIZARD_VIEW_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(serialized));
}
