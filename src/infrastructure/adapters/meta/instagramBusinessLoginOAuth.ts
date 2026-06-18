import { sanitizeProviderErrorMessage } from "../../../lib/sanitizeProviderError.js";
import type { InstagramOAuthConnectErrorCode } from "../../../lib/instagramOAuthConnectErrors.js";

export const INSTAGRAM_OAUTH_AUTHORIZE_HOST = "https://www.instagram.com";
export const INSTAGRAM_OAUTH_TOKEN_HOST = "https://api.instagram.com";
export const INSTAGRAM_GRAPH_HOST = "https://graph.instagram.com";

export type InstagramBusinessLoginOAuthClientConfig = {
  appId: string;
  appSecret: string;
  graphVersion: string;
  callbackUrl: string;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
};

export type InstagramOAuthTokenExchangeResult = {
  accessToken: string;
  providerUserId: string;
  tokenType?: string;
  expiresInSeconds?: number;
  grantedScopes?: string[];
};

export class InstagramBusinessLoginOAuthError extends Error {
  override readonly name = "InstagramBusinessLoginOAuthError";

  constructor(
    message: string,
    readonly code: InstagramOAuthConnectErrorCode,
    readonly statusCode?: number
  ) {
    super(message);
  }
}

function graphBase(version: string): string {
  return `${INSTAGRAM_GRAPH_HOST}/${version}`;
}

export function buildInstagramOAuthAuthorizeUrl(input: {
  config: InstagramBusinessLoginOAuthClientConfig;
  state: string;
  scopes: string[];
}): string {
  const url = new URL(`${INSTAGRAM_OAUTH_AUTHORIZE_HOST}/oauth/authorize`);
  url.searchParams.set("client_id", input.config.appId);
  url.searchParams.set("redirect_uri", input.config.callbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", input.scopes.join(","));
  return url.toString();
}

async function fetchWithBounds(
  config: InstagramBusinessLoginOAuthClientConfig,
  url: string,
  init: RequestInit
): Promise<Response> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.requestTimeoutMs ?? 15_000;
  const maxBytes = config.maxResponseBytes ?? 64_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal, redirect: "manual" });
    const clone = response.clone();
    const buffer = await clone.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
      throw new InstagramBusinessLoginOAuthError(
        "Provider response exceeded size limit.",
        "INSTAGRAM_OAUTH_RESPONSE_INVALID"
      );
    }
    return response;
  } catch (error) {
    if (error instanceof InstagramBusinessLoginOAuthError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new InstagramBusinessLoginOAuthError(
        "Provider request timed out.",
        "INSTAGRAM_OAUTH_PROVIDER_UNAVAILABLE"
      );
    }
    throw new InstagramBusinessLoginOAuthError(
      "Provider request failed.",
      "INSTAGRAM_OAUTH_PROVIDER_UNAVAILABLE"
    );
  } finally {
    clearTimeout(timer);
  }
}

async function parseJsonResponse(
  response: Response,
  failureCode: InstagramOAuthConnectErrorCode
): Promise<Record<string, unknown>> {
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    const error = body.error_message ?? body.error;
    const message = sanitizeProviderErrorMessage(
      typeof error === "string" ? error : `Provider request failed (${response.status})`
    );
    const code =
      response.status >= 500 ? "INSTAGRAM_OAUTH_PROVIDER_UNAVAILABLE" : failureCode;
    throw new InstagramBusinessLoginOAuthError(message, code, response.status);
  }
  return body;
}

export async function exchangeInstagramAuthorizationCode(
  config: InstagramBusinessLoginOAuthClientConfig,
  code: string
): Promise<InstagramOAuthTokenExchangeResult> {
  const body = new URLSearchParams();
  body.set("client_id", config.appId);
  body.set("client_secret", config.appSecret);
  body.set("grant_type", "authorization_code");
  body.set("redirect_uri", config.callbackUrl);
  body.set("code", code);

  const response = await fetchWithBounds(
    config,
    `${INSTAGRAM_OAUTH_TOKEN_HOST}/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    }
  );
  const parsed = await parseJsonResponse(response, "INSTAGRAM_OAUTH_EXCHANGE_FAILED");

  const accessToken = typeof parsed.access_token === "string" ? parsed.access_token : "";
  const userIdRaw = parsed.user_id;
  const providerUserId =
    typeof userIdRaw === "string"
      ? userIdRaw
      : typeof userIdRaw === "number"
        ? String(userIdRaw)
        : "";
  if (!accessToken || !providerUserId) {
    throw new InstagramBusinessLoginOAuthError(
      "Token exchange response missing required fields.",
      "INSTAGRAM_OAUTH_RESPONSE_INVALID"
    );
  }

  const permissions = Array.isArray(parsed.permissions)
    ? parsed.permissions.filter((value): value is string => typeof value === "string")
    : undefined;

  return {
    accessToken,
    providerUserId,
    tokenType: typeof parsed.token_type === "string" ? parsed.token_type : undefined,
    expiresInSeconds: typeof parsed.expires_in === "number" ? parsed.expires_in : undefined,
    grantedScopes: permissions
  };
}

export async function exchangeInstagramLongLivedAccessToken(
  config: InstagramBusinessLoginOAuthClientConfig,
  shortLivedToken: string
): Promise<InstagramOAuthTokenExchangeResult> {
  const url = new URL(`${graphBase(config.graphVersion)}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("access_token", shortLivedToken);

  const response = await fetchWithBounds(config, url.toString(), { method: "GET" });
  const parsed = await parseJsonResponse(response, "INSTAGRAM_OAUTH_EXCHANGE_FAILED");

  const accessToken = typeof parsed.access_token === "string" ? parsed.access_token : "";
  if (!accessToken) {
    throw new InstagramBusinessLoginOAuthError(
      "Long-lived token exchange did not return an access token.",
      "INSTAGRAM_OAUTH_RESPONSE_INVALID"
    );
  }

  return {
    accessToken,
    providerUserId: "",
    expiresInSeconds: typeof parsed.expires_in === "number" ? parsed.expires_in : undefined
  };
}

export interface InstagramOAuthProviderClient {
  buildAuthorizationUrl(input: { state: string; scopes: string[] }): string;
  exchangeAuthorizationCode(code: string): Promise<InstagramOAuthTokenExchangeResult>;
  exchangeForLongLivedAccessToken(shortLivedToken: string): Promise<InstagramOAuthTokenExchangeResult>;
}

export function createInstagramOAuthProviderClient(
  config: InstagramBusinessLoginOAuthClientConfig
): InstagramOAuthProviderClient {
  return {
    buildAuthorizationUrl: (input) => buildInstagramOAuthAuthorizeUrl({ config, ...input }),
    exchangeAuthorizationCode: (code) => exchangeInstagramAuthorizationCode(config, code),
    exchangeForLongLivedAccessToken: (token) => exchangeInstagramLongLivedAccessToken(config, token)
  };
}
