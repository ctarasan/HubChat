import type {
  MetaPageCredentialBindingMetadata,
  MetaPageCredentialMaterial,
  MetaPageCredentialMetadata
} from "../../domain/metaPageCredentials.js";
import {
  MetaPageCredentialDecryptionFailedError,
  MetaPageCredentialEncryptionUnavailableError
} from "../../domain/metaPageCredentialErrors.js";
import {
  MetaPageCredentialRuntimeResolverError,
  type MetaPageCredentialRuntimeDiagnosticCode
} from "../../domain/metaPageCredentialRuntimeResolver.js";
import type { MetaPageCredentialRepository } from "../../domain/ports.js";

export type ResolveMetaPageRuntimeCredentialInput = {
  tenantId: string;
  channelConnectionId: string;
};

export type ResolvedMetaPageRuntimeCredential = {
  credential: MetaPageCredentialMetadata;
  binding: MetaPageCredentialBindingMetadata;
  material: MetaPageCredentialMaterial;
};

export type ResolveMetaPageRuntimeCredentialResult =
  | { outcome: "unmanaged" }
  | { outcome: "resolved"; resolved: ResolvedMetaPageRuntimeCredential };

function failClosed(
  diagnosticCode: MetaPageCredentialRuntimeDiagnosticCode,
  message: string
): never {
  throw new MetaPageCredentialRuntimeResolverError(message, diagnosticCode, true);
}

export async function resolveMetaPageRuntimeCredentialForFacebook(
  repository: MetaPageCredentialRepository,
  input: ResolveMetaPageRuntimeCredentialInput
): Promise<ResolveMetaPageRuntimeCredentialResult> {
  const tenantId = input.tenantId.trim();
  const channelConnectionId = input.channelConnectionId.trim();
  if (!tenantId || !channelConnectionId) {
    failClosed("credential_state_invalid", "Meta Page credential binding scope is invalid.");
  }

  const bindings = await repository.listBindingsForChannelConnection({
    tenantId,
    channelConnectionId
  });

  if (bindings.length === 0) {
    return { outcome: "unmanaged" };
  }

  if (bindings.length > 1) {
    failClosed(
      "ambiguous_binding",
      "Meta Page credential binding is ambiguous for this Facebook connection."
    );
  }

  const binding = bindings[0]!;
  if (binding.tenantId !== tenantId) {
    failClosed("credential_state_invalid", "Meta Page credential tenant scope mismatch.");
  }
  if (binding.channelConnectionId !== channelConnectionId) {
    failClosed("credential_state_invalid", "Meta Page credential connection scope mismatch.");
  }
  if (binding.channelType !== "FACEBOOK") {
    failClosed(
      "binding_channel_mismatch",
      "Meta Page credential binding channel type is not compatible with Facebook outbound."
    );
  }
  if (binding.bindingStatus !== "ACTIVE") {
    failClosed("binding_inactive", "Meta Page credential binding is not active.");
  }

  const active = await repository.getActiveCredentialForBinding({
    tenantId,
    channelConnectionId
  });
  if (!active) {
    failClosed(
      "credential_state_invalid",
      "Meta Page credential is unavailable for this Facebook connection."
    );
  }

  if (active.binding.id !== binding.id) {
    failClosed("ambiguous_binding", "Meta Page credential binding is ambiguous for this Facebook connection.");
  }

  let material: MetaPageCredentialMaterial | null;
  try {
    material = await repository.retrieveDecryptedMaterial({
      tenantId,
      credentialId: active.credential.id
    });
  } catch (err) {
    if (
      err instanceof MetaPageCredentialDecryptionFailedError ||
      err instanceof MetaPageCredentialEncryptionUnavailableError
    ) {
      failClosed("credential_decrypt_failed", "Meta Page credential decryption failed.");
    }
    throw err;
  }

  if (!material?.accessToken?.trim()) {
    failClosed("credential_decrypt_failed", "Meta Page credential decryption failed.");
  }
  if (material.credentialVersion !== active.credential.credentialVersion) {
    failClosed("credential_state_invalid", "Meta Page credential version is inconsistent.");
  }
  if (material.tenantId !== tenantId) {
    failClosed("credential_state_invalid", "Meta Page credential tenant scope mismatch.");
  }

  return {
    outcome: "resolved",
    resolved: {
      credential: active.credential,
      binding: active.binding,
      material
    }
  };
}

export function toMetaPageRuntimeResolverLogPayload(input: {
  tenantId: string;
  channelConnectionId: string;
  credentialId: string;
  credentialVersion: number;
  facebookPageId: string;
}): Record<string, unknown> {
  return {
    event: "meta_page_runtime_credential_resolved",
    tenantId: input.tenantId,
    channelConnectionId: input.channelConnectionId,
    credentialId: input.credentialId,
    credentialVersion: input.credentialVersion,
    facebookPageIdPrefix: input.facebookPageId.slice(0, 4),
    facebookPageIdLength: input.facebookPageId.length
  };
}
