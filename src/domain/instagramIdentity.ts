/** Instagram identity types — professional account vs messaging-scoped IDs must not be conflated. */

/** Instagram Professional Account ID from `GET /me` (`user_id` field). Stored in `provider_instagram_account_id`. */
export type InstagramProfessionalAccountId = string & {
  readonly __brand: "InstagramProfessionalAccountId";
};

/** Instagram-scoped user ID returned by OAuth token exchange. Stored in `provider_user_id`. */
export type InstagramOAuthProviderUserId = string & {
  readonly __brand: "InstagramOAuthProviderUserId";
};

/** Messaging-scoped user ID (IGSID) — not populated by OAuth `/me`; reserved for inbound/DM flows. */
export type InstagramMessagingScopedUserId = string & {
  readonly __brand: "InstagramMessagingScopedUserId";
};

export type InstagramUsername = string & { readonly __brand: "InstagramUsername" };

export type InstagramProfessionalAccountType = "BUSINESS" | "CREATOR";

export type InstagramProfessionalIdentity = {
  professionalAccountId: InstagramProfessionalAccountId;
  username: InstagramUsername;
  accountType: InstagramProfessionalAccountType;
};

export function asInstagramProfessionalAccountId(value: string): InstagramProfessionalAccountId {
  return value as InstagramProfessionalAccountId;
}

export function asInstagramOAuthProviderUserId(value: string): InstagramOAuthProviderUserId {
  return value as InstagramOAuthProviderUserId;
}

export function asInstagramUsername(value: string): InstagramUsername {
  return value as InstagramUsername;
}
