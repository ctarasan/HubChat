import type { MetaPageBindingChannelType } from "../../domain/metaPageCredentials.js";
import type { MetaPageCredentialActivationBindingResult } from "../../domain/metaPageCredentialActivation.js";

export type MetaPageCredentialActivationOutcomeState =
  | "ACTIVATED_HEALTHY_PENDING_CUTOVER"
  | "ACTIVATED_PENDING_HEALTH"
  | "ACTIVATED_HEALTH_FAILED";

export type MetaPageCredentialActivationOutcome = {
  state: MetaPageCredentialActivationOutcomeState;
  activationStatus: "ACTIVATED_PENDING_HEALTH";
  credentialId: string;
  credentialVersion: number;
  bindings: MetaPageCredentialActivationBindingResult[];
  idempotencyReplay: boolean;
  requestedChannels: MetaPageBindingChannelType[];
};

export type ActivateMetaPageCredentialCommand = {
  tenantId: string;
  actorSalesAgentId: string | null;
  accessToken: string;
  facebookConnectionId: string;
  instagramConnectionId?: string | null;
  requestedChannels: MetaPageBindingChannelType[];
  expectedCredentialVersion: number;
  credentialId?: string | null;
  idempotencyKey: string;
};
