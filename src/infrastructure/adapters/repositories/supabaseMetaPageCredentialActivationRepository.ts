import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ActivateMetaPageCredentialPortInput,
  MetaPageCredentialActivationBindingResult,
  MetaPageCredentialActivationResult
} from "../../../domain/metaPageCredentialActivation.js";
import type { MetaPageCredentialActivationPort } from "../../../domain/ports.js";
import {
  mapRpcMessageToMetaPageCredentialActivationError,
  MetaPageCredentialActivationError
} from "../../../domain/metaPageCredentialActivationErrors.js";
import type { MetaPageBindingChannelType } from "../../../domain/metaPageCredentials.js";
import { normalizeMetaPageGrantedScopes } from "../../../lib/metaPageCredentialScopes.js";
import { sanitizeProviderErrorMessage } from "../../../lib/sanitizeProviderError.js";
import { throwIfSupabaseError } from "../../../lib/supabasePostgrestError.js";

const ACTIVATION_RPC_NAME = "activate_meta_page_credential_tx";

type ActivationRpcResponse = {
  activationStatus?: string;
  credentialId?: string;
  credentialVersion?: number;
  bindings?: Array<{
    channelType?: string;
    channelConnectionId?: string;
    bindingId?: string;
    credentialVersion?: number;
  }>;
  idempotencyReplay?: boolean;
};

function assertActivationInput(input: ActivateMetaPageCredentialPortInput): void {
  const { proof } = input;
  const channels = proof.metadata.requestedChannels;

  if (!input.tenantId.trim()) {
    throw new MetaPageCredentialActivationError(
      "META_ACTIVATION_INPUT_INVALID",
      "Tenant scope is required for activation",
      false
    );
  }

  if (!input.encryptedAccessTokenCiphertext.trim()) {
    throw new MetaPageCredentialActivationError(
      "META_ACTIVATION_INPUT_INVALID",
      "Encrypted credential material is required",
      false
    );
  }

  if (!input.idempotencyKey.trim() || !input.requestFingerprint.trim()) {
    throw new MetaPageCredentialActivationError(
      "META_ACTIVATION_INPUT_INVALID",
      "Idempotency context is required",
      false
    );
  }

  if (!channels.includes("FACEBOOK")) {
    throw new MetaPageCredentialActivationError(
      "META_ACTIVATION_INPUT_INVALID",
      "Facebook channel activation is required",
      false
    );
  }

  const wantsInstagram = channels.includes("INSTAGRAM");
  if (wantsInstagram && !input.instagramConnectionId) {
    throw new MetaPageCredentialActivationError(
      "META_ACTIVATION_INPUT_INVALID",
      "Instagram connection is required when Instagram is requested",
      false
    );
  }
  if (!wantsInstagram && input.instagramConnectionId) {
    throw new MetaPageCredentialActivationError(
      "META_ACTIVATION_INPUT_INVALID",
      "Instagram connection must not be supplied when Instagram is not requested",
      false
    );
  }

  if (input.expectedCredentialVersion === 0 && input.credentialId) {
    throw new MetaPageCredentialActivationError(
      "META_ACTIVATION_INPUT_INVALID",
      "Credential id must not be supplied for initial activation",
      false
    );
  }

  if (input.expectedCredentialVersion > 0 && !input.credentialId) {
    throw new MetaPageCredentialActivationError(
      "META_ACTIVATION_INPUT_INVALID",
      "Credential id is required when expected version is provided",
      false
    );
  }
}

function parseBinding(value: NonNullable<ActivationRpcResponse["bindings"]>[number]): MetaPageCredentialActivationBindingResult {
  const channelType = value.channelType;
  if (channelType !== "FACEBOOK" && channelType !== "INSTAGRAM") {
    throw new MetaPageCredentialActivationError(
      "META_PROVIDER_UNAVAILABLE",
      "Activation response binding channel type was invalid",
      true
    );
  }
  if (!value.channelConnectionId || !value.bindingId || typeof value.credentialVersion !== "number") {
    throw new MetaPageCredentialActivationError(
      "META_PROVIDER_UNAVAILABLE",
      "Activation response binding payload was invalid",
      true
    );
  }
  return {
    channelType: channelType as MetaPageBindingChannelType,
    channelConnectionId: value.channelConnectionId,
    bindingId: value.bindingId,
    credentialVersion: value.credentialVersion
  };
}

function parseActivationResponse(data: unknown): MetaPageCredentialActivationResult {
  const record = (data ?? {}) as ActivationRpcResponse;
  if (
    record.activationStatus !== "ACTIVATED_PENDING_HEALTH" ||
    !record.credentialId ||
    typeof record.credentialVersion !== "number" ||
    !Array.isArray(record.bindings)
  ) {
    throw new MetaPageCredentialActivationError(
      "META_PROVIDER_UNAVAILABLE",
      "Activation response payload was invalid",
      true
    );
  }

  return {
    activationStatus: "ACTIVATED_PENDING_HEALTH",
    credentialId: record.credentialId,
    credentialVersion: record.credentialVersion,
    bindings: record.bindings.map(parseBinding),
    idempotencyReplay: record.idempotencyReplay === true
  };
}

function mapSupabaseActivationError(error: unknown): never {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: string }).message ?? "")
      : "";
  const mapped = mapRpcMessageToMetaPageCredentialActivationError(message);
  if (mapped) throw mapped;
  throw new MetaPageCredentialActivationError(
    "META_PROVIDER_UNAVAILABLE",
    sanitizeProviderErrorMessage("Meta Page credential activation failed"),
    true
  );
}

export class SupabaseMetaPageCredentialActivationRepository implements MetaPageCredentialActivationPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async activate(input: ActivateMetaPageCredentialPortInput): Promise<MetaPageCredentialActivationResult> {
    assertActivationInput(input);
    const metadata = input.proof.metadata;

    const rpcInput = {
      p_tenant_id: input.tenantId,
      p_idempotency_key: input.idempotencyKey.trim(),
      p_request_fingerprint: input.requestFingerprint.trim(),
      p_encrypted_access_token: input.encryptedAccessTokenCiphertext.trim(),
      p_token_fingerprint: metadata.tokenFingerprint,
      p_credential_family: metadata.credentialFamily,
      p_provider_app_id: metadata.providerAppId,
      p_facebook_page_id: metadata.facebookPageId,
      p_instagram_professional_account_id: metadata.instagramProfessionalAccountId,
      p_granted_scopes: normalizeMetaPageGrantedScopes(metadata.grantedScopes),
      p_token_expires_at: metadata.tokenExpiresAt,
      p_data_access_expires_at: metadata.dataAccessExpiresAt,
      p_provider_token_type: metadata.providerTokenType,
      p_verification_version: metadata.verificationVersion,
      p_verified_at: metadata.verifiedAt,
      p_expected_credential_version: input.expectedCredentialVersion,
      p_credential_id: input.credentialId ?? null,
      p_facebook_connection_id: input.facebookConnectionId,
      p_instagram_connection_id: input.instagramConnectionId ?? null,
      p_requested_channels: [...metadata.requestedChannels]
    };

    try {
      const { data, error } = await this.supabase.rpc(ACTIVATION_RPC_NAME, rpcInput);
      throwIfSupabaseError(error);
      return parseActivationResponse(data);
    } catch (error) {
      if (error instanceof MetaPageCredentialActivationError) throw error;
      mapSupabaseActivationError(error);
    }
  }
}
