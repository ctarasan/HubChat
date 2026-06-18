import type { InstagramOAuthCredentialStatus } from "../domain/instagramOAuthCredentials.js";

const ALLOWED_TRANSITIONS: Record<InstagramOAuthCredentialStatus, InstagramOAuthCredentialStatus[]> = {
  PENDING: ["ACTIVE", "ERROR", "REVOKED", "DISCONNECTED"],
  ACTIVE: ["TOKEN_EXPIRING", "REFRESHING", "REAUTH_REQUIRED", "REVOKED", "DISCONNECTED", "ERROR"],
  TOKEN_EXPIRING: ["REFRESHING", "REAUTH_REQUIRED", "REVOKED", "DISCONNECTED", "ERROR", "ACTIVE"],
  REFRESHING: ["ACTIVE", "REAUTH_REQUIRED", "ERROR"],
  REAUTH_REQUIRED: ["ACTIVE", "REVOKED", "DISCONNECTED", "ERROR"],
  REVOKED: ["DISCONNECTED"],
  DISCONNECTED: [],
  ERROR: ["REAUTH_REQUIRED", "REVOKED", "DISCONNECTED"]
};

export class InstagramOAuthCredentialTransitionError extends Error {
  override readonly name = "InstagramOAuthCredentialTransitionError";
}

export function assertInstagramOAuthCredentialTransition(
  current: InstagramOAuthCredentialStatus,
  next: InstagramOAuthCredentialStatus
): void {
  if (current === next) return;
  const allowed = ALLOWED_TRANSITIONS[current] ?? [];
  if (!allowed.includes(next)) {
    throw new InstagramOAuthCredentialTransitionError(
      `Invalid Instagram OAuth credential status transition: ${current} -> ${next}`
    );
  }
}

export function isInstagramOAuthActiveCredentialStatus(status: InstagramOAuthCredentialStatus): boolean {
  return (
    status === "PENDING" ||
    status === "ACTIVE" ||
    status === "TOKEN_EXPIRING" ||
    status === "REFRESHING" ||
    status === "REAUTH_REQUIRED"
  );
}

/** Statuses that require non-empty encrypted access token ciphertext in storage. */
export function isInstagramOAuthTokenBearingCredentialStatus(
  status: InstagramOAuthCredentialStatus
): boolean {
  return (
    status === "ACTIVE" ||
    status === "TOKEN_EXPIRING" ||
    status === "REFRESHING" ||
    status === "REAUTH_REQUIRED"
  );
}

/** Generic lifecycle updates must not enter token-bearing ACTIVE without token replacement. */
export function isInstagramOAuthLifecycleOnlyCredentialStatus(
  status: InstagramOAuthCredentialStatus
): boolean {
  return status !== "ACTIVE";
}
