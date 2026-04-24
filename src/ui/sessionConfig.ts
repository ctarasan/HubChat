export interface SessionConfig {
  baseUrl: string;
  tenantId: string;
  accessToken: string;
}

export const SESSION_STORAGE_KEY = "hubchat.session.config.v1";

export function defaultBaseUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_BASE_URL ?? "http://localhost:3000";
}

export function emptySessionConfig(): SessionConfig {
  return {
    baseUrl: defaultBaseUrl(),
    tenantId: "",
    accessToken: ""
  };
}

export function normalizeSessionConfig(input: Partial<SessionConfig>): SessionConfig {
  const fallback = emptySessionConfig();
  return {
    baseUrl: typeof input.baseUrl === "string" && input.baseUrl.trim() ? input.baseUrl.trim() : fallback.baseUrl,
    tenantId: typeof input.tenantId === "string" ? input.tenantId.trim() : "",
    accessToken: typeof input.accessToken === "string" ? input.accessToken.trim() : ""
  };
}

export function hasRequiredSessionConfig(input: Partial<SessionConfig>): boolean {
  const normalized = normalizeSessionConfig(input);
  return Boolean(normalized.baseUrl && normalized.tenantId && normalized.accessToken);
}

export function loadSessionConfig(storage: Pick<Storage, "getItem"> | null | undefined): SessionConfig {
  if (!storage) return emptySessionConfig();
  try {
    const raw = storage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return emptySessionConfig();
    return normalizeSessionConfig(JSON.parse(raw) as Partial<SessionConfig>);
  } catch {
    return emptySessionConfig();
  }
}

export function saveSessionConfig(storage: Pick<Storage, "setItem"> | null | undefined, config: SessionConfig): void {
  if (!storage) return;
  const normalized = normalizeSessionConfig(config);
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(normalized));
}
