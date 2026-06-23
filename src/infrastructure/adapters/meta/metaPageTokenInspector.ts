import type {
  InspectMetaPageTokenInput,
  InspectedMetaPageToken,
  MetaPageTokenInspector
} from "../../../domain/metaPageCredentialVerification.js";
import { MetaPageCredentialVerificationError } from "../../../domain/metaPageCredentialVerificationErrors.js";
import { MetaPageCredentialTokenShapeError } from "../../../domain/metaPageCredentialErrors.js";
import { assertMetaPageFacebookLoginAccessTokenShape } from "../../../lib/metaPageCredentialValidation.js";
import {
  assertMetaPageExpiryAcceptable,
  normalizeMetaPageExpiryTimestamps
} from "../../../lib/metaPageCredentialExpiryPolicy.js";
import { normalizeMetaPageGrantedScopes } from "../../../lib/metaPageCredentialScopes.js";
import { MetaGraphHttpClient, normalizeMetaGraphVersion } from "./metaGraphHttpClient.js";

const ACCEPTABLE_PAGE_TOKEN_TYPES = new Set(["PAGE"]);

export type MetaPageTokenInspectorConfig = {
  graphVersion: string;
  httpClient?: MetaGraphHttpClient;
};

function extractGrantedScopes(data: Record<string, unknown>): string[] {
  const scopes: string[] = [];
  const direct = data.scopes;
  if (Array.isArray(direct)) {
    for (const item of direct) {
      if (typeof item === "string") scopes.push(item);
    }
  }
  const granular = data.granular_scopes;
  if (Array.isArray(granular)) {
    for (const entry of granular) {
      if (entry && typeof entry === "object" && typeof (entry as { scope?: string }).scope === "string") {
        scopes.push((entry as { scope: string }).scope);
      }
    }
  }
  return normalizeMetaPageGrantedScopes(scopes);
}

export class GraphMetaPageTokenInspector implements MetaPageTokenInspector {
  private readonly http: MetaGraphHttpClient;
  private readonly graphVersion: string;

  constructor(config: MetaPageTokenInspectorConfig) {
    this.graphVersion = normalizeMetaGraphVersion(config.graphVersion);
    this.http = config.httpClient ?? new MetaGraphHttpClient();
  }

  async inspect(input: InspectMetaPageTokenInput): Promise<InspectedMetaPageToken> {
    try {
      assertMetaPageFacebookLoginAccessTokenShape(input.accessToken);
    } catch (error) {
      if (error instanceof MetaPageCredentialTokenShapeError) {
        throw new MetaPageCredentialVerificationError(
          "META_TOKEN_FAMILY_MISMATCH",
          "Token family is not supported for Meta Page credentials",
          false
        );
      }
      throw error;
    }

    const version = this.graphVersion;
    const url = new URL(`https://graph.facebook.com/${version}/debug_token`);
    url.searchParams.set("input_token", input.accessToken.trim());
    url.searchParams.set("access_token", input.appAccessToken.trim());

    const body = await this.http.requestJson({ url: url.toString(), method: "GET" });
    const data = body.data;
    if (!data || typeof data !== "object") {
      throw new MetaPageCredentialVerificationError(
        "META_PROVIDER_RESPONSE_INVALID",
        "Token inspection response was invalid",
        false
      );
    }

    const record = data as Record<string, unknown>;
    if (record.is_valid !== true) {
      throw new MetaPageCredentialVerificationError(
        "META_TOKEN_INVALID",
        "Meta Page access token is not valid",
        false
      );
    }

    const tokenType = typeof record.type === "string" ? record.type.trim().toUpperCase() : "";
    if (!ACCEPTABLE_PAGE_TOKEN_TYPES.has(tokenType)) {
      throw new MetaPageCredentialVerificationError(
        "META_TOKEN_FAMILY_MISMATCH",
        "Token is not a Meta Page access token",
        false
      );
    }

    const providerAppId = typeof record.app_id === "string" ? record.app_id.trim() : String(record.app_id ?? "");
    if (!providerAppId || providerAppId !== input.expectedAppId.trim()) {
      throw new MetaPageCredentialVerificationError(
        "META_APP_MISMATCH",
        "Meta App binding does not match configured application",
        false
      );
    }

    const expiry = normalizeMetaPageExpiryTimestamps({
      expiresAt: record.expires_at,
      dataAccessExpiresAt: record.data_access_expires_at
    });
    assertMetaPageExpiryAcceptable(expiry);

    return {
      providerAppId,
      providerTokenType: tokenType,
      isValid: true,
      grantedScopes: extractGrantedScopes(record),
      tokenExpiresAt: expiry.tokenExpiresAt,
      dataAccessExpiresAt: expiry.dataAccessExpiresAt
    };
  }
}
