import type { ChannelConnectionStatus } from "../domain/channelConnections.js";
import type { FacebookOAuthDisplayState, FacebookOAuthHealthStatus } from "../domain/facebookOAuth.js";
import type { OAuthErrorCategory, OAuthTransactionStage } from "../domain/oauthTransactions.js";

export type DeriveFacebookOAuthDisplayStateInput = {
  serverDisplayState?: FacebookOAuthDisplayState | null;
  connectionStatus?: ChannelConnectionStatus | null;
  oauthStage?: OAuthTransactionStage | null;
  healthStatus?: FacebookOAuthHealthStatus | null;
  reconnectRequired?: boolean;
  manualConfigured?: boolean;
  hasConnection?: boolean;
};

export function deriveFacebookOAuthDisplayState(
  input: DeriveFacebookOAuthDisplayStateInput
): FacebookOAuthDisplayState {
  if (input.serverDisplayState) {
    return input.serverDisplayState;
  }

  if (input.reconnectRequired || input.healthStatus === "RECONNECT_REQUIRED") {
    return "NEEDS_RECONNECT";
  }

  if (input.connectionStatus === "RECONNECT_REQUIRED" || input.connectionStatus === "REVOKED") {
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

  if (input.oauthStage === "PENDING") {
    return "CONNECTING";
  }

  if (input.connectionStatus === "READY" && input.healthStatus === "OK") {
    return "CONNECTED";
  }

  if (input.connectionStatus === "READY" && input.healthStatus === "DEGRADED") {
    return "DEGRADED";
  }

  if (input.connectionStatus === "ERROR") {
    return "ERROR";
  }

  if (input.manualConfigured && !input.hasConnection) {
    return "MANUAL_CONFIGURED";
  }

  if (!input.hasConnection && input.connectionStatus !== "AUTHORIZING") {
    return "NOT_CONNECTED";
  }

  if (input.connectionStatus === "AUTHORIZING") {
    return "CONNECTING";
  }

  return "NOT_CONNECTED";
}

export function buildFacebookOAuthChannelSettingsRedirectUrl(input: {
  appBaseUrl: string;
  oauth: "success" | "error";
  errorCategory?: OAuthErrorCategory | null;
}): string {
  const base = input.appBaseUrl.replace(/\/$/, "");
  const url = new URL(`${base}/dashboard/channel-settings`);
  url.searchParams.set("channel", "facebook");
  url.searchParams.set("oauth", input.oauth);
  if (input.oauth === "error" && input.errorCategory) {
    url.searchParams.set("errorCategory", input.errorCategory);
  }
  return url.toString();
}

export function assertFacebookOAuthPublicDtoSafe(payload: unknown): void {
  const serialized = JSON.stringify(payload);
  const healthCheckCodes =
    "CREDENTIAL_RESOLUTION|PAGE_ACCESS|REQUIRED_TASKS|GRAPH_API|PAGE_WEBHOOK_SUBSCRIPTION|RUNTIME_TEST_CONNECTION";
  const blockedPatterns = [
    /EAA[A-Za-z0-9]{10,}/,
    /access_token/i,
    /authorization code/i,
    /hubchat_fb_oauth_session/i,
    /encrypted_user_token/i,
    /encrypted_secret_value/i,
    new RegExp(`"code"\\s*:\\s*"(?!${healthCheckCodes})`),
    /"state"\s*:\s*"/
  ];
  for (const pattern of blockedPatterns) {
    if (pattern.test(serialized)) {
      throw new Error("OAuth public DTO contains blocked sensitive material");
    }
  }
}
