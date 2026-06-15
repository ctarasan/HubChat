import { createHash, randomBytes } from "node:crypto";

export const FACEBOOK_OAUTH_STATE_BYTES = 32;
export const FACEBOOK_OAUTH_RESUME_SESSION_BYTES = 32;
export const FACEBOOK_OAUTH_TRANSACTION_TTL_MS = 15 * 60 * 1000;

export function generateFacebookOAuthState(): string {
  return randomBytes(FACEBOOK_OAUTH_STATE_BYTES).toString("base64url");
}

export function generateFacebookOAuthResumeSessionValue(): string {
  return randomBytes(FACEBOOK_OAUTH_RESUME_SESSION_BYTES).toString("base64url");
}

export function hashFacebookOAuthSecret(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function buildFacebookOAuthTransactionExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + FACEBOOK_OAUTH_TRANSACTION_TTL_MS);
}

export function isFacebookOAuthTransactionExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
