export type SupportedChannel = "LINE" | "FACEBOOK" | "INSTAGRAM";

export const CHANNEL_SETTING_ORDER: SupportedChannel[] = ["LINE", "FACEBOOK", "INSTAGRAM"];

export type ChannelSettingStatus = "NOT_CONFIGURED" | "DISABLED" | "READY" | "ERROR";

export type SecretPresence = "EMPTY" | "SET";

export type SecretStateKey = "accessToken" | "channelSecret" | "verifyToken" | "appSecret";

export type ChannelSecretState = {
  accessToken: SecretPresence;
  channelSecret?: SecretPresence;
  verifyToken?: SecretPresence;
  appSecret?: SecretPresence;
};

export type ChannelSecretFieldDef = {
  stateKey: SecretStateKey;
  patchKey: string;
  label: string;
};

/** Maps UI/PATCH secret keys to frozen API secretState fields per channel. */
export const CHANNEL_SECRET_FIELDS: Record<SupportedChannel, readonly ChannelSecretFieldDef[]> = {
  LINE: [
    { stateKey: "channelSecret", patchKey: "channel_secret", label: "Channel secret" },
    { stateKey: "accessToken", patchKey: "channel_access_token", label: "Channel access token" }
  ],
  FACEBOOK: [
    { stateKey: "accessToken", patchKey: "page_access_token", label: "Page access token" },
    { stateKey: "appSecret", patchKey: "app_secret", label: "App secret" },
    { stateKey: "verifyToken", patchKey: "verify_token", label: "Verify token" }
  ],
  INSTAGRAM: [
    { stateKey: "accessToken", patchKey: "access_token", label: "Access token" },
    { stateKey: "verifyToken", patchKey: "verify_token", label: "Verify token" },
    { stateKey: "appSecret", patchKey: "app_secret", label: "App secret" }
  ]
};

export type ChannelSettingView = {
  channel: SupportedChannel;
  enabled: boolean;
  configured: boolean;
  status: ChannelSettingStatus;
  providerPageId: string | null;
  providerAccountName: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  updatedAt: string;
  secretState: ChannelSecretState;
};

export type ChannelDraft = {
  enabled: boolean;
};

export type ChannelPatchBody = {
  enabled?: boolean;
  secrets?: Record<string, string>;
  clearSecrets?: string[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readChannel(v: unknown): SupportedChannel | null {
  const c = typeof v === "string" ? v.toUpperCase() : "";
  if (c === "LINE" || c === "FACEBOOK" || c === "INSTAGRAM") return c;
  return null;
}

function readStatus(v: unknown): ChannelSettingStatus {
  const s = typeof v === "string" ? v.toUpperCase() : "";
  if (s === "DISABLED" || s === "READY" || s === "ERROR") return s;
  return "NOT_CONFIGURED";
}

function readPresence(v: unknown): SecretPresence {
  return v === "SET" ? "SET" : "EMPTY";
}

function readSecretState(raw: unknown, channel: SupportedChannel): ChannelSecretState {
  const state: ChannelSecretState = { accessToken: "EMPTY" };
  if (!isRecord(raw)) {
    return defaultSecretState(channel);
  }
  state.accessToken = readPresence(raw.accessToken ?? raw.access_token);
  if (raw.channelSecret !== undefined || raw.channel_secret !== undefined) {
    state.channelSecret = readPresence(raw.channelSecret ?? raw.channel_secret);
  }
  if (raw.verifyToken !== undefined || raw.verify_token !== undefined) {
    state.verifyToken = readPresence(raw.verifyToken ?? raw.verify_token);
  }
  if (raw.appSecret !== undefined || raw.app_secret !== undefined) {
    state.appSecret = readPresence(raw.appSecret ?? raw.app_secret);
  }
  return mergeSecretStateWithDefaults(channel, state);
}

function mergeSecretStateWithDefaults(channel: SupportedChannel, partial: ChannelSecretState): ChannelSecretState {
  const defaults = defaultSecretState(channel);
  const merged: ChannelSecretState = { accessToken: partial.accessToken ?? defaults.accessToken };
  for (const field of CHANNEL_SECRET_FIELDS[channel]) {
    if (field.stateKey === "accessToken") continue;
    const value = partial[field.stateKey];
    if (value !== undefined) {
      merged[field.stateKey] = value;
    } else if (defaults[field.stateKey] !== undefined) {
      merged[field.stateKey] = defaults[field.stateKey];
    }
  }
  return merged;
}

export function defaultSecretState(channel: SupportedChannel): ChannelSecretState {
  const state: ChannelSecretState = { accessToken: "EMPTY" };
  for (const field of CHANNEL_SECRET_FIELDS[channel]) {
    if (field.stateKey !== "accessToken") {
      state[field.stateKey] = "EMPTY";
    }
  }
  return state;
}

function legacySecretStateFromConfigured(
  channel: SupportedChannel,
  secretsConfigured: { key: string; configured: boolean }[]
): ChannelSecretState {
  const byKey = new Map(secretsConfigured.map((s) => [s.key, s.configured]));
  const state = defaultSecretState(channel);
  for (const field of CHANNEL_SECRET_FIELDS[channel]) {
    state[field.stateKey] = byKey.get(field.patchKey) ? "SET" : "EMPTY";
  }
  return state;
}

function deriveStatusFromLegacy(enabled: boolean, configured: boolean, statusRaw: unknown): ChannelSettingStatus {
  if (statusRaw && typeof statusRaw === "string") {
    return readStatus(statusRaw);
  }
  if (!enabled) return "DISABLED";
  if (configured) return "READY";
  return "NOT_CONFIGURED";
}

export function channelPathParam(channel: SupportedChannel): string {
  return channel.toLowerCase();
}

export function channelDisplayLabel(channel: SupportedChannel): string {
  if (channel === "LINE") return "LINE";
  if (channel === "FACEBOOK") return "Facebook";
  return "Instagram";
}

export function statusDisplayLabel(status: ChannelSettingStatus): string {
  if (status === "NOT_CONFIGURED") return "Not configured";
  if (status === "DISABLED") return "Disabled";
  if (status === "READY") return "Ready";
  return "Error";
}

export function statusCssClass(status: ChannelSettingStatus): string {
  return `channel-settings-status-badge channel-settings-status-${status}`;
}

export function secretPresenceLabel(presence: SecretPresence): string {
  return presence === "SET" ? "SET" : "EMPTY";
}

export function secretPresenceCssClass(presence: SecretPresence): string {
  return presence === "SET"
    ? "channel-settings-secret-state-badge channel-settings-secret-state-set"
    : "channel-settings-secret-state-badge channel-settings-secret-state-empty";
}

export function defaultChannelView(channel: SupportedChannel): ChannelSettingView {
  return {
    channel,
    enabled: false,
    configured: false,
    status: "NOT_CONFIGURED",
    providerPageId: null,
    providerAccountName: null,
    lastVerifiedAt: null,
    lastError: null,
    updatedAt: "",
    secretState: defaultSecretState(channel)
  };
}

export function draftFromView(view: ChannelSettingView): ChannelDraft {
  return { enabled: view.enabled };
}

export function secretStateForField(view: ChannelSettingView, stateKey: SecretStateKey): SecretPresence {
  return view.secretState[stateKey] ?? "EMPTY";
}

function parseView(raw: unknown): ChannelSettingView | null {
  if (!isRecord(raw)) return null;
  const channel = readChannel(raw.channel);
  if (!channel) return null;

  const secretsConfiguredRaw = raw.secretsConfigured ?? raw.secrets_configured;
  const legacySecrets: { key: string; configured: boolean }[] = [];
  if (Array.isArray(secretsConfiguredRaw)) {
    for (const row of secretsConfiguredRaw) {
      if (!isRecord(row)) continue;
      const key = typeof row.key === "string" ? row.key.trim() : "";
      if (!key) continue;
      legacySecrets.push({ key, configured: Boolean(row.configured) });
    }
  }

  const secretStateRaw = raw.secretState ?? raw.secret_state;
  const secretState = isRecord(secretStateRaw)
    ? readSecretState(secretStateRaw, channel)
    : legacySecrets.length > 0
      ? legacySecretStateFromConfigured(channel, legacySecrets)
      : defaultSecretState(channel);

  const configured = Boolean(raw.configured ?? legacySecrets.some((s) => s.configured));
  const enabled = Boolean(raw.enabled);

  return {
    channel,
    enabled,
    configured,
    status: deriveStatusFromLegacy(enabled, configured, raw.status),
    providerPageId:
      typeof (raw.providerPageId ?? raw.provider_page_id) === "string"
        ? String(raw.providerPageId ?? raw.provider_page_id).trim() || null
        : null,
    providerAccountName:
      typeof (raw.providerAccountName ?? raw.provider_account_name) === "string"
        ? String(raw.providerAccountName ?? raw.provider_account_name).trim() || null
        : null,
    lastVerifiedAt:
      typeof (raw.lastVerifiedAt ?? raw.last_verified_at) === "string"
        ? String(raw.lastVerifiedAt ?? raw.last_verified_at)
        : null,
    lastError:
      typeof (raw.lastError ?? raw.last_error) === "string"
        ? String(raw.lastError ?? raw.last_error).trim() || null
        : null,
    updatedAt: typeof (raw.updatedAt ?? raw.updated_at) === "string" ? String(raw.updatedAt ?? raw.updated_at) : "",
    secretState
  };
}

export function parseChannelSettingsListResponse(
  body: unknown
): { ok: true; data: ChannelSettingView[] } | { ok: false; error: string } {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    return { ok: false, error: "Invalid response: missing data array." };
  }
  const parsed: ChannelSettingView[] = [];
  for (const row of body.data) {
    const view = parseView(row);
    if (!view) return { ok: false, error: "Invalid channel setting row in response." };
    parsed.push(view);
  }
  return { ok: true, data: mergeListWithAllChannels(parsed) };
}

export function parseChannelSettingPatchResponse(
  body: unknown
): { ok: true; data: ChannelSettingView } | { ok: false; error: string } {
  if (!isRecord(body) || !body.data) {
    return { ok: false, error: "Invalid response: missing data object." };
  }
  const view = parseView(body.data);
  if (!view) return { ok: false, error: "Invalid channel setting in response." };
  return { ok: true, data: view };
}

export function mergeListWithAllChannels(rows: ChannelSettingView[]): ChannelSettingView[] {
  const byChannel = new Map(rows.map((r) => [r.channel, r]));
  return CHANNEL_SETTING_ORDER.map((ch) => byChannel.get(ch) ?? defaultChannelView(ch));
}

export function buildChannelPatchBody(
  baseline: ChannelSettingView,
  draft: ChannelDraft,
  secretInputs: Record<string, string>,
  clearSecrets: string[]
): { ok: true; body: ChannelPatchBody } | { ok: false; error: string } | { ok: true; body: null } {
  const body: ChannelPatchBody = {};
  if (draft.enabled !== baseline.enabled) {
    body.enabled = draft.enabled;
  }

  const allowedPatchKeys = new Set(CHANNEL_SECRET_FIELDS[baseline.channel].map((f) => f.patchKey));
  const secrets: Record<string, string> = {};
  for (const [key, value] of Object.entries(secretInputs)) {
    if (!allowedPatchKeys.has(key)) continue;
    const trimmed = value.trim();
    if (trimmed) secrets[key] = trimmed;
  }
  if (Object.keys(secrets).length > 0) {
    body.secrets = secrets;
  }

  const clearKeys = Array.from(new Set(clearSecrets.filter((k) => k.trim()))).filter((k) =>
    allowedPatchKeys.has(k)
  );
  if (clearKeys.length > 0) {
    body.clearSecrets = clearKeys;
  }

  if (body.enabled === undefined && !body.secrets && !body.clearSecrets) {
    return { ok: true, body: null };
  }

  return { ok: true, body };
}

export type TenantAuthContext = {
  baseUrl: string;
  accessToken: string;
  tenantId: string;
};

export function buildTenantAuthHeaders(
  ctx: TenantAuthContext,
  extraHeaders?: Record<string, string>
): Record<string, string> {
  return {
    ...(extraHeaders ?? {}),
    Authorization: `Bearer ${ctx.accessToken}`,
    "x-tenant-id": ctx.tenantId
  };
}

export function resolveMeTenantAuthContext(input: {
  baseUrl: string;
  accessToken: string;
  sessionTenantId: string;
  meTenantId?: string | null;
  requireMeTenant?: boolean;
}): TenantAuthContext | null {
  const baseUrl = input.baseUrl.trim();
  const accessToken = input.accessToken.trim();
  const meTenant = input.meTenantId?.trim() ?? "";
  const sessionTenant = input.sessionTenantId.trim();
  const tenantId = input.requireMeTenant ? meTenant : meTenant || sessionTenant;
  if (!baseUrl || !accessToken || !tenantId) return null;
  return { baseUrl, accessToken, tenantId };
}

export function mapChannelSettingsFetchError(status: number, body: unknown): string {
  if (status === 401) return "Sign in required. Your session may have expired.";
  if (status === 403) return "Channel Settings is available to Admins only.";
  if (isRecord(body) && typeof body.error === "string" && body.error.trim()) {
    return body.error.trim();
  }
  if (status >= 500) return "Server error while loading channel settings. Try again shortly.";
  return `Could not complete request (HTTP ${status}).`;
}

export function sanitizeUserFacingError(message: string): string {
  return message.replace(/secret_json|Bearer\s+\S+/gi, "[redacted]");
}

export function formatTimestamp(iso: string | null): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
