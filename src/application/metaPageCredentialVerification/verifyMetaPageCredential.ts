import type {
  MetaInstagramRelationshipVerifier,
  MetaPageIdentityVerifier,
  MetaPageTokenInspector,
  VerifyMetaPageCredentialInput,
  VerifiedMetaPageCredentialProof
} from "../../domain/metaPageCredentialVerification.js";
import { MetaPageCredentialVerificationError } from "../../domain/metaPageCredentialVerificationErrors.js";
import { META_PAGE_BINDING_CHANNEL_TYPES } from "../../domain/metaPageCredentials.js";
import { evaluateMetaPageScopePolicy } from "../../lib/metaPageCredentialScopes.js";
import { fingerprintSecretValue } from "../../lib/channelSettingSecrets.js";
import {
  createVerifiedMetaPageCredentialProof,
  VERIFIED_META_PAGE_PROOF_FACTORY
} from "./verifiedMetaPageCredentialProofFactory.js";

export const META_PAGE_CREDENTIAL_VERIFICATION_VERSION = 1;

export type VerifyMetaPageCredentialDeps = {
  tokenInspector: MetaPageTokenInspector;
  pageIdentityVerifier: MetaPageIdentityVerifier;
  instagramRelationshipVerifier: MetaInstagramRelationshipVerifier;
  resolveAppAccessToken: (input: { appId: string; appSecret: string }) => string;
  appSecret: string;
  now?: () => Date;
};

function assertRequestedChannels(input: VerifyMetaPageCredentialInput): void {
  if (!input.requestedChannels.length) {
    throw new MetaPageCredentialVerificationError(
      "META_ACTIVATION_INPUT_INVALID",
      "At least one channel must be requested",
      false
    );
  }

  const unique = new Set(input.requestedChannels);
  if (unique.size !== input.requestedChannels.length) {
    throw new MetaPageCredentialVerificationError(
      "META_ACTIVATION_INPUT_INVALID",
      "Duplicate requested channels are not allowed",
      false
    );
  }

  for (const channel of input.requestedChannels) {
    if (!META_PAGE_BINDING_CHANNEL_TYPES.includes(channel)) {
      throw new MetaPageCredentialVerificationError(
        "META_ACTIVATION_INPUT_INVALID",
        "Unsupported requested channel",
        false
      );
    }
  }

  const wantsInstagram = unique.has("INSTAGRAM");
  const wantsFacebook = unique.has("FACEBOOK");

  if (!wantsFacebook) {
    throw new MetaPageCredentialVerificationError(
      "META_ACTIVATION_INPUT_INVALID",
      "Facebook channel activation is required",
      false
    );
  }

  if (wantsInstagram && !input.instagramConnection) {
    throw new MetaPageCredentialVerificationError(
      "META_ACTIVATION_INPUT_INVALID",
      "Instagram connection is required when Instagram channel is requested",
      false
    );
  }

  if (!wantsInstagram && input.instagramConnection) {
    throw new MetaPageCredentialVerificationError(
      "META_ACTIVATION_INPUT_INVALID",
      "Instagram connection must not be supplied when Instagram is not requested",
      false
    );
  }
}

function assertTrustedConnection(input: VerifyMetaPageCredentialInput): void {
  const { tenantId, facebookConnection, instagramConnection } = input;

  if (facebookConnection.tenantId !== tenantId) {
    throw new MetaPageCredentialVerificationError(
      "META_CONNECTION_NOT_FOUND",
      "Facebook connection is not in tenant scope",
      false
    );
  }
  if (facebookConnection.provider !== "FACEBOOK") {
    throw new MetaPageCredentialVerificationError(
      "META_CONNECTION_TYPE_MISMATCH",
      "Facebook connection type mismatch",
      false
    );
  }
  if (!facebookConnection.providerAccountId.trim()) {
    throw new MetaPageCredentialVerificationError(
      "META_CONNECTION_NOT_FOUND",
      "Facebook connection identity is missing",
      false
    );
  }

  if (instagramConnection) {
    if (instagramConnection.tenantId !== tenantId) {
      throw new MetaPageCredentialVerificationError(
        "META_CONNECTION_NOT_FOUND",
        "Instagram connection is not in tenant scope",
        false
      );
    }
    if (instagramConnection.provider !== "INSTAGRAM") {
      throw new MetaPageCredentialVerificationError(
        "META_CONNECTION_TYPE_MISMATCH",
        "Instagram connection type mismatch",
        false
      );
    }
    if (!instagramConnection.providerAccountId.trim()) {
      throw new MetaPageCredentialVerificationError(
        "META_CONNECTION_NOT_FOUND",
        "Instagram connection identity is missing",
        false
      );
    }
  }
}

export class VerifyMetaPageCredentialUseCase {
  constructor(private readonly deps: VerifyMetaPageCredentialDeps) {}

  async execute(input: VerifyMetaPageCredentialInput): Promise<VerifiedMetaPageCredentialProof> {
    assertRequestedChannels(input);
    assertTrustedConnection(input);

    const trimmedToken = input.accessToken.trim();
    const appAccessToken = this.deps.resolveAppAccessToken({
      appId: input.expectedAppId,
      appSecret: this.deps.appSecret
    });

    const inspected = await this.deps.tokenInspector.inspect({
      accessToken: trimmedToken,
      expectedAppId: input.expectedAppId,
      appAccessToken
    });

    const scopeResult = evaluateMetaPageScopePolicy({
      requestedChannels: input.requestedChannels,
      grantedScopes: inspected.grantedScopes
    });
    if (!scopeResult.ok) {
      throw new MetaPageCredentialVerificationError(
        "META_SCOPE_MISSING",
        `Required ${scopeResult.channel} scopes are missing for Meta Page activation`,
        false
      );
    }

    const pageIdentity = await this.deps.pageIdentityVerifier.verifyPage({
      accessToken: trimmedToken,
      expectedFacebookPageId: input.facebookConnection.providerAccountId
    });

    let instagramProfessionalAccountId: string | null = null;
    if (input.requestedChannels.includes("INSTAGRAM") && input.instagramConnection) {
      const ig = await this.deps.instagramRelationshipVerifier.verifyRelationship({
        accessToken: trimmedToken,
        facebookPageId: pageIdentity.facebookPageId,
        expectedInstagramAccountId: input.instagramConnection.providerAccountId
      });
      instagramProfessionalAccountId = ig.instagramProfessionalAccountId;
    }

    const now = this.deps.now?.() ?? new Date();
    const verifiedAt = now.toISOString();

    return createVerifiedMetaPageCredentialProof(VERIFIED_META_PAGE_PROOF_FACTORY, {
      accessToken: trimmedToken,
      metadata: {
        credentialFamily: "META_PAGE_FACEBOOK_LOGIN",
        providerAppId: inspected.providerAppId,
        facebookPageId: pageIdentity.facebookPageId,
        instagramProfessionalAccountId,
        requestedChannels: [...input.requestedChannels],
        grantedScopes: scopeResult.normalizedGrantedScopes,
        tokenExpiresAt: inspected.tokenExpiresAt?.toISOString() ?? null,
        dataAccessExpiresAt: inspected.dataAccessExpiresAt?.toISOString() ?? null,
        providerTokenType: inspected.providerTokenType,
        verificationVersion: META_PAGE_CREDENTIAL_VERIFICATION_VERSION,
        verifiedAt,
        tokenFingerprint: fingerprintSecretValue(trimmedToken)
      }
    });
  }
}
