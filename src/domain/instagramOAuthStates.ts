/** Instagram OAuth state persistence — IG-AUTH-2C connect flow only. */

export type InstagramOAuthStateStatus = "PENDING" | "CLAIMED" | "CONSUMED" | "FAILED";

export const INSTAGRAM_OAUTH_STATE_STATUSES: InstagramOAuthStateStatus[] = [
  "PENDING",
  "CLAIMED",
  "CONSUMED",
  "FAILED"
];

export type InstagramOAuthReturnDestination = "CHANNEL_SETTINGS";

export const INSTAGRAM_OAUTH_RETURN_DESTINATIONS: InstagramOAuthReturnDestination[] = [
  "CHANNEL_SETTINGS"
];

export type InstagramOAuthStateRecord = {
  id: string;
  tenantId: string;
  channelConnectionId: string;
  provider: "INSTAGRAM";
  stateHash: string;
  returnDestination: InstagramOAuthReturnDestination;
  requestedScopes: string[];
  status: InstagramOAuthStateStatus;
  initiatedByAuthUserId: string;
  initiatedBySalesAgentId: string;
  failureCode: string | null;
  claimedAt: Date | null;
  consumedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateInstagramOAuthStateInput = {
  tenantId: string;
  channelConnectionId: string;
  stateHash: string;
  returnDestination: InstagramOAuthReturnDestination;
  requestedScopes: string[];
  initiatedByAuthUserId: string;
  initiatedBySalesAgentId: string;
  expiresAt: Date;
};

export type ClaimInstagramOAuthStateInput = {
  stateHash: string;
  provider: "INSTAGRAM";
  now: Date;
};

export type FinalizeInstagramOAuthStateInput = {
  stateId: string;
  status: "CONSUMED" | "FAILED";
  failureCode?: string | null;
};
