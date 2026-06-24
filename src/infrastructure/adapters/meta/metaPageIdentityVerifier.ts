import type {
  MetaPageIdentityVerifier,
  VerifiedMetaPageIdentity,
  VerifyMetaPageIdentityInput
} from "../../../domain/metaPageCredentialVerification.js";
import { MetaPageCredentialVerificationError } from "../../../domain/metaPageCredentialVerificationErrors.js";
import { pageTasksSatisfyRequired } from "../../../lib/metaPageCredentialScopes.js";
import { MetaGraphHttpClient, normalizeMetaGraphVersion } from "./metaGraphHttpClient.js";

export type MetaPageIdentityVerifierConfig = {
  graphVersion: string;
  httpClient?: MetaGraphHttpClient;
};

export class GraphMetaPageIdentityVerifier implements MetaPageIdentityVerifier {
  private readonly http: MetaGraphHttpClient;
  private readonly graphVersion: string;

  constructor(config: MetaPageIdentityVerifierConfig) {
    this.graphVersion = normalizeMetaGraphVersion(config.graphVersion);
    this.http = config.httpClient ?? new MetaGraphHttpClient();
  }

  async verifyPage(input: VerifyMetaPageIdentityInput): Promise<VerifiedMetaPageIdentity> {
    const pageId = input.expectedFacebookPageId.trim();
    if (!pageId) {
      throw new MetaPageCredentialVerificationError(
        "META_PAGE_IDENTITY_MISMATCH",
        "Expected Facebook Page identity is missing",
        false
      );
    }

    const url = new URL(`https://graph.facebook.com/${this.graphVersion}/${encodeURIComponent(pageId)}`);
    url.searchParams.set("fields", "id,tasks");
    url.searchParams.set("access_token", input.accessToken.trim());

    const body = await this.http.requestJson({ url: url.toString(), method: "GET" });
    const returnedId = typeof body.id === "string" ? body.id.trim() : "";
    if (!returnedId) {
      throw new MetaPageCredentialVerificationError(
        "META_PAGE_NOT_ACCESSIBLE",
        "Facebook Page is not accessible with this token",
        false
      );
    }
    if (returnedId !== pageId) {
      throw new MetaPageCredentialVerificationError(
        "META_PAGE_IDENTITY_MISMATCH",
        "Facebook Page identity does not match expected connection",
        false
      );
    }

    const tasksRaw = body.tasks;
    const tasks = Array.isArray(tasksRaw)
      ? tasksRaw.filter((t): t is string => typeof t === "string")
      : [];
    if (!pageTasksSatisfyRequired(tasks)) {
      throw new MetaPageCredentialVerificationError(
        "META_SCOPE_MISSING",
        "Facebook Page is missing required messaging task access",
        false
      );
    }

    return { facebookPageId: returnedId, pageTasks: tasks };
  }
}
