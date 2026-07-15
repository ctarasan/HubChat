import { sanitizeProviderErrorMessage } from "../../../lib/sanitizeProviderError.js";
import type { OAuthErrorCategory } from "../../../domain/oauthTransactions.js";

export type FacebookGraphOAuthClientConfig = {
  appId: string;
  appSecret: string;
  graphVersion: string;
  callbackUrl: string;
  fetchImpl?: typeof fetch;
};

export type FacebookGraphTokenResponse = {
  accessToken: string;
  expiresIn: number | null;
};

export type FacebookGraphPageAccount = {
  pageId: string;
  name: string;
  tasks: string[];
  accessToken: string;
};

export class FacebookGraphOAuthError extends Error {
  override readonly name = "FacebookGraphOAuthError";
  constructor(
    message: string,
    readonly category: OAuthErrorCategory,
    readonly statusCode?: number
  ) {
    super(message);
  }
}

function graphBase(version: string): string {
  return `https://graph.facebook.com/${version}`;
}

function facebookDialogBase(version: string): string {
  return `https://www.facebook.com/${version}`;
}

export function buildFacebookOAuthAuthorizeUrl(input: {
  config: FacebookGraphOAuthClientConfig;
  state: string;
  scopes: string[];
}): string {
  const url = new URL(`${facebookDialogBase(input.config.graphVersion)}/dialog/oauth`);
  url.searchParams.set("client_id", input.config.appId);
  url.searchParams.set("redirect_uri", input.config.callbackUrl);
  url.searchParams.set("state", input.state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.scopes.join(","));
  return url.toString();
}

async function parseGraphJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    const error = body.error as { message?: string; code?: number; type?: string } | undefined;
    const message = sanitizeProviderErrorMessage(error?.message ?? `Graph request failed (${response.status})`);
    const category = mapGraphFailureToCategory(response.status, error?.code);
    throw new FacebookGraphOAuthError(message, category, response.status);
  }
  return body;
}

function mapGraphFailureToCategory(status: number, code?: number): OAuthErrorCategory {
  if (code === 190 || code === 102) return "RECONNECT_REQUIRED";
  if (status >= 500) return "PROVIDER_TEMPORARY";
  return "TOKEN_EXCHANGE_FAILED";
}

export function mapFacebookOAuthCallbackQueryError(input: {
  error?: string | null;
  error_reason?: string | null;
}): OAuthErrorCategory {
  const reason = `${input.error ?? ""} ${input.error_reason ?? ""}`.toLowerCase();
  if (reason.includes("access_denied") || reason.includes("denied")) {
    return "ACCESS_DENIED";
  }
  return "UNKNOWN";
}

export async function exchangeFacebookOAuthCode(
  config: FacebookGraphOAuthClientConfig,
  code: string
): Promise<FacebookGraphTokenResponse> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const url = new URL(`${graphBase(config.graphVersion)}/oauth/access_token`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("redirect_uri", config.callbackUrl);
  url.searchParams.set("code", code);

  const response = await fetchImpl(url.toString(), { method: "GET" });
  const body = await parseGraphJson(response);
  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  if (!accessToken) {
    throw new FacebookGraphOAuthError(
      "Token exchange did not return an access token.",
      "TOKEN_EXCHANGE_FAILED"
    );
  }
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : null;
  return { accessToken, expiresIn };
}

export async function exchangeFacebookLongLivedUserToken(
  config: FacebookGraphOAuthClientConfig,
  shortLivedToken: string
): Promise<FacebookGraphTokenResponse> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const url = new URL(`${graphBase(config.graphVersion)}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("fb_exchange_token", shortLivedToken);

  const response = await fetchImpl(url.toString(), { method: "GET" });
  const body = await parseGraphJson(response);
  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  if (!accessToken) {
    throw new FacebookGraphOAuthError(
      "Long-lived token exchange did not return an access token.",
      "TOKEN_EXCHANGE_FAILED"
    );
  }
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : null;
  return { accessToken, expiresIn };
}

export async function exchangeFacebookLongLivedPageToken(
  config: FacebookGraphOAuthClientConfig,
  pageAccessToken: string
): Promise<FacebookGraphTokenResponse> {
  return exchangeFacebookLongLivedUserToken(config, pageAccessToken);
}

export async function listFacebookManagedPages(
  config: FacebookGraphOAuthClientConfig,
  userAccessToken: string
): Promise<FacebookGraphPageAccount[]> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const url = new URL(`${graphBase(config.graphVersion)}/me/accounts`);
  url.searchParams.set("fields", "id,name,tasks,access_token");
  url.searchParams.set("access_token", userAccessToken);

  const response = await fetchImpl(url.toString(), { method: "GET" });
  const body = await parseGraphJson(response);
  const data = Array.isArray(body.data) ? body.data : [];
  return data
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      const pageId = typeof row.id === "string" ? row.id : "";
      const name = typeof row.name === "string" ? row.name : "";
      const accessToken = typeof row.access_token === "string" ? row.access_token : "";
      const tasks = Array.isArray(row.tasks)
        ? row.tasks.filter((task): task is string => typeof task === "string")
        : [];
      if (!pageId || !name || !accessToken) return null;
      return { pageId, name, tasks, accessToken };
    })
    .filter((row): row is FacebookGraphPageAccount => row !== null);
}

/** Messenger fields required for HubChat inbound + echo sync (App Review Core). */
export const FACEBOOK_PAGE_SUBSCRIBED_FIELDS = [
  "messages",
  "messaging_postbacks",
  "message_deliveries",
  "message_reads",
  "message_echoes"
] as const;

/**
 * Page webhook fields required for Facebook Comment inbound (`entry.changes` with field=feed).
 * `feed` is required for Meta to deliver Page comment webhooks; broader comment Graph APIs may
 * need separately approved permissions (e.g. pages_read_engagement) — not part of this Core set.
 */
export const FACEBOOK_COMMENT_SUBSCRIBED_FIELDS = ["feed"] as const;

/** Combined Page subscribed_apps fields HubChat requires for Messenger + Comment inbound. */
export const FACEBOOK_PAGE_REQUIRED_SUBSCRIBED_FIELDS = [
  ...FACEBOOK_PAGE_SUBSCRIBED_FIELDS,
  ...FACEBOOK_COMMENT_SUBSCRIBED_FIELDS
] as const;

/**
 * Subscribe a Facebook Page to this Meta app's webhook (pages_manage_metadata).
 * Idempotent: Meta returns success if already subscribed with overlapping fields.
 */
export async function subscribeFacebookPageToApp(input: {
  graphVersion: string;
  pageId: string;
  pageAccessToken: string;
  subscribedFields?: readonly string[];
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; subscribedFields: string[] }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const fields = [...(input.subscribedFields ?? FACEBOOK_PAGE_REQUIRED_SUBSCRIBED_FIELDS)];
  const url = new URL(
    `${graphBase(input.graphVersion)}/${encodeURIComponent(input.pageId)}/subscribed_apps`
  );
  url.searchParams.set("subscribed_fields", fields.join(","));
  url.searchParams.set("access_token", input.pageAccessToken);

  const response = await fetchImpl(url.toString(), { method: "POST" });
  const body = await parseGraphJson(response);
  if (body.success !== true && body.success !== "true") {
    throw new FacebookGraphOAuthError(
      "Facebook Page webhook subscription did not return success.",
      "TOKEN_EXCHANGE_FAILED",
      response.status
    );
  }
  return { ok: true, subscribedFields: fields };
}

export async function listFacebookPageSubscribedApps(input: {
  graphVersion: string;
  pageId: string;
  pageAccessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<Array<{ id: string; name: string | null; subscribedFields: string[] }>> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const url = new URL(
    `${graphBase(input.graphVersion)}/${encodeURIComponent(input.pageId)}/subscribed_apps`
  );
  url.searchParams.set("fields", "id,name,subscribed_fields");
  url.searchParams.set("access_token", input.pageAccessToken);
  const response = await fetchImpl(url.toString(), { method: "GET" });
  if (!response.ok) {
    throw new FacebookGraphOAuthError(
      "Could not verify Messenger webhook subscription.",
      response.status >= 500 ? "PROVIDER_TEMPORARY" : "TOKEN_EXCHANGE_FAILED",
      response.status
    );
  }
  const body = await parseGraphJson(response);
  if (body.error) {
    throw new FacebookGraphOAuthError(
      "Could not verify Messenger webhook subscription.",
      "TOKEN_EXCHANGE_FAILED",
      response.status
    );
  }
  const data = Array.isArray(body.data) ? body.data : [];
  return data
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : "";
      const name = typeof row.name === "string" ? row.name : null;
      const subscribedFields = Array.isArray(row.subscribed_fields)
        ? row.subscribed_fields.filter((f): f is string => typeof f === "string")
        : [];
      if (!id) return null;
      return { id, name, subscribedFields };
    })
    .filter(
      (row): row is { id: string; name: string | null; subscribedFields: string[] } => row !== null
    );
}
