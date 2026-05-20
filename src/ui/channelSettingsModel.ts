export type SupportedChannel = "LINE" | "FACEBOOK" | "INSTAGRAM";

export const CHANNEL_SETTING_ORDER: SupportedChannel[] = ["LINE", "FACEBOOK", "INSTAGRAM"];

export const CHANNEL_SETTING_SECRET_KEYS: Record<SupportedChannel, readonly string[]> = {
  LINE: ["channel_secret", "channel_access_token"],
  FACEBOOK: ["page_access_token", "app_secret", "verify_token"],
  INSTAGRAM: ["access_token", "verify_token", "app_secret"]
};

export type SecretConfiguredMeta = {
  key: string;
  configured: boolean;
  fingerprint: string | null;
};

export type ChannelSettingSafeDto = {
  id: string;
  tenantId: string;
  channel: SupportedChannel;
  enabled: boolean;
  displayName: string | null;
  configJson: Record<string, unknown>;
  secretsConfigured: SecretConfiguredMeta[];
  createdAt: string;
  updatedAt: string;
};

export type ChannelDraft = {
  enabled: boolean;
  displayName: string;
  configJsonText: string;
};

export type ChannelPatchBody = {
  enabled?: boolean;
  displayName?: string | null;
  configJson?: Record<string, unknown>;
  secrets?: Record<string, string>;
  clearSecretKeys?: string[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readChannel(v: unknown): SupportedChannel | null {
  const c = typeof v === "string" ? v.toUpperCase() : "";
  if (c === "LINE" || c === "FACEBOOK" || c === "INSTAGRAM") return c;
  return null;
}

export function channelPathParam(channel: SupportedChannel): string {
  return channel.toLowerCase();
}

export function channelDisplayLabel(channel: SupportedChannel): string {
  if (channel === "LINE") return "LINE";
  if (channel === "FACEBOOK") return "Facebook";
  return "Instagram";
}

export function defaultSecretsMeta(channel: SupportedChannel): SecretConfiguredMeta[] {
  return CHANNEL_SETTING_SECRET_KEYS[channel].map((key) => ({
    key,
    configured: false,
    fingerprint: null
  }));
}

export function defaultChannelDto(channel: SupportedChannel): ChannelSettingSafeDto {
  return {
    id: "",
    tenantId: "",
    channel,
    enabled: false,
    displayName: null,
    configJson: {},
    secretsConfigured: defaultSecretsMeta(channel),
    createdAt: "",
    updatedAt: ""
  };
}

export function draftFromDto(dto: ChannelSettingSafeDto): ChannelDraft {
  return {
    enabled: dto.enabled,
    displayName: dto.displayName ?? "",
    configJsonText: stringifyConfigJson(dto.configJson)
  };
}

export function stringifyConfigJson(config: Record<string, unknown>): string {
  if (!config || Object.keys(config).length === 0) return "{}";
  return JSON.stringify(config, null, 2);
}

export function parseConfigJsonText(text: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: {} };
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isRecord(parsed)) {
      return { ok: false, error: "Config must be a JSON object." };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, error: "Config JSON is malformed." };
  }
}

function parseSecretMeta(raw: unknown): SecretConfiguredMeta | null {
  if (!isRecord(raw)) return null;
  const key = typeof raw.key === "string" ? raw.key.trim() : "";
  if (!key) return null;
  const configured = Boolean(raw.configured);
  const fingerprint =
    typeof raw.fingerprint === "string" && raw.fingerprint.trim() ? raw.fingerprint.trim() : null;
  return { key, configured, fingerprint };
}

function parseDto(raw: unknown): ChannelSettingSafeDto | null {
  if (!isRecord(raw)) return null;
  const channel = readChannel(raw.channel);
  if (!channel) return null;
  const configRaw = raw.configJson ?? raw.config_json;
  const configJson = isRecord(configRaw) ? configRaw : {};
  const secretsRaw = raw.secretsConfigured ?? raw.secrets_configured;
  const secretsConfigured = Array.isArray(secretsRaw)
    ? secretsRaw.map(parseSecretMeta).filter((m): m is SecretConfiguredMeta => m !== null)
    : defaultSecretsMeta(channel);
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    tenantId: typeof (raw.tenantId ?? raw.tenant_id) === "string" ? String(raw.tenantId ?? raw.tenant_id) : "",
    channel,
    enabled: Boolean(raw.enabled),
    displayName:
      typeof raw.displayName === "string"
        ? raw.displayName
        : typeof raw.display_name === "string"
          ? raw.display_name
          : raw.displayName === null || raw.display_name === null
            ? null
            : null,
    configJson,
    secretsConfigured: mergeSecretsWithDefaults(channel, secretsConfigured),
    createdAt: typeof (raw.createdAt ?? raw.created_at) === "string" ? String(raw.createdAt ?? raw.created_at) : "",
    updatedAt: typeof (raw.updatedAt ?? raw.updated_at) === "string" ? String(raw.updatedAt ?? raw.updated_at) : ""
  };
}

function mergeSecretsWithDefaults(
  channel: SupportedChannel,
  fromApi: SecretConfiguredMeta[]
): SecretConfiguredMeta[] {
  const byKey = new Map(fromApi.map((m) => [m.key, m]));
  return CHANNEL_SETTING_SECRET_KEYS[channel].map(
    (key) => byKey.get(key) ?? { key, configured: false, fingerprint: null }
  );
}

export function parseChannelSettingsListResponse(
  body: unknown
): { ok: true; data: ChannelSettingSafeDto[] } | { ok: false; error: string } {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    return { ok: false, error: "Invalid response: missing data array." };
  }
  const parsed: ChannelSettingSafeDto[] = [];
  for (const row of body.data) {
    const dto = parseDto(row);
    if (!dto) return { ok: false, error: "Invalid channel setting row in response." };
    parsed.push(dto);
  }
  return { ok: true, data: mergeListWithAllChannels(parsed) };
}

export function parseChannelSettingPatchResponse(
  body: unknown
): { ok: true; data: ChannelSettingSafeDto } | { ok: false; error: string } {
  if (!isRecord(body) || !body.data) {
    return { ok: false, error: "Invalid response: missing data object." };
  }
  const dto = parseDto(body.data);
  if (!dto) return { ok: false, error: "Invalid channel setting in response." };
  return { ok: true, data: dto };
}

export function mergeListWithAllChannels(rows: ChannelSettingSafeDto[]): ChannelSettingSafeDto[] {
  const byChannel = new Map(rows.map((r) => [r.channel, r]));
  return CHANNEL_SETTING_ORDER.map((ch) => byChannel.get(ch) ?? defaultChannelDto(ch));
}

function stableJson(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

export function buildChannelPatchBody(
  baseline: ChannelSettingSafeDto,
  draft: ChannelDraft,
  secretInputs: Record<string, string>,
  clearSecretKeys: string[]
): { ok: true; body: ChannelPatchBody } | { ok: false; error: string } | { ok: true; body: null } {
  const configParsed = parseConfigJsonText(draft.configJsonText);
  if (!configParsed.ok) return configParsed;

  const body: ChannelPatchBody = {};
  if (draft.enabled !== baseline.enabled) {
    body.enabled = draft.enabled;
  }
  const baselineName = baseline.displayName ?? "";
  if (draft.displayName !== baselineName) {
    body.displayName = draft.displayName.trim() ? draft.displayName.trim() : null;
  }
  if (stableJson(configParsed.value) !== stableJson(baseline.configJson)) {
    body.configJson = configParsed.value;
  }

  const secrets: Record<string, string> = {};
  for (const [key, value] of Object.entries(secretInputs)) {
    const trimmed = value.trim();
    if (trimmed) secrets[key] = trimmed;
  }
  if (Object.keys(secrets).length > 0) {
    body.secrets = secrets;
  }

  const clearKeys = Array.from(new Set(clearSecretKeys.filter((k) => k.trim()))).filter((k) =>
    CHANNEL_SETTING_SECRET_KEYS[baseline.channel].includes(k)
  );
  if (clearKeys.length > 0) {
    body.clearSecretKeys = clearKeys;
  }

  if (
    body.enabled === undefined &&
    body.displayName === undefined &&
    body.configJson === undefined &&
    !body.secrets &&
    !body.clearSecretKeys
  ) {
    return { ok: true, body: null };
  }

  return { ok: true, body };
}

export type TenantAuthContext = {
  baseUrl: string;
  accessToken: string;
  tenantId: string;
};

/** Auth headers for tenant-scoped API routes; required headers are applied last so callers cannot override them. */
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
  /** When true, only meTenantId is used (after /api/me). */
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

/** Redact any accidental secret-like substrings from error text before display. */
export function sanitizeUserFacingError(message: string): string {
  return message.replace(/secret_json|Bearer\s+\S+/gi, "[redacted]");
}
