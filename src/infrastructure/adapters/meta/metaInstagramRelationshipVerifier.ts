import type {
  MetaInstagramRelationshipVerifier,
  VerifiedMetaInstagramRelationship,
  VerifyMetaInstagramRelationshipInput
} from "../../../domain/metaPageCredentialVerification.js";
import { MetaPageCredentialVerificationError } from "../../../domain/metaPageCredentialVerificationErrors.js";
import { MetaGraphHttpClient, normalizeMetaGraphVersion } from "./metaGraphHttpClient.js";

export type MetaInstagramRelationshipVerifierConfig = {
  graphVersion: string;
  httpClient?: MetaGraphHttpClient;
};

export class GraphMetaInstagramRelationshipVerifier implements MetaInstagramRelationshipVerifier {
  private readonly http: MetaGraphHttpClient;
  private readonly graphVersion: string;

  constructor(config: MetaInstagramRelationshipVerifierConfig) {
    this.graphVersion = normalizeMetaGraphVersion(config.graphVersion);
    this.http = config.httpClient ?? new MetaGraphHttpClient();
  }

  async verifyRelationship(
    input: VerifyMetaInstagramRelationshipInput
  ): Promise<VerifiedMetaInstagramRelationship> {
    const pageId = input.facebookPageId.trim();
    const expectedIgId = input.expectedInstagramAccountId.trim();
    if (!pageId || !expectedIgId) {
      throw new MetaPageCredentialVerificationError(
        "META_IG_IDENTITY_MISMATCH",
        "Instagram connection identity is missing",
        false
      );
    }

    const url = new URL(`https://graph.facebook.com/${this.graphVersion}/${encodeURIComponent(pageId)}`);
    url.searchParams.set("fields", "instagram_business_account{id,username}");
    url.searchParams.set("access_token", input.accessToken.trim());

    const body = await this.http.requestJson({ url: url.toString(), method: "GET" });
    const ig = body.instagram_business_account;
    if (!ig || typeof ig !== "object") {
      throw new MetaPageCredentialVerificationError(
        "META_IG_ACCOUNT_NOT_FOUND",
        "Instagram Professional Account is not linked to the Facebook Page",
        false
      );
    }

    const record = ig as Record<string, unknown>;
    const igId = typeof record.id === "string" ? record.id.trim() : "";
    if (!igId) {
      throw new MetaPageCredentialVerificationError(
        "META_IG_ACCOUNT_NOT_FOUND",
        "Instagram Professional Account is not linked to the Facebook Page",
        false
      );
    }
    if (igId !== expectedIgId) {
      throw new MetaPageCredentialVerificationError(
        "META_IG_IDENTITY_MISMATCH",
        "Instagram Professional Account does not match expected connection",
        false
      );
    }

    const username = typeof record.username === "string" ? record.username.trim() : null;
    return { instagramProfessionalAccountId: igId, username: username || null };
  }
}
