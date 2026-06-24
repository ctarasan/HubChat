import type { MetaPageBindingChannelType } from "./metaPageCredentials.js";
import type { VerifiedMetaPageCredentialProof } from "./metaPageCredentialVerification.js";

export type MetaPageCredentialActivationStatus = "ACTIVATED_PENDING_HEALTH";

export type MetaPageCredentialActivationBindingResult = {
  channelType: MetaPageBindingChannelType;
  channelConnectionId: string;
  bindingId: string;
  credentialVersion: number;
};

export type MetaPageCredentialActivationResult = {
  activationStatus: MetaPageCredentialActivationStatus;
  credentialId: string;
  credentialVersion: number;
  bindings: MetaPageCredentialActivationBindingResult[];
  idempotencyReplay: boolean;
};

/** Initial create sentinel — no prior ACTIVE shared credential for tenant. */
export const META_PAGE_CREDENTIAL_INITIAL_VERSION = 0;

export type ActivateMetaPageCredentialPortInput = {
  tenantId: string;
  proof: VerifiedMetaPageCredentialProof;
  encryptedAccessTokenCiphertext: string;
  facebookConnectionId: string;
  instagramConnectionId?: string | null;
  expectedCredentialVersion: number;
  credentialId?: string | null;
  idempotencyKey: string;
  requestFingerprint: string;
};
