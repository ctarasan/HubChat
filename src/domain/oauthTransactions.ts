import type { ChannelConnectProvider } from "./channelConnections.js";

export type OAuthTransactionStage =
  | "PENDING"
  | "CALLBACK_RECEIVED"
  | "PAGES_READY"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED";

export const OAUTH_TRANSACTION_STAGES: OAuthTransactionStage[] = [
  "PENDING",
  "CALLBACK_RECEIVED",
  "PAGES_READY",
  "COMPLETED",
  "FAILED",
  "EXPIRED"
];

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

export const OAUTH_ERROR_CATEGORIES: OAuthErrorCategory[] = [
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

export type FacebookOAuthPageCandidate = {
  pageId: string;
  name: string;
  tasks: string[];
  selectable: boolean;
  reasonCode: "MISSING_PAGE_TASKS" | null;
  alreadyConnected: boolean;
};

export type OAuthTransactionRecord = {
  id: string;
  tenantId: string;
  connectionId: string;
  provider: ChannelConnectProvider;
  stateHash: string;
  resumeSessionHash: string | null;
  status: OAuthTransactionStage;
  initiatedByAuthUserId: string;
  initiatedBySalesAgentId: string;
  userTokenExpiresAt: Date | null;
  pageCandidatesJson: FacebookOAuthPageCandidate[] | null;
  selectedPageId: string | null;
  errorCategory: OAuthErrorCategory | null;
  callbackReceivedAt: Date | null;
  consumedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateOAuthTransactionInput = {
  tenantId: string;
  connectionId: string;
  provider?: ChannelConnectProvider;
  stateHash: string;
  initiatedByAuthUserId: string;
  initiatedBySalesAgentId: string;
  expiresAt: Date;
};

export type ConsumeOAuthStateInput = {
  stateHash: string;
  resumeSessionHash: string;
  userAccessToken: string;
  userTokenExpiresAt: Date | null;
};

export type BindOAuthResumeSessionInput = {
  transactionId: string;
  tenantId: string;
  initiatedByAuthUserId: string;
  resumeSessionHash: string;
};

export type UpdateOAuthTransactionStatusInput = {
  transactionId: string;
  tenantId: string;
  status: OAuthTransactionStage;
  errorCategory?: OAuthErrorCategory | null;
  pageCandidatesJson?: FacebookOAuthPageCandidate[] | null;
  selectedPageId?: string | null;
  consumedAt?: Date | null;
};
