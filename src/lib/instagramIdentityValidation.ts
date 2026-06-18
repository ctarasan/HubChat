import type {
  InstagramOAuthProviderUserId,
  InstagramProfessionalAccountId,
  InstagramProfessionalAccountType,
  InstagramProfessionalIdentity,
  InstagramUsername
} from "../domain/instagramIdentity.js";
import {
  asInstagramOAuthProviderUserId,
  asInstagramProfessionalAccountId,
  asInstagramUsername
} from "../domain/instagramIdentity.js";

const PROVIDER_ACCOUNT_ID_PATTERN = /^[0-9]{5,32}$/;

const SUPPORTED_PROVIDER_ACCOUNT_TYPES = new Set(["BUSINESS", "MEDIA_CREATOR", "CREATOR"]);

export class InstagramIdentityValidationError extends Error {
  override readonly name = "InstagramIdentityValidationError";

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function normalizeProviderAccountType(raw: string): InstagramProfessionalAccountType {
  const upper = raw.trim().toUpperCase();
  if (upper === "BUSINESS") return "BUSINESS";
  if (upper === "MEDIA_CREATOR" || upper === "CREATOR") return "CREATOR";
  throw new InstagramIdentityValidationError(
    "INSTAGRAM_OAUTH_ACCOUNT_NOT_PROFESSIONAL",
    "Instagram account type is not supported for Business Login"
  );
}

export function validateInstagramProfessionalIdentityRaw(input: {
  userId: string;
  username: string;
  accountType: string;
}): InstagramProfessionalIdentity {
  const userId = input.userId.trim();
  if (!userId || !PROVIDER_ACCOUNT_ID_PATTERN.test(userId)) {
    throw new InstagramIdentityValidationError(
      "INSTAGRAM_OAUTH_IDENTITY_RESPONSE_INVALID",
      "Instagram professional account ID is missing or invalid"
    );
  }

  const usernameRaw = input.username.trim();
  if (!usernameRaw) {
    throw new InstagramIdentityValidationError(
      "INSTAGRAM_OAUTH_IDENTITY_RESPONSE_INVALID",
      "Instagram username is missing"
    );
  }

  const accountTypeRaw = input.accountType.trim().toUpperCase();
  if (!SUPPORTED_PROVIDER_ACCOUNT_TYPES.has(accountTypeRaw)) {
    throw new InstagramIdentityValidationError(
      "INSTAGRAM_OAUTH_ACCOUNT_NOT_PROFESSIONAL",
      "Instagram account is not a professional account"
    );
  }

  return {
    professionalAccountId: asInstagramProfessionalAccountId(userId),
    username: asInstagramUsername(usernameRaw),
    accountType: normalizeProviderAccountType(accountTypeRaw)
  };
}

export function assertTokenResponseIdentityMatchesMe(input: {
  tokenResponseUserId: InstagramOAuthProviderUserId | string | null | undefined;
  verifiedIdentity: InstagramProfessionalIdentity;
}): void {
  if (!input.tokenResponseUserId) return;
  const tokenId = String(input.tokenResponseUserId).trim();
  if (!tokenId) return;
  if (tokenId !== String(input.verifiedIdentity.professionalAccountId)) {
    throw new InstagramIdentityValidationError(
      "INSTAGRAM_OAUTH_IDENTITY_MISMATCH",
      "Instagram OAuth token identity does not match verified professional account"
    );
  }
}

export function assertReauthorizationAccountBinding(input: {
  expectedProfessionalAccountId: InstagramProfessionalAccountId | string | null | undefined;
  verifiedIdentity: InstagramProfessionalIdentity;
}): void {
  const expected = input.expectedProfessionalAccountId?.trim();
  if (!expected) return;
  if (expected !== String(input.verifiedIdentity.professionalAccountId)) {
    throw new InstagramIdentityValidationError(
      "INSTAGRAM_OAUTH_ACCOUNT_SWITCH_REJECTED",
      "Instagram OAuth reauthorization cannot switch professional accounts"
    );
  }
}

export function toOAuthProviderUserIdFromTokenResponse(
  value: string
): InstagramOAuthProviderUserId {
  return asInstagramOAuthProviderUserId(value.trim());
}
