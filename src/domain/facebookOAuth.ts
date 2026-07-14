import type { ChannelConnectionStatus } from "./channelConnections.js";
import type { OAuthErrorCategory, OAuthTransactionStage } from "./oauthTransactions.js";

export type FacebookOAuthHealthStatus =
  | "UNKNOWN"
  | "OK"
  | "DEGRADED"
  | "ERROR"
  | "RECONNECT_REQUIRED";

export const FACEBOOK_OAUTH_HEALTH_STATUSES: FacebookOAuthHealthStatus[] = [
  "UNKNOWN",
  "OK",
  "DEGRADED",
  "ERROR",
  "RECONNECT_REQUIRED"
];

export type FacebookOAuthDisplayState =
  | "NOT_CONNECTED"
  | "MANUAL_CONFIGURED"
  | "CONNECTING"
  | "AWAITING_PAGE_SELECTION"
  | "CONNECTED"
  | "DEGRADED"
  | "NEEDS_RECONNECT"
  | "ERROR";

export const FACEBOOK_OAUTH_DISPLAY_STATES: FacebookOAuthDisplayState[] = [
  "NOT_CONNECTED",
  "MANUAL_CONFIGURED",
  "CONNECTING",
  "AWAITING_PAGE_SELECTION",
  "CONNECTED",
  "DEGRADED",
  "NEEDS_RECONNECT",
  "ERROR"
];

export type FacebookOAuthStatusDto = {
  connectionId: string | null;
  connectionStatus: ChannelConnectionStatus | null;
  displayState: FacebookOAuthDisplayState;
  oauthStage: OAuthTransactionStage | null;
  healthStatus: FacebookOAuthHealthStatus;
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

export type FacebookOAuthSessionDto = {
  oauthStage: OAuthTransactionStage;
  displayState: FacebookOAuthDisplayState;
  errorCategory: OAuthErrorCategory | null;
  message: string | null;
  expiresAt: string;
  pagesReady: boolean;
};

export type FacebookOAuthPageOptionDto = {
  pageId: string;
  name: string;
  tasks: string[];
  selectable: boolean;
  reasonCode: "MISSING_PAGE_TASKS" | null;
  alreadyConnected: boolean;
};

export type FacebookOAuthCompleteDto = {
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

export type FacebookOAuthDeferredDto = {
  available: false;
  message: string;
};

export type FacebookOAuthHealthCheckCode =
  | "CREDENTIAL_RESOLUTION"
  | "PAGE_ACCESS"
  | "REQUIRED_TASKS"
  | "GRAPH_API"
  | "PAGE_WEBHOOK_SUBSCRIPTION"
  | "RUNTIME_TEST_CONNECTION";

export type FacebookOAuthHealthCheckStatus = "PASS" | "WARN" | "FAIL";

export type FacebookOAuthHealthCheckDto = {
  code: FacebookOAuthHealthCheckCode;
  status: FacebookOAuthHealthCheckStatus;
  message: string;
};

export type FacebookOAuthHealthDto = {
  healthStatus: FacebookOAuthHealthStatus;
  reconnectRequired: boolean;
  connectionStatus: ChannelConnectionStatus;
  displayState: FacebookOAuthDisplayState;
  lastCheckedAt: string;
  errorCategory: OAuthErrorCategory | null;
  message: string | null;
  checks: FacebookOAuthHealthCheckDto[];
};

export type FacebookOAuthReconnectDto = {
  authorizeUrl: string;
  expiresAt: string;
};
