/**
 * FB-OAUTH-1D — Facebook OAuth Channel Settings UI model.
 * Token-free DTOs aligned with Agent A contract §6–§8.
 */

export const FACEBOOK_CONNECT_API = {
  status: "/api/channel-connect/facebook/status",
  oauthStart: "/api/channel-connect/facebook/oauth/start",
  oauthSession: "/api/channel-connect/facebook/oauth/session",
  pages: "/api/channel-connect/facebook/pages",
  complete: "/api/channel-connect/facebook/complete",
  reconnect: "/api/channel-connect/facebook/reconnect",
  health: "/api/channel-connect/facebook/health"
} as const;

export const READINESS_CHECK_CODES = [
  "CREDENTIAL_RESOLUTION",
  "PAGE_ACCESS",
  "REQUIRED_TASKS",
  "GRAPH_API",
  "RUNTIME_TEST_CONNECTION"
] as const;

export type ReadinessCheckCode = (typeof READINESS_CHECK_CODES)[number];

export type FacebookConnectDisplayState =
  | "NOT_CONNECTED"
  | "MANUAL_CONFIGURED"
  | "CONNECTING"
  | "AWAITING_PAGE_SELECTION"
  | "CONNECTED"
  | "DEGRADED"
  | "NEEDS_RECONNECT"
  | "ERROR";

export type OAuthTransactionStage =
  | "PENDING"
  | "CALLBACK_RECEIVED"
  | "PAGES_READY"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED";

export type HealthStatus = "UNKNOWN" | "OK" | "DEGRADED" | "ERROR" | "RECONNECT_REQUIRED";

export type HealthCheckStatus = "PASS" | "WARN" | "FAIL";

export type OAuthErrorCategory =
  | "ACCESS_DENIED"
  | "INVALID_OR_EXPIRED_STATE"
  | "SESSION_EXPIRED"
  | "NO_PAGES"
  | "MISSING_PAGE_TASKS"
  | "TOKEN_EXCHANGE_FAILED"
  | "PROVIDER_TEMPORARY"
  | "RECONNECT_REQUIRED"
  | "UNKNOWN";

export type HealthCheck = {
  code: ReadinessCheckCode | string;
  status: HealthCheckStatus;
  message: string;
};

export type FacebookPageOption = {
  pageId: string;
  name: string;
  tasks: string[];
  selectable: boolean;
  reasonCode: "MISSING_PAGE_TASKS" | null;
  alreadyConnected: boolean;
};

export type FacebookConnectStatus = {
  connectionId: string | null;
  connectionStatus: string | null;
  displayState: FacebookConnectDisplayState;
  oauthStage: OAuthTransactionStage | null;
  healthStatus: HealthStatus;
  reconnectRequired: boolean;
  providerPageId: string | null;
  providerPageName: string | null;
  manualConfigured: boolean;
  oauthAvailable: boolean;
  lastCheckedAt: string | null;
  lastVerifiedAt: string | null;
  errorCategory: OAuthErrorCategory | null;
  message: string | null;
  credentialState: { pageAccessToken: "EMPTY" | "SET" | "EXPIRED" | "REVOKED" };
};

export type FacebookOAuthSession = {
  oauthStage: OAuthTransactionStage;
  displayState: FacebookConnectDisplayState;
  errorCategory: OAuthErrorCategory | null;
  message: string | null;
  expiresAt: string;
  pagesReady: boolean;
};

export type FacebookConnectCompleteResult = {
  connectionId: string;
  connectionStatus: "AUTHORIZING";
  oauthStage: "COMPLETED";
  healthStatus: "UNKNOWN";
  displayState: "CONNECTING";
  reconnectRequired: false;
  providerPageId: string;
  providerPageName: string;
  message: string;
};

export type FacebookConnectHealthResult = {
  healthStatus: HealthStatus;
  reconnectRequired: boolean;
  connectionStatus: string;
  displayState: FacebookConnectDisplayState;
  lastCheckedAt: string;
  errorCategory: OAuthErrorCategory | null;
  message: string | null;
  checks: HealthCheck[];
};

const OAUTH_ERROR_CATEGORIES: readonly OAuthErrorCategory[] = [
  "ACCESS_DENIED",
  "INVALID_OR_EXPIRED_STATE",
  "SESSION_EXPIRED",
  "NO_PAGES",
  "MISSING_PAGE_TASKS",
  "TOKEN_EXCHANGE_FAILED",
  "PROVIDER_TEMPORARY",
  "RECONNECT_REQUIRED",
  "UNKNOWN"
];

const DISPLAY_STATES: readonly FacebookConnectDisplayState[] = [
  "NOT_CONNECTED",
  "MANUAL_CONFIGURED",
  "CONNECTING",
  "AWAITING_PAGE_SELECTION",
  "CONNECTED",
  "DEGRADED",
  "NEEDS_RECONNECT",
  "ERROR"
];

const FORBIDDEN_LEAK_PATTERNS = [
  /EAA[A-Za-z0-9]+/,
  /access_token/i,
  /authorization_code/i,
  /Bearer\s+\S+/i,
  /secret_json/i,
  /credential[_-]?id/i,
  /HUBCHAT_/i,
  /META_APP/i
];

export const FACEBOOK_OAUTH_UNAVAILABLE_COPY =
  "Facebook assisted connection is not available in this environment.";

export const FACEBOOK_STATUS_LOAD_RETRY_COPY =
  "Could not load Facebook assisted connection status. Reload the page and try again.";

export const FACEBOOK_HEALTH_DEFERRED_COPY =
  "Facebook runtime validation is not available yet. The connection remains pending validation.";

export const FACEBOOK_RECONNECT_DEFERRED_COPY =
  "Facebook reconnect is not available yet. The connection remains pending.";

export type FacebookConnectApiErrorKind =
  | "deferred_capability"
  | "auth_failure"
  | "unexpected_failure";

export function classifyFacebookConnectHttpStatus(
  status: number
): "success" | FacebookConnectApiErrorKind {
  if (status >= 200 && status < 300) return "success";
  if (status === 501) return "deferred_capability";
  if (status === 401 || status === 403) return "auth_failure";
  return "unexpected_failure";
}

export function parseFacebookReconnectDeferredMessage(body: unknown): string {
  const message = (body as { data?: { message?: string } })?.data?.message;
  return sanitizeFacebookConnectMessage(message) ?? FACEBOOK_RECONNECT_DEFERRED_COPY;
}

export function deferredHealthPresentationPatch(
  current: FacebookConnectStatus,
  manualConfigured: boolean
): FacebookConnectStatus {
  return {
    ...current,
    manualConfigured: current.manualConfigured || manualConfigured,
    displayState: "CONNECTING",
    healthStatus: "UNKNOWN",
    connectionStatus: current.connectionStatus ?? "AUTHORIZING",
    oauthStage: current.oauthStage ?? "COMPLETED",
    reconnectRequired: false
  };
}

export const FACEBOOK_OAUTH_ERROR_MESSAGES: Record<OAuthErrorCategory, string> = {
  ACCESS_DENIED: "Meta sign-in was cancelled or denied.",
  INVALID_OR_EXPIRED_STATE: "Connection request was invalid or expired. Start again.",
  SESSION_EXPIRED: "Authorization session expired. Start again.",
  NO_PAGES: "No manageable Pages found for this account.",
  MISSING_PAGE_TASKS: "Selected Page is missing required permissions.",
  TOKEN_EXCHANGE_FAILED: "Could not complete connection. Try again or use manual setup.",
  PROVIDER_TEMPORARY: "Provider temporarily unavailable. Wait and try again.",
  RECONNECT_REQUIRED: "Authorization expired or revoked. Reconnect required.",
  UNKNOWN: "Something went wrong. Try again or use manual setup."
};

export function isOAuthErrorCategory(value: string): value is OAuthErrorCategory {
  return (OAUTH_ERROR_CATEGORIES as readonly string[]).includes(value);
}

export function isDisplayState(value: string): value is FacebookConnectDisplayState {
  return (DISPLAY_STATES as readonly string[]).includes(value);
}

export function mapFacebookOAuthErrorCategory(
  category: string | null | undefined
): { category: OAuthErrorCategory; message: string } {
  if (category && isOAuthErrorCategory(category)) {
    return { category, message: FACEBOOK_OAUTH_ERROR_MESSAGES[category] };
  }
  return { category: "UNKNOWN", message: FACEBOOK_OAUTH_ERROR_MESSAGES.UNKNOWN };
}

export function sanitizeFacebookConnectMessage(message: string | null | undefined): string | null {
  if (!message?.trim()) return null;
  const trimmed = message.trim();
  for (const pattern of FORBIDDEN_LEAK_PATTERNS) {
    if (pattern.test(trimmed)) return null;
  }
  return trimmed;
}

export function facebookConnectStatusLabel(state: FacebookConnectDisplayState): string {
  switch (state) {
    case "NOT_CONNECTED":
      return "Not connected";
    case "MANUAL_CONFIGURED":
      return "Manual setup";
    case "CONNECTING":
      return "Connecting…";
    case "AWAITING_PAGE_SELECTION":
      return "Select a Page";
    case "CONNECTED":
      return "Connected";
    case "DEGRADED":
      return "Needs attention";
    case "NEEDS_RECONNECT":
      return "Reconnect required";
    case "ERROR":
      return "Connection error";
    default:
      return "Not connected";
  }
}

export function facebookConnectStatusCssClass(state: FacebookConnectDisplayState): string {
  return `channel-settings-facebook-connect-status-${state.toLowerCase().replace(/_/g, "-")}`;
}

export function humanizePageTasks(tasks: string[]): string {
  if (tasks.length === 0) return "No tasks reported";
  return tasks.join(", ");
}

export type FacebookOAuthQueryParams = {
  channel: string | null;
  oauth: string | null;
  errorCategory: string | null;
};

export function readFacebookOAuthQueryParams(
  search: string,
  channelParam: string | null,
  oauthParam: string | null,
  errorCategoryParam: string | null
): FacebookOAuthQueryParams {
  return {
    channel: channelParam,
    oauth: oauthParam,
    errorCategory: errorCategoryParam
  };
}

export function stripFacebookOAuthQueryParams(url: URL): string {
  const next = new URL(url.href);
  next.searchParams.delete("channel");
  next.searchParams.delete("oauth");
  next.searchParams.delete("errorCategory");
  const search = next.searchParams.toString();
  return `${next.pathname}${search ? `?${search}` : ""}${next.hash}`;
}

export function allReadinessChecksPass(checks: HealthCheck[]): boolean {
  if (checks.length === 0) return false;
  for (const code of READINESS_CHECK_CODES) {
    const match = checks.find((c) => c.code === code);
    if (!match || match.status !== "PASS") return false;
  }
  return true;
}

export type DeriveFacebookConnectInput = {
  serverDisplayState?: FacebookConnectDisplayState | null;
  connectionStatus?: string | null;
  oauthStage?: OAuthTransactionStage | null;
  healthStatus?: HealthStatus | null;
  reconnectRequired?: boolean;
  manualConfigured?: boolean;
  errorCategory?: OAuthErrorCategory | null;
  localBusy?: boolean;
};

export function deriveFacebookConnectPresentationState(
  input: DeriveFacebookConnectInput
): FacebookConnectDisplayState {
  if (input.serverDisplayState && isDisplayState(input.serverDisplayState)) {
    return input.serverDisplayState;
  }
  if (input.localBusy) return "CONNECTING";
  if (input.reconnectRequired || input.healthStatus === "RECONNECT_REQUIRED") {
    return "NEEDS_RECONNECT";
  }
  if (input.oauthStage === "FAILED" || input.oauthStage === "EXPIRED") {
    return "ERROR";
  }
  if (input.oauthStage === "CALLBACK_RECEIVED" || input.oauthStage === "PAGES_READY") {
    return "AWAITING_PAGE_SELECTION";
  }
  if (input.oauthStage === "COMPLETED" && input.connectionStatus === "AUTHORIZING") {
    return "CONNECTING";
  }
  if (input.connectionStatus === "READY" && input.healthStatus === "OK") {
    return "CONNECTED";
  }
  if (input.connectionStatus === "READY" && input.healthStatus === "DEGRADED") {
    return "DEGRADED";
  }
  if (input.connectionStatus === "ERROR" || input.healthStatus === "ERROR") {
    return "ERROR";
  }
  if (input.manualConfigured) return "MANUAL_CONFIGURED";
  return "NOT_CONNECTED";
}

function parseDisplayState(value: unknown): FacebookConnectDisplayState | null {
  return typeof value === "string" && isDisplayState(value) ? value : null;
}

function parseHealthStatus(value: unknown): HealthStatus {
  if (
    value === "UNKNOWN" ||
    value === "OK" ||
    value === "DEGRADED" ||
    value === "ERROR" ||
    value === "RECONNECT_REQUIRED"
  ) {
    return value;
  }
  return "UNKNOWN";
}

function parseOAuthStage(value: unknown): OAuthTransactionStage | null {
  if (
    value === "PENDING" ||
    value === "CALLBACK_RECEIVED" ||
    value === "PAGES_READY" ||
    value === "COMPLETED" ||
    value === "FAILED" ||
    value === "EXPIRED"
  ) {
    return value;
  }
  return null;
}

function parseErrorCategory(value: unknown): OAuthErrorCategory | null {
  return typeof value === "string" && isOAuthErrorCategory(value) ? value : null;
}

function parseHealthChecks(value: unknown): HealthCheck[] {
  if (!Array.isArray(value)) return [];
  const checks: HealthCheck[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const code = typeof row.code === "string" ? row.code : "";
    const status = row.status;
    const message = sanitizeFacebookConnectMessage(
      typeof row.message === "string" ? row.message : null
    );
    if (
      !code ||
      (status !== "PASS" && status !== "WARN" && status !== "FAIL") ||
      !message
    ) {
      continue;
    }
    checks.push({ code, status, message });
  }
  return checks;
}

export function parseFacebookConnectStatusResponse(
  body: unknown
): { ok: true; data: FacebookConnectStatus } | { ok: false; error: string } {
  const data = (body as { data?: Record<string, unknown> })?.data;
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Invalid Facebook connect status response." };
  }
  const displayState = parseDisplayState(data.displayState) ?? "NOT_CONNECTED";
  return {
    ok: true,
    data: {
      connectionId: typeof data.connectionId === "string" ? data.connectionId : null,
      connectionStatus: typeof data.connectionStatus === "string" ? data.connectionStatus : null,
      displayState,
      oauthStage: parseOAuthStage(data.oauthStage),
      healthStatus: parseHealthStatus(data.healthStatus),
      reconnectRequired: data.reconnectRequired === true,
      providerPageId: typeof data.providerPageId === "string" ? data.providerPageId : null,
      providerPageName: typeof data.providerPageName === "string" ? data.providerPageName : null,
      manualConfigured: data.manualConfigured === true,
      oauthAvailable: data.oauthAvailable === true,
      lastCheckedAt: typeof data.lastCheckedAt === "string" ? data.lastCheckedAt : null,
      lastVerifiedAt: typeof data.lastVerifiedAt === "string" ? data.lastVerifiedAt : null,
      errorCategory: parseErrorCategory(data.errorCategory),
      message: sanitizeFacebookConnectMessage(
        typeof data.message === "string" ? data.message : null
      ),
      credentialState: {
        pageAccessToken:
          data.credentialState &&
          typeof data.credentialState === "object" &&
          (data.credentialState as { pageAccessToken?: string }).pageAccessToken === "SET"
            ? "SET"
            : (data.credentialState as { pageAccessToken?: string })?.pageAccessToken === "EXPIRED"
              ? "EXPIRED"
              : (data.credentialState as { pageAccessToken?: string })?.pageAccessToken === "REVOKED"
                ? "REVOKED"
                : "EMPTY"
      }
    }
  };
}

export function parseFacebookOAuthSessionResponse(
  body: unknown
): { ok: true; data: FacebookOAuthSession } | { ok: false; error: string } {
  const data = (body as { data?: Record<string, unknown> })?.data;
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Invalid OAuth session response." };
  }
  const oauthStage = parseOAuthStage(data.oauthStage ?? data.status);
  if (!oauthStage) {
    return { ok: false, error: "Invalid OAuth session stage." };
  }
  const displayState =
    parseDisplayState(data.displayState) ??
    (oauthStage === "CALLBACK_RECEIVED" || oauthStage === "PAGES_READY"
      ? "AWAITING_PAGE_SELECTION"
      : "CONNECTING");
  return {
    ok: true,
    data: {
      oauthStage,
      displayState,
      errorCategory: parseErrorCategory(data.errorCategory),
      message: sanitizeFacebookConnectMessage(typeof data.message === "string" ? data.message : null),
      expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : "",
      pagesReady: data.pagesReady === true
    }
  };
}

export function parseFacebookPagesResponse(
  body: unknown
): { ok: true; data: FacebookPageOption[] } | { ok: false; error: string } {
  const pages = (body as { data?: { pages?: unknown } })?.data?.pages;
  if (!Array.isArray(pages)) {
    return { ok: false, error: "Invalid Facebook pages response." };
  }
  const result: FacebookPageOption[] = [];
  for (const item of pages) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.pageId !== "string" || typeof row.name !== "string") continue;
    result.push({
      pageId: row.pageId,
      name: row.name,
      tasks: Array.isArray(row.tasks) ? row.tasks.filter((t): t is string => typeof t === "string") : [],
      selectable: row.selectable !== false,
      reasonCode: row.reasonCode === "MISSING_PAGE_TASKS" ? "MISSING_PAGE_TASKS" : null,
      alreadyConnected: row.alreadyConnected === true
    });
  }
  return { ok: true, data: result };
}

export function parseFacebookCompleteResponse(
  body: unknown
): { ok: true; data: FacebookConnectCompleteResult } | { ok: false; error: string } {
  const data = (body as { data?: Record<string, unknown> })?.data;
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Invalid complete response." };
  }
  if (data.displayState === "CONNECTED" || data.connectionStatus === "READY") {
    return { ok: false, error: "Unexpected premature CONNECTED/READY from complete." };
  }
  return {
    ok: true,
    data: {
      connectionId: typeof data.connectionId === "string" ? data.connectionId : "",
      connectionStatus: "AUTHORIZING",
      oauthStage: "COMPLETED",
      healthStatus: "UNKNOWN",
      displayState: "CONNECTING",
      reconnectRequired: false,
      providerPageId: typeof data.providerPageId === "string" ? data.providerPageId : "",
      providerPageName: typeof data.providerPageName === "string" ? data.providerPageName : "",
      message: sanitizeFacebookConnectMessage(typeof data.message === "string" ? data.message : null) ?? ""
    }
  };
}

export function parseFacebookHealthResponse(
  body: unknown
): { ok: true; data: FacebookConnectHealthResult } | { ok: false; error: string } {
  const data = (body as { data?: Record<string, unknown> })?.data;
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Invalid health response." };
  }
  const checks = parseHealthChecks(data.checks);
  const healthStatus = parseHealthStatus(data.healthStatus);
  const displayState = parseDisplayState(data.displayState) ?? "CONNECTING";
  const result: FacebookConnectHealthResult = {
    healthStatus,
    reconnectRequired: data.reconnectRequired === true,
    connectionStatus: typeof data.connectionStatus === "string" ? data.connectionStatus : "AUTHORIZING",
    displayState,
    lastCheckedAt: typeof data.lastCheckedAt === "string" ? data.lastCheckedAt : "",
    errorCategory: parseErrorCategory(data.errorCategory),
    message: sanitizeFacebookConnectMessage(typeof data.message === "string" ? data.message : null),
    checks
  };
  if (
    result.displayState === "CONNECTED" &&
    (!allReadinessChecksPass(checks) || result.healthStatus !== "OK")
  ) {
    return { ok: false, error: "Unexpected premature CONNECTED from health response." };
  }
  return { ok: true, data: result };
}

export type FacebookConnectFetchSession = {
  baseUrl: string;
  accessToken: string;
};

export async function facebookConnectFetch(
  session: FacebookConnectFetchSession,
  tenantId: string,
  path: string,
  init?: RequestInit
): Promise<{ res: Response; body: unknown }> {
  const res = await fetch(`${session.baseUrl}${path}`, {
    ...init,
    credentials: init?.credentials ?? "include",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "x-tenant-id": tenantId,
      ...(init?.headers ?? {})
    }
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { res, body };
}

export function buildFacebookCompleteBody(pageId: string): { pageId: string } {
  return { pageId };
}
