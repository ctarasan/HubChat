import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";
import type { InstagramOAuthCredentialMetadata } from "../../domain/instagramOAuthCredentials.js";
import { isInstagramOAuthActiveCredentialStatus } from "../../lib/instagramOAuthCredentialLifecycle.js";

/**
 * Instagram Business Login OAuth-managed connections store credentials in
 * `instagram_oauth_credentials` with `auth_family = INSTAGRAM_BUSINESS_LOGIN`.
 */
export function isOAuthManagedInstagramConnection(
  connection: ChannelConnectionRecord | null,
  oauthCredentials: InstagramOAuthCredentialMetadata[]
): boolean {
  if (!connection || connection.provider !== "INSTAGRAM") return false;
  return oauthCredentials.some(
    (row) =>
      row.authFamily === "INSTAGRAM_BUSINESS_LOGIN" &&
      isInstagramOAuthActiveCredentialStatus(row.credentialStatus)
  );
}

export function findOAuthManagedInstagramCredential(
  oauthCredentials: InstagramOAuthCredentialMetadata[]
): InstagramOAuthCredentialMetadata | null {
  return (
    oauthCredentials.find(
      (row) =>
        row.authFamily === "INSTAGRAM_BUSINESS_LOGIN" &&
        isInstagramOAuthActiveCredentialStatus(row.credentialStatus)
    ) ?? null
  );
}
