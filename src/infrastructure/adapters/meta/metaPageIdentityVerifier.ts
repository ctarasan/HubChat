import type {
  MetaPageIdentityVerifier,
  VerifiedMetaPageIdentity,
  VerifyMetaPageIdentityInput
} from "../../../domain/metaPageCredentialVerification.js";
import { MetaPageCredentialVerificationError } from "../../../domain/metaPageCredentialVerificationErrors.js";
import { pageTasksSatisfyRequired } from "../../../lib/metaPageCredentialScopes.js";
import {
  buildProviderVerificationDiagnostic,
  classifyProviderJsonShape,
  pageIdentityShapeSubcode,
  providerJsonObjectFlags
} from "../../../lib/metaProviderVerificationDiagnostics.js";
import { MetaGraphHttpClient, normalizeMetaGraphVersion } from "./metaGraphHttpClient.js";

export type MetaPageIdentityVerifierConfig = {
  graphVersion: string;
  httpClient?: MetaGraphHttpClient;
};

function pageIdentityProviderContext(graphVersion: string) {
  return {
    providerOperation: "PAGE_IDENTITY" as const,
    graphVersion,
    requestSubstage: "PAGE_IDENTITY_REQUEST" as const,
    parseSubstage: "PAGE_IDENTITY_PARSE" as const
  };
}

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

    const version = this.graphVersion;
    const url = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(pageId)}`);
    url.searchParams.set("fields", "id,tasks");
    url.searchParams.set("access_token", input.accessToken.trim());

    const body = await this.http.requestJson({
      url: url.toString(),
      method: "GET",
      providerContext: pageIdentityProviderContext(version)
    });

    const flags = providerJsonObjectFlags(body);
    if (flags.hasError) {
      const bodyText = JSON.stringify(body);
      const shape = classifyProviderJsonShape(body, bodyText);
      const subcode = pageIdentityShapeSubcode(shape);
      throw new MetaPageCredentialVerificationError(
        subcode,
        "Facebook Page identity response was invalid",
        false,
        buildProviderVerificationDiagnostic({
          providerOperation: "PAGE_IDENTITY",
          providerSubstage: "PAGE_IDENTITY_PARSE",
          graphVersion: version,
          safeProviderSubcode: subcode,
          httpStatus: 200,
          bodyText,
          parsed: body,
          shapeCategory: shape,
          hasError: true
        })
      );
    }

    const returnedId = typeof body.id === "string" ? body.id.trim() : "";
    if (!returnedId) {
      throw new MetaPageCredentialVerificationError(
        "META_PAGE_NOT_ACCESSIBLE",
        "Facebook Page is not accessible with this token",
        false,
        buildProviderVerificationDiagnostic({
          providerOperation: "PAGE_IDENTITY",
          providerSubstage: "PAGE_IDENTITY_VALIDATE",
          graphVersion: version,
          safeProviderSubcode: "META_PAGE_NOT_ACCESSIBLE",
          httpStatus: 200,
          shapeCategory: "JSON_OBJECT"
        })
      );
    }
    if (returnedId !== pageId) {
      throw new MetaPageCredentialVerificationError(
        "META_PAGE_IDENTITY_MISMATCH",
        "Facebook Page identity does not match expected connection",
        false,
        buildProviderVerificationDiagnostic({
          providerOperation: "PAGE_IDENTITY",
          providerSubstage: "PAGE_IDENTITY_MATCH",
          graphVersion: version,
          safeProviderSubcode: "META_PAGE_IDENTITY_MISMATCH",
          httpStatus: 200,
          shapeCategory: "JSON_OBJECT"
        })
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
        false,
        buildProviderVerificationDiagnostic({
          providerOperation: "PAGE_IDENTITY",
          providerSubstage: "PAGE_IDENTITY_VALIDATE",
          graphVersion: version,
          safeProviderSubcode: "META_SCOPE_MISSING",
          httpStatus: 200,
          shapeCategory: "JSON_OBJECT"
        })
      );
    }

    return { facebookPageId: returnedId, pageTasks: tasks };
  }
}
