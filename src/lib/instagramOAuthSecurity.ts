import { createHash, randomBytes } from "node:crypto";

export const INSTAGRAM_OAUTH_STATE_BYTES = 32;
/** Short-lived OAuth state TTL — independent of token lifetimes. */
export const INSTAGRAM_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export function generateInstagramOAuthState(): string {
  return randomBytes(INSTAGRAM_OAUTH_STATE_BYTES).toString("base64url");
}

export function hashInstagramOAuthState(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function buildInstagramOAuthStateExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + INSTAGRAM_OAUTH_STATE_TTL_MS);
}

export function isInstagramOAuthStateExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
