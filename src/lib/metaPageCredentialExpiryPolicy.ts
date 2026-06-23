import { MetaPageCredentialVerificationError } from "../domain/metaPageCredentialVerificationErrors.js";

/** Near-expiry horizon for data-access and token expiry (7 days). */
export const META_PAGE_CREDENTIAL_NEAR_EXPIRY_HORIZON_MS = 7 * 24 * 60 * 60 * 1000;

/** Allow small clock skew when comparing provider unix timestamps. */
export const META_PAGE_CREDENTIAL_EXPIRY_CLOCK_SKEW_MS = 60 * 1000;

export type NormalizedExpiryTimestamps = {
  tokenExpiresAt: Date | null;
  dataAccessExpiresAt: Date | null;
};

function parseUnixSeconds(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0) return null;
    const ms = value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim());
    if (!Number.isFinite(n) || n <= 0) return null;
    const date = new Date(n * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export function normalizeMetaPageExpiryTimestamps(input: {
  expiresAt?: unknown;
  dataAccessExpiresAt?: unknown;
}): NormalizedExpiryTimestamps {
  return {
    tokenExpiresAt: parseUnixSeconds(input.expiresAt),
    dataAccessExpiresAt: parseUnixSeconds(input.dataAccessExpiresAt)
  };
}

export function assertMetaPageExpiryAcceptable(
  timestamps: NormalizedExpiryTimestamps,
  now: Date = new Date()
): void {
  const nowMs = now.getTime();
  const skew = META_PAGE_CREDENTIAL_EXPIRY_CLOCK_SKEW_MS;
  const horizon = META_PAGE_CREDENTIAL_NEAR_EXPIRY_HORIZON_MS;

  if (timestamps.tokenExpiresAt) {
    if (timestamps.tokenExpiresAt.getTime() <= nowMs + skew) {
      throw new MetaPageCredentialVerificationError(
        "META_TOKEN_EXPIRED",
        "Meta Page access token has expired",
        false
      );
    }
    if (timestamps.tokenExpiresAt.getTime() - nowMs < horizon) {
      throw new MetaPageCredentialVerificationError(
        "META_TOKEN_EXPIRY_TOO_NEAR",
        "Meta Page access token expires too soon",
        false
      );
    }
  }

  if (timestamps.dataAccessExpiresAt) {
    if (timestamps.dataAccessExpiresAt.getTime() <= nowMs + skew) {
      throw new MetaPageCredentialVerificationError(
        "META_TOKEN_EXPIRED",
        "Meta Page data access has expired",
        false
      );
    }
    if (timestamps.dataAccessExpiresAt.getTime() - nowMs < horizon) {
      throw new MetaPageCredentialVerificationError(
        "META_TOKEN_EXPIRY_TOO_NEAR",
        "Meta Page data access expires too soon",
        false
      );
    }
  }

  if (
    timestamps.tokenExpiresAt &&
    timestamps.dataAccessExpiresAt &&
    timestamps.dataAccessExpiresAt.getTime() < timestamps.tokenExpiresAt.getTime() - skew
  ) {
    throw new MetaPageCredentialVerificationError(
      "META_TOKEN_INVALID",
      "Meta Page token expiry metadata is inconsistent",
      false
    );
  }
}
