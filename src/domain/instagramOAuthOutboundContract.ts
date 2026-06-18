/** Instagram OAuth outbound queue binding and resolver contract (IG-AUTH-2B). */

export const INSTAGRAM_OAUTH_OUTBOUND_QUEUE_CONTRACT_VERSION = 1 as const;

export type InstagramOAuthOutboundDeliveryPath = "DATABASE_ONLY" | "ENVIRONMENT_FALLBACK";

export type InstagramCredentialBinding =
  | {
      mode: "LEGACY";
    }
  | {
      mode: "CONNECTION_BOUND";
      contractVersion: typeof INSTAGRAM_OAUTH_OUTBOUND_QUEUE_CONTRACT_VERSION;
      provider: "INSTAGRAM";
      authFamily: "INSTAGRAM_BUSINESS_LOGIN";
      deliveryPath: "DATABASE_ONLY";
      channelConnectionId: string;
    };

export type InstagramResolvedCredential = {
  credentialId: string;
  credentialVersion: number;
  tenantId: string;
  channelConnectionId: string;
  providerInstagramAccountId: string;
  providerUserId: string | null;
  authFamily: "INSTAGRAM_BUSINESS_LOGIN";
  accessToken: string;
  tokenExpiresAt: Date | null;
};

export type ResolveInstagramConnectionCredentialInput = {
  tenantId: string;
  channelConnectionId: string;
  expectedAuthFamily: "INSTAGRAM_BUSINESS_LOGIN";
  expectedDeliveryPath: "DATABASE_ONLY";
};

export type InstagramOAuthResolverErrorClassification =
  | "retryable"
  | "terminal_configuration"
  | "reauth_required"
  | "feature_disabled";

export const INSTAGRAM_OAUTH_QUEUE_PROHIBITED_FIELDS = [
  "accessToken",
  "access_token",
  "accessTokenCiphertext",
  "ciphertext",
  "authorizationCode",
  "appSecret",
  "verifyToken",
  "secretFingerprint",
  "rawProviderResponse",
  "encryptionKey",
  "authorizationHeader"
] as const;
