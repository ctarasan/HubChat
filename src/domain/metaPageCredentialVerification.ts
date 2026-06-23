import type { MetaPageBindingChannelType, MetaPageCredentialFamily } from "./metaPageCredentials.js";

export type InspectedMetaPageToken = {
  providerAppId: string;
  providerTokenType: string;
  isValid: true;
  grantedScopes: string[];
  tokenExpiresAt: Date | null;
  dataAccessExpiresAt: Date | null;
};

export type InspectMetaPageTokenInput = {
  accessToken: string;
  expectedAppId: string;
  appAccessToken: string;
};

export interface MetaPageTokenInspector {
  inspect(input: InspectMetaPageTokenInput): Promise<InspectedMetaPageToken>;
}

export type VerifiedMetaPageIdentity = {
  facebookPageId: string;
  pageTasks: string[];
};

export type VerifyMetaPageIdentityInput = {
  accessToken: string;
  expectedFacebookPageId: string;
};

export interface MetaPageIdentityVerifier {
  verifyPage(input: VerifyMetaPageIdentityInput): Promise<VerifiedMetaPageIdentity>;
}

export type VerifiedMetaInstagramRelationship = {
  instagramProfessionalAccountId: string;
  username: string | null;
};

export type VerifyMetaInstagramRelationshipInput = {
  accessToken: string;
  facebookPageId: string;
  expectedInstagramAccountId: string;
};

export interface MetaInstagramRelationshipVerifier {
  verifyRelationship(
    input: VerifyMetaInstagramRelationshipInput
  ): Promise<VerifiedMetaInstagramRelationship>;
}

export type VerifiedMetaPageCredentialProofMetadata = {
  credentialFamily: MetaPageCredentialFamily;
  providerAppId: string;
  facebookPageId: string;
  instagramProfessionalAccountId: string | null;
  requestedChannels: MetaPageBindingChannelType[];
  grantedScopes: string[];
  tokenExpiresAt: string | null;
  dataAccessExpiresAt: string | null;
  providerTokenType: string;
  verificationVersion: number;
  verifiedAt: string;
  tokenFingerprint: string;
};

export type VerifiedMetaPageCredentialProof = {
  readonly metadata: VerifiedMetaPageCredentialProofMetadata;
  consumeAccessToken<T>(consumer: (accessToken: string) => T): T;
};

export type TrustedMetaPageConnectionIdentity = {
  tenantId: string;
  connectionId: string;
  provider: "FACEBOOK" | "INSTAGRAM";
  providerAccountId: string;
};

export type VerifyMetaPageCredentialInput = {
  tenantId: string;
  accessToken: string;
  requestedChannels: MetaPageBindingChannelType[];
  expectedAppId: string;
  facebookConnection: TrustedMetaPageConnectionIdentity;
  instagramConnection?: TrustedMetaPageConnectionIdentity | null;
};
