import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BindMetaPageChannelConnectionInput,
  CreateVerifiedMetaPageCredentialInput,
  MetaPageBindingLookupInput,
  MetaPageCredentialBindingMetadata,
  MetaPageCredentialLookupInput,
  MetaPageCredentialMaterial,
  MetaPageCredentialMetadata,
  MetaPageCredentialStatus,
  RevokeMetaPageCredentialInput,
  RotateMetaPageCredentialInput
} from "../../../domain/metaPageCredentials.js";
import type { MetaPageCredentialRepository } from "../../../domain/ports.js";
import {
  MetaPageCredentialBindingConflictError,
  MetaPageCredentialConnectionNotFoundError,
  MetaPageCredentialDecryptionFailedError,
  MetaPageCredentialEncryptionUnavailableError,
  MetaPageCredentialFamilyMismatchError,
  MetaPageCredentialInactiveError,
  MetaPageCredentialNotFoundError,
  MetaPageCredentialVersionConflictError
} from "../../../domain/metaPageCredentialErrors.js";
import {
  assertMetaPageCredentialFamily,
  assertMetaPageFacebookLoginAccessTokenShape,
  isMetaPageCredentialResolvableStatus
} from "../../../lib/metaPageCredentialValidation.js";
import {
  META_PAGE_BINDING_METADATA_SELECT,
  META_PAGE_CREDENTIAL_INTERNAL_SELECT,
  META_PAGE_CREDENTIAL_METADATA_SELECT,
  mapMetaPageBindingRow,
  mapMetaPageCredentialRow,
  toMetaPageBindingMetadata,
  toMetaPageCredentialMetadata
} from "../../../lib/metaPageCredentialPublicDto.js";
import {
  decryptChannelCredentialCiphertext,
  encryptChannelCredentialPlaintext,
  resolveChannelCredentialEncryptionKey
} from "../../../lib/channelCredentialEncryption.js";
import { fingerprintSecretValue } from "../../../lib/channelSettingSecrets.js";
import { throwIfSupabaseError } from "../../../lib/supabasePostgrestError.js";

type CredentialDbRow = Parameters<typeof mapMetaPageCredentialRow>[0];
type BindingDbRow = Parameters<typeof mapMetaPageBindingRow>[0];

export {
  MetaPageCredentialBindingConflictError,
  MetaPageCredentialConnectionNotFoundError,
  MetaPageCredentialDecryptionFailedError,
  MetaPageCredentialEncryptionUnavailableError,
  MetaPageCredentialFamilyMismatchError,
  MetaPageCredentialInactiveError,
  MetaPageCredentialNotFoundError,
  MetaPageCredentialVersionConflictError
} from "../../../domain/metaPageCredentialErrors.js";

export class SupabaseMetaPageCredentialRepository implements MetaPageCredentialRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly encryptionKeyMaterial?: string | null
  ) {}

  private resolveEncryptionKeyMaterial(): string {
    const resolved = resolveChannelCredentialEncryptionKey({
      constructorKey: this.encryptionKeyMaterial,
      env: process.env
    });
    if (resolved.status === "missing") {
      throw new MetaPageCredentialEncryptionUnavailableError(
        "Credential encryption key is not configured"
      );
    }
    if (resolved.status === "invalid_format") {
      throw new MetaPageCredentialEncryptionUnavailableError(
        "Credential encryption key format is invalid"
      );
    }
    return resolved.keyMaterial;
  }

  private async assertConnectionOwnedByTenant(
    tenantId: string,
    channelConnectionId: string,
    expectedProvider?: "FACEBOOK" | "INSTAGRAM"
  ): Promise<void> {
    const { data, error } = await this.supabase
      .from("channel_connections")
      .select("id, provider")
      .eq("tenant_id", tenantId)
      .eq("id", channelConnectionId)
      .maybeSingle();
    throwIfSupabaseError(error);
    if (!data) {
      throw new MetaPageCredentialConnectionNotFoundError(
        `Channel connection not found for tenant scope: ${channelConnectionId}`
      );
    }
    if (expectedProvider && data.provider !== expectedProvider) {
      throw new MetaPageCredentialConnectionNotFoundError(
        `Channel connection provider mismatch for binding: ${channelConnectionId}`
      );
    }
  }

  private async loadCredentialRow(
    tenantId: string,
    credentialId: string,
    select = META_PAGE_CREDENTIAL_METADATA_SELECT
  ): Promise<CredentialDbRow | null> {
    const { data, error } = await this.supabase
      .from("meta_page_credentials")
      .select(select)
      .eq("tenant_id", tenantId)
      .eq("id", credentialId)
      .maybeSingle();
    throwIfSupabaseError(error);
    const row = (data as CredentialDbRow | null) ?? null;
    if (!row || row.tenant_id !== tenantId) {
      return null;
    }
    return row;
  }

  private mapCredentialOrThrow(
    row: CredentialDbRow | null,
    tenantId: string,
    credentialId: string
  ): ReturnType<typeof mapMetaPageCredentialRow> {
    if (!row || row.tenant_id !== tenantId) {
      throw new MetaPageCredentialNotFoundError(
        `Meta Page credential not found: ${credentialId}`
      );
    }
    return mapMetaPageCredentialRow(row);
  }

  private async executeVersionedCredentialUpdate(input: {
    tenantId: string;
    credentialId: string;
    expectedCredentialVersion: number;
    expectedCurrentStatus: MetaPageCredentialStatus;
    patch: Record<string, unknown>;
    conflictMessage: string;
  }): Promise<MetaPageCredentialMetadata> {
    const { data, error } = await this.supabase
      .from("meta_page_credentials")
      .update({
        ...input.patch,
        credential_version: input.expectedCredentialVersion + 1,
        updated_at: new Date().toISOString()
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.credentialId)
      .eq("credential_version", input.expectedCredentialVersion)
      .eq("status", input.expectedCurrentStatus)
      .select(META_PAGE_CREDENTIAL_METADATA_SELECT)
      .maybeSingle();
    throwIfSupabaseError(error);
    if (!data) {
      throw new MetaPageCredentialVersionConflictError(input.conflictMessage);
    }
    return toMetaPageCredentialMetadata(mapMetaPageCredentialRow(data as CredentialDbRow));
  }

  async createVerifiedCredential(
    input: CreateVerifiedMetaPageCredentialInput
  ): Promise<MetaPageCredentialMetadata> {
    assertMetaPageCredentialFamily(input.credentialFamily);
    assertMetaPageFacebookLoginAccessTokenShape(input.accessToken);

    const keyMaterial = this.resolveEncryptionKeyMaterial();
    const encrypted = encryptChannelCredentialPlaintext(input.accessToken.trim(), keyMaterial);
    const fingerprint = fingerprintSecretValue(input.accessToken.trim());
    const nowIso = new Date().toISOString();
    const verifiedIso = input.verifiedAt.toISOString();

    const { data, error } = await this.supabase
      .from("meta_page_credentials")
      .insert({
        tenant_id: input.tenantId,
        credential_family: input.credentialFamily,
        provider_app_id: input.providerAppId,
        facebook_page_id: input.facebookPageId,
        instagram_professional_account_id: input.instagramProfessionalAccountId ?? null,
        encrypted_access_token: encrypted,
        token_fingerprint: fingerprint,
        encryption_format_version: "v1",
        key_version: 1,
        credential_version: 1,
        status: "ACTIVE",
        verified_at: verifiedIso,
        last_verified_at: input.lastVerifiedAt?.toISOString() ?? verifiedIso,
        created_at: nowIso,
        updated_at: nowIso
      })
      .select(META_PAGE_CREDENTIAL_METADATA_SELECT)
      .single();
    throwIfSupabaseError(error);
    return toMetaPageCredentialMetadata(mapMetaPageCredentialRow(data as CredentialDbRow));
  }

  async getCredentialById(
    input: MetaPageCredentialLookupInput
  ): Promise<MetaPageCredentialMetadata | null> {
    const row = await this.loadCredentialRow(input.tenantId, input.credentialId);
    if (!row) return null;
    return toMetaPageCredentialMetadata(mapMetaPageCredentialRow(row));
  }

  async getActiveCredentialForBinding(
    input: MetaPageBindingLookupInput
  ): Promise<{
    credential: MetaPageCredentialMetadata;
    binding: MetaPageCredentialBindingMetadata;
  } | null> {
    const { data: bindingData, error: bindingError } = await this.supabase
      .from("meta_page_credential_bindings")
      .select(META_PAGE_BINDING_METADATA_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("channel_connection_id", input.channelConnectionId)
      .eq("binding_status", "ACTIVE")
      .maybeSingle();
    throwIfSupabaseError(bindingError);
    if (!bindingData) return null;

    const binding = toMetaPageBindingMetadata(
      mapMetaPageBindingRow(bindingData as BindingDbRow)
    );
    const credentialRow = await this.loadCredentialRow(
      input.tenantId,
      binding.credentialId
    );
    if (!credentialRow) return null;

    const credential = toMetaPageCredentialMetadata(mapMetaPageCredentialRow(credentialRow));
    if (!isMetaPageCredentialResolvableStatus(credential.status)) {
      return null;
    }
    if (credential.credentialVersion !== binding.credentialVersion) {
      return null;
    }
    return { credential, binding };
  }

  async listBindingsForCredential(input: MetaPageCredentialLookupInput): Promise<MetaPageCredentialBindingMetadata[]> {
    const credential = await this.loadCredentialRow(input.tenantId, input.credentialId);
    if (!credential) {
      throw new MetaPageCredentialNotFoundError(
        `Meta Page credential not found: ${input.credentialId}`
      );
    }

    const { data, error } = await this.supabase
      .from("meta_page_credential_bindings")
      .select(META_PAGE_BINDING_METADATA_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("credential_id", input.credentialId)
      .order("created_at", { ascending: false });
    throwIfSupabaseError(error);
    return ((data as BindingDbRow[] | null) ?? []).map((row) =>
      toMetaPageBindingMetadata(mapMetaPageBindingRow(row))
    );
  }

  async bindChannelConnection(
    input: BindMetaPageChannelConnectionInput
  ): Promise<MetaPageCredentialBindingMetadata> {
    const credentialRow = await this.loadCredentialRow(input.tenantId, input.credentialId);
    const credential = this.mapCredentialOrThrow(
      credentialRow,
      input.tenantId,
      input.credentialId
    );

    if (credential.status === "REVOKED") {
      throw new MetaPageCredentialInactiveError(
        `Meta Page credential is revoked and cannot receive bindings: ${input.credentialId}`
      );
    }
    if (!isMetaPageCredentialResolvableStatus(credential.status)) {
      throw new MetaPageCredentialInactiveError(
        `Meta Page credential is not active for binding: ${input.credentialId}`
      );
    }
    if (credential.credentialVersion !== input.expectedCredentialVersion) {
      throw new MetaPageCredentialVersionConflictError(
        `Meta Page credential version conflict during binding: ${input.credentialId}`
      );
    }
    if (
      input.channelType === "INSTAGRAM" &&
      !credential.instagramProfessionalAccountId
    ) {
      throw new MetaPageCredentialBindingConflictError(
        "Instagram binding requires instagram_professional_account_id on credential"
      );
    }

    await this.assertConnectionOwnedByTenant(
      input.tenantId,
      input.channelConnectionId,
      input.channelType
    );

    const { data: existingActive, error: existingError } = await this.supabase
      .from("meta_page_credential_bindings")
      .select(META_PAGE_BINDING_METADATA_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("channel_connection_id", input.channelConnectionId)
      .eq("binding_status", "ACTIVE")
      .maybeSingle();
    throwIfSupabaseError(existingError);

    if (existingActive) {
      const existing = toMetaPageBindingMetadata(
        mapMetaPageBindingRow(existingActive as BindingDbRow)
      );
      if (
        existing.credentialId === input.credentialId &&
        existing.channelType === input.channelType &&
        existing.credentialVersion === input.expectedCredentialVersion
      ) {
        return existing;
      }
      throw new MetaPageCredentialBindingConflictError(
        `Active Meta Page binding already exists for connection: ${input.channelConnectionId}`
      );
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await this.supabase
      .from("meta_page_credential_bindings")
      .insert({
        tenant_id: input.tenantId,
        credential_id: input.credentialId,
        channel_connection_id: input.channelConnectionId,
        channel_type: input.channelType,
        binding_status: "ACTIVE",
        credential_version: input.expectedCredentialVersion,
        activated_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso
      })
      .select(META_PAGE_BINDING_METADATA_SELECT)
      .single();
    throwIfSupabaseError(error);
    return toMetaPageBindingMetadata(mapMetaPageBindingRow(data as BindingDbRow));
  }

  async rotateCredentialWithExpectedVersion(
    input: RotateMetaPageCredentialInput
  ): Promise<MetaPageCredentialMetadata> {
    assertMetaPageFacebookLoginAccessTokenShape(input.accessToken);
    if (!isMetaPageCredentialResolvableStatus(input.expectedCurrentStatus)) {
      throw new MetaPageCredentialInactiveError(
        `Meta Page credential is not active for rotation: ${input.credentialId}`
      );
    }

    const encrypted = encryptChannelCredentialPlaintext(
      input.accessToken.trim(),
      this.resolveEncryptionKeyMaterial()
    );
    const fingerprint = fingerprintSecretValue(input.accessToken.trim());
    const verifiedIso = (input.lastVerifiedAt ?? new Date()).toISOString();

    return this.executeVersionedCredentialUpdate({
      tenantId: input.tenantId,
      credentialId: input.credentialId,
      expectedCredentialVersion: input.expectedCredentialVersion,
      expectedCurrentStatus: input.expectedCurrentStatus,
      conflictMessage: `Meta Page credential version conflict during rotation: ${input.credentialId}`,
      patch: {
        encrypted_access_token: encrypted,
        token_fingerprint: fingerprint,
        last_verified_at: verifiedIso,
        last_error_sanitized: null
      }
    });
  }

  async revokeCredential(input: RevokeMetaPageCredentialInput): Promise<MetaPageCredentialMetadata> {
    if (input.expectedCurrentStatus === "REVOKED") {
      const current = await this.getCredentialById({
        tenantId: input.tenantId,
        credentialId: input.credentialId
      });
      if (!current) {
        throw new MetaPageCredentialNotFoundError(
          `Meta Page credential not found: ${input.credentialId}`
        );
      }
      return current;
    }

    return this.executeVersionedCredentialUpdate({
      tenantId: input.tenantId,
      credentialId: input.credentialId,
      expectedCredentialVersion: input.expectedCredentialVersion,
      expectedCurrentStatus: input.expectedCurrentStatus,
      conflictMessage: `Meta Page credential version conflict during revoke: ${input.credentialId}`,
      patch: {
        status: "REVOKED",
        last_error_sanitized: input.lastErrorSanitized ?? null
      }
    });
  }

  /** Internal runtime-only — never expose via HTTP API. */
  async retrieveDecryptedMaterial(
    input: MetaPageCredentialLookupInput
  ): Promise<MetaPageCredentialMaterial | null> {
    const row = await this.loadCredentialRow(
      input.tenantId,
      input.credentialId,
      META_PAGE_CREDENTIAL_INTERNAL_SELECT
    );
    if (!row) return null;

    const record = mapMetaPageCredentialRow(row);
    if (!isMetaPageCredentialResolvableStatus(record.status)) {
      return null;
    }

    try {
      const accessToken = decryptChannelCredentialCiphertext(
        record.encryptedAccessToken,
        this.resolveEncryptionKeyMaterial()
      );
      return {
        tenantId: record.tenantId,
        credentialId: record.id,
        accessToken,
        credentialVersion: record.credentialVersion,
        facebookPageId: record.facebookPageId,
        instagramProfessionalAccountId: record.instagramProfessionalAccountId
      };
    } catch {
      throw new MetaPageCredentialDecryptionFailedError(
        "Meta Page credential decryption failed"
      );
    }
  }
}
