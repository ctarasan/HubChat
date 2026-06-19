/** Sanitized Instagram OAuth connect audit events — no secrets in metadata. */

export type InstagramOAuthAuditEventType =
  | "INSTAGRAM_OAUTH_STARTED"
  | "INSTAGRAM_OAUTH_CALLBACK_SUCCEEDED"
  | "INSTAGRAM_OAUTH_CALLBACK_DENIED"
  | "INSTAGRAM_OAUTH_CALLBACK_FAILED"
  | "INSTAGRAM_OAUTH_STATE_REPLAY_REJECTED"
  | "INSTAGRAM_OAUTH_IDENTITY_VERIFIED"
  | "INSTAGRAM_OAUTH_IDENTITY_MISMATCH"
  | "INSTAGRAM_OAUTH_TEST_CONNECTION_SUCCEEDED"
  | "INSTAGRAM_OAUTH_TEST_CONNECTION_FAILED";

export type InstagramOAuthAuditMetadata = {
  tenantId?: string;
  channelConnectionId?: string;
  provider?: "INSTAGRAM";
  resultCode?: string;
  authFamily?: "INSTAGRAM_BUSINESS_LOGIN";
  accountType?: "BUSINESS" | "CREATOR";
  maskedAccountId?: string;
};

export type InstagramOAuthAuditSink = (event: {
  type: InstagramOAuthAuditEventType;
  metadata: InstagramOAuthAuditMetadata;
}) => void;

const FORBIDDEN_METADATA_KEYS = new Set([
  "state",
  "stateHash",
  "authorizationCode",
  "accessToken",
  "ciphertext",
  "appSecret",
  "pkceVerifier",
  "rawProviderResponse",
  "rawErrorDescription"
]);

export function emitInstagramOAuthAudit(
  sink: InstagramOAuthAuditSink,
  type: InstagramOAuthAuditEventType,
  metadata: InstagramOAuthAuditMetadata
): void {
  for (const key of Object.keys(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.has(key)) {
      throw new Error(`Instagram OAuth audit metadata contains forbidden key: ${key}`);
    }
  }
  sink({ type, metadata });
}

export const consoleInstagramOAuthAuditSink: InstagramOAuthAuditSink = ({ type, metadata }) => {
  console.info(JSON.stringify({ event: type, ...metadata }));
};
