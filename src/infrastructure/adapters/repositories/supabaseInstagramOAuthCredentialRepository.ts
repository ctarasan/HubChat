import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ActivateInstagramOAuthCredentialInput,
  CreateInstagramOAuthPendingCredentialInput,
  DisconnectInstagramOAuthCredentialInput,
  InstagramOAuthCredentialLookupInput,
  InstagramOAuthCredentialMaterial,
  InstagramOAuthCredentialMetadata,
  InstagramOAuthCredentialRecord,
  InstagramOAuthCredentialStatus,
  MarkInstagramOAuthReauthRequiredInput,
  MarkInstagramOAuthRevokedInput,
  ReplaceInstagramOAuthAccessTokenInput,
  UpdateInstagramOAuthLifecycleInput
} from "../../../domain/instagramOAuthCredentials.js";
import type { InstagramOAuthCredentialRepository } from "../../../domain/ports.js";
import {
  assertInstagramOAuthCredentialTransition,
  InstagramOAuthCredentialTransitionError,
  isInstagramOAuthActiveCredentialStatus,
  isInstagramOAuthLifecycleOnlyCredentialStatus
} from "../../../lib/instagramOAuthCredentialLifecycle.js";
import {
  INSTAGRAM_OAUTH_CREDENTIAL_INTERNAL_SELECT,
  INSTAGRAM_OAUTH_CREDENTIAL_METADATA_SELECT,
  mapInstagramOAuthCredentialRow,
  toInstagramOAuthCredentialMetadata
} from "../../../lib/instagramOAuthCredentialPublicDto.js";
import {
  ChannelCredentialEncryptionError,
  decryptChannelCredentialCiphertext,
  encryptChannelCredentialPlaintext,
  resolveChannelCredentialEncryptionKey
} from "../../../lib/channelCredentialEncryption.js";
import { fingerprintSecretValue } from "../../../lib/channelSettingSecrets.js";
import { throwIfSupabaseError } from "../../../lib/supabasePostgrestError.js";

type CredentialDbRow = Parameters<typeof mapInstagramOAuthCredentialRow>[0];

export class InstagramOAuthCredentialNotFoundError extends Error {
  override readonly name = "InstagramOAuthCredentialNotFoundError";
}

export class InstagramOAuthCredentialConnectionNotFoundError extends Error {
  override readonly name = "InstagramOAuthCredentialConnectionNotFoundError";
}

export class InstagramOAuthCredentialVersionConflictError extends Error {
  override readonly name = "InstagramOAuthCredentialVersionConflictError";
}

export class SupabaseInstagramOAuthCredentialRepository implements InstagramOAuthCredentialRepository {
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
      throw new Error("Credential encryption key is not configured");
    }
    if (resolved.status === "invalid_format") {
      throw new ChannelCredentialEncryptionError("Credential encryption key format is invalid");
    }
    return resolved.keyMaterial;
  }

  private assertNonEmptyAccessToken(accessToken: string): void {
    if (!accessToken.trim()) {
      throw new ChannelCredentialEncryptionError("Credential plaintext cannot be empty");
    }
  }

  private async assertConnectionOwnedByTenant(tenantId: string, channelConnectionId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from("channel_connections")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", channelConnectionId)
      .maybeSingle();
    throwIfSupabaseError(error);
    if (!data) {
      throw new InstagramOAuthCredentialConnectionNotFoundError(
        `Channel connection not found for tenant scope: ${channelConnectionId}`
      );
    }
  }

  private async loadCredentialRow(
    tenantId: string,
    channelConnectionId: string,
    credentialId: string,
    select = INSTAGRAM_OAUTH_CREDENTIAL_METADATA_SELECT
  ): Promise<CredentialDbRow | null> {
    const { data, error } = await this.supabase
      .from("instagram_oauth_credentials")
      .select(select)
      .eq("tenant_id", tenantId)
      .eq("channel_connection_id", channelConnectionId)
      .eq("id", credentialId)
      .maybeSingle();
    throwIfSupabaseError(error);
    const row = (data as CredentialDbRow | null) ?? null;
    if (!row || row.tenant_id !== tenantId || row.channel_connection_id !== channelConnectionId) {
      return null;
    }
    return row;
  }

  private mapOrThrow(
    row: CredentialDbRow | null,
    tenantId: string,
    channelConnectionId: string,
    credentialId: string
  ): InstagramOAuthCredentialRecord {
    if (!row) {
      throw new InstagramOAuthCredentialNotFoundError(
        `Instagram OAuth credential not found: ${credentialId}`
      );
    }
    if (row.tenant_id !== tenantId || row.channel_connection_id !== channelConnectionId) {
      throw new InstagramOAuthCredentialNotFoundError(
        `Instagram OAuth credential not found: ${credentialId}`
      );
    }
    return mapInstagramOAuthCredentialRow(row);
  }

  private async executeVersionedUpdate(input: {
    tenantId: string;
    channelConnectionId: string;
    credentialId: string;
    expectedCredentialVersion: number;
    expectedCurrentStatus: InstagramOAuthCredentialStatus;
    patch: Record<string, unknown>;
    conflictMessage: string;
  }): Promise<InstagramOAuthCredentialMetadata> {
    const { data, error } = await this.supabase
      .from("instagram_oauth_credentials")
      .update({
        ...input.patch,
        credential_version: input.expectedCredentialVersion + 1,
        updated_at: new Date().toISOString()
      })
      .eq("tenant_id", input.tenantId)
      .eq("channel_connection_id", input.channelConnectionId)
      .eq("id", input.credentialId)
      .eq("credential_version", input.expectedCredentialVersion)
      .eq("credential_status", input.expectedCurrentStatus)
      .select(INSTAGRAM_OAUTH_CREDENTIAL_METADATA_SELECT)
      .maybeSingle();
    throwIfSupabaseError(error);
    if (!data) {
      throw new InstagramOAuthCredentialVersionConflictError(input.conflictMessage);
    }
    return toInstagramOAuthCredentialMetadata(mapInstagramOAuthCredentialRow(data as CredentialDbRow));
  }

  async createPending(
    input: CreateInstagramOAuthPendingCredentialInput
  ): Promise<InstagramOAuthCredentialMetadata> {
    await this.assertConnectionOwnedByTenant(input.tenantId, input.channelConnectionId);
    const nowIso = new Date().toISOString();
    const { data, error } = await this.supabase
      .from("instagram_oauth_credentials")
      .insert({
        tenant_id: input.tenantId,
        channel_connection_id: input.channelConnectionId,
        provider: "INSTAGRAM",
        auth_family: input.authFamily,
        credential_status: "PENDING",
        connected_by_sales_agent_id: input.connectedBySalesAgentId ?? null,
        granted_scopes: input.grantedScopes ?? null,
        created_at: nowIso,
        updated_at: nowIso
      })
      .select(INSTAGRAM_OAUTH_CREDENTIAL_METADATA_SELECT)
      .single();
    throwIfSupabaseError(error);
    return toInstagramOAuthCredentialMetadata(mapInstagramOAuthCredentialRow(data as CredentialDbRow));
  }

  async activate(input: ActivateInstagramOAuthCredentialInput): Promise<InstagramOAuthCredentialMetadata> {
    this.assertNonEmptyAccessToken(input.accessToken);
    const existing = await this.loadCredentialRow(
      input.tenantId,
      input.channelConnectionId,
      input.credentialId
    );
    const current = this.mapOrThrow(
      existing,
      input.tenantId,
      input.channelConnectionId,
      input.credentialId
    );
    assertInstagramOAuthCredentialTransition(current.credentialStatus, "ACTIVE");

    const encrypted = encryptChannelCredentialPlaintext(
      input.accessToken,
      this.resolveEncryptionKeyMaterial()
    );
    const fingerprint = fingerprintSecretValue(input.accessToken.trim());
    const nowIso = new Date().toISOString();

    return this.executeVersionedUpdate({
      tenantId: input.tenantId,
      channelConnectionId: input.channelConnectionId,
      credentialId: input.credentialId,
      expectedCredentialVersion: current.credentialVersion,
      expectedCurrentStatus: current.credentialStatus,
      conflictMessage: `Instagram OAuth credential version conflict during activate: ${input.credentialId}`,
      patch: {
        credential_status: "ACTIVE",
        access_token_ciphertext: encrypted,
        secret_fingerprint: fingerprint,
        token_expires_at: input.tokenExpiresAt.toISOString(),
        refresh_eligible_at: input.refreshEligibleAt.toISOString(),
        provider_instagram_account_id: input.providerInstagramAccountId,
        provider_user_id: input.providerUserId ?? null,
        granted_scopes: input.grantedScopes ?? current.grantedScopes,
        connected_by_sales_agent_id:
          input.connectedBySalesAgentId ?? current.connectedBySalesAgentId,
        connected_at: nowIso,
        connection_health_status: "UNKNOWN"
      }
    });
  }

  async findByConnection(
    input: InstagramOAuthCredentialLookupInput
  ): Promise<InstagramOAuthCredentialMetadata[]> {
    const { data, error } = await this.supabase
      .from("instagram_oauth_credentials")
      .select(INSTAGRAM_OAUTH_CREDENTIAL_METADATA_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("channel_connection_id", input.channelConnectionId)
      .order("created_at", { ascending: false });
    throwIfSupabaseError(error);
    return ((data as CredentialDbRow[] | null) ?? []).map((row) =>
      toInstagramOAuthCredentialMetadata(mapInstagramOAuthCredentialRow(row))
    );
  }

  async findActiveByConnection(
    input: InstagramOAuthCredentialLookupInput
  ): Promise<InstagramOAuthCredentialMetadata | null> {
    const rows = await this.findByConnection(input);
    const active = rows.find((row) => isInstagramOAuthActiveCredentialStatus(row.credentialStatus));
    return active ?? null;
  }

  async updateLifecycle(input: UpdateInstagramOAuthLifecycleInput): Promise<InstagramOAuthCredentialMetadata> {
    if (!isInstagramOAuthLifecycleOnlyCredentialStatus(input.credentialStatus)) {
      throw new InstagramOAuthCredentialTransitionError(
        `Instagram OAuth credential status ${input.credentialStatus} requires token replacement`
      );
    }
    assertInstagramOAuthCredentialTransition(input.expectedCurrentStatus, input.credentialStatus);

    const patch: Record<string, unknown> = {
      credential_status: input.credentialStatus
    };
    if (input.connectionHealthStatus !== undefined) {
      patch.connection_health_status = input.connectionHealthStatus;
    }
    if (input.lastRefreshStatus !== undefined) {
      patch.last_refresh_status = input.lastRefreshStatus;
      patch.last_refresh_at = new Date().toISOString();
    }
    if (input.lastRefreshErrorCode !== undefined) {
      patch.last_refresh_error_code = input.lastRefreshErrorCode;
    }
    if (input.tokenExpiresAt !== undefined) {
      patch.token_expires_at = input.tokenExpiresAt ? input.tokenExpiresAt.toISOString() : null;
    }
    if (input.refreshEligibleAt !== undefined) {
      patch.refresh_eligible_at = input.refreshEligibleAt ? input.refreshEligibleAt.toISOString() : null;
    }
    if (input.reauthRequiredAt !== undefined) {
      patch.reauth_required_at = input.reauthRequiredAt ? input.reauthRequiredAt.toISOString() : null;
    }
    if (input.revokedAt !== undefined) {
      patch.revoked_at = input.revokedAt ? input.revokedAt.toISOString() : null;
    }

    return this.executeVersionedUpdate({
      tenantId: input.tenantId,
      channelConnectionId: input.channelConnectionId,
      credentialId: input.credentialId,
      expectedCredentialVersion: input.expectedCredentialVersion,
      expectedCurrentStatus: input.expectedCurrentStatus,
      conflictMessage: `Instagram OAuth credential version conflict during lifecycle update: ${input.credentialId}`,
      patch
    });
  }

  async replaceAccessTokenAtomically(
    input: ReplaceInstagramOAuthAccessTokenInput
  ): Promise<InstagramOAuthCredentialMetadata> {
    this.assertNonEmptyAccessToken(input.accessToken);
    if (!isInstagramOAuthActiveCredentialStatus(input.expectedCurrentStatus)) {
      throw new InstagramOAuthCredentialNotFoundError(
        `Instagram OAuth credential is not active for token replacement: ${input.credentialId}`
      );
    }

    const nextStatus = input.credentialStatus ?? input.expectedCurrentStatus;
    if (nextStatus !== input.expectedCurrentStatus) {
      assertInstagramOAuthCredentialTransition(input.expectedCurrentStatus, nextStatus);
    }

    const encrypted = encryptChannelCredentialPlaintext(
      input.accessToken,
      this.resolveEncryptionKeyMaterial()
    );
    const fingerprint = fingerprintSecretValue(input.accessToken.trim());
    const nowIso = new Date().toISOString();

    return this.executeVersionedUpdate({
      tenantId: input.tenantId,
      channelConnectionId: input.channelConnectionId,
      credentialId: input.credentialId,
      expectedCredentialVersion: input.expectedCredentialVersion,
      expectedCurrentStatus: input.expectedCurrentStatus,
      conflictMessage: `Instagram OAuth credential version conflict during token replace: ${input.credentialId}`,
      patch: {
        access_token_ciphertext: encrypted,
        secret_fingerprint: fingerprint,
        token_expires_at: input.tokenExpiresAt.toISOString(),
        refresh_eligible_at: input.refreshEligibleAt ? input.refreshEligibleAt.toISOString() : null,
        last_refresh_at: nowIso,
        last_refresh_status: input.lastRefreshStatus,
        last_refresh_error_code: input.lastRefreshErrorCode ?? null,
        credential_status: nextStatus
      }
    });
  }

  async markReauthRequired(
    input: MarkInstagramOAuthReauthRequiredInput
  ): Promise<InstagramOAuthCredentialMetadata> {
    return this.updateLifecycle({
      tenantId: input.tenantId,
      channelConnectionId: input.channelConnectionId,
      credentialId: input.credentialId,
      expectedCredentialVersion: input.expectedCredentialVersion,
      expectedCurrentStatus: input.expectedCurrentStatus,
      credentialStatus: "REAUTH_REQUIRED",
      lastRefreshStatus: "TERMINAL_FAILURE",
      lastRefreshErrorCode: input.errorCode ?? null,
      reauthRequiredAt: new Date()
    });
  }

  async markRevoked(input: MarkInstagramOAuthRevokedInput): Promise<InstagramOAuthCredentialMetadata> {
    assertInstagramOAuthCredentialTransition(input.expectedCurrentStatus, "REVOKED");
    return this.updateLifecycle({
      tenantId: input.tenantId,
      channelConnectionId: input.channelConnectionId,
      credentialId: input.credentialId,
      expectedCredentialVersion: input.expectedCredentialVersion,
      expectedCurrentStatus: input.expectedCurrentStatus,
      credentialStatus: "REVOKED",
      revokedAt: new Date()
    });
  }

  async disconnect(
    input: DisconnectInstagramOAuthCredentialInput
  ): Promise<InstagramOAuthCredentialMetadata> {
    return this.updateLifecycle({
      tenantId: input.tenantId,
      channelConnectionId: input.channelConnectionId,
      credentialId: input.credentialId,
      expectedCredentialVersion: input.expectedCredentialVersion,
      expectedCurrentStatus: input.expectedCurrentStatus,
      credentialStatus: "DISCONNECTED"
    });
  }

  async retrieveDecryptedMaterial(input: {
    tenantId: string;
    channelConnectionId: string;
    credentialId: string;
  }): Promise<InstagramOAuthCredentialMaterial | null> {
    const { data, error } = await this.supabase
      .from("instagram_oauth_credentials")
      .select(INSTAGRAM_OAUTH_CREDENTIAL_INTERNAL_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("channel_connection_id", input.channelConnectionId)
      .eq("id", input.credentialId)
      .maybeSingle();
    throwIfSupabaseError(error);
    if (!data) return null;

    const row = data as CredentialDbRow & { access_token_ciphertext?: string };
    if (row.tenant_id !== input.tenantId || row.channel_connection_id !== input.channelConnectionId) {
      return null;
    }
    const encrypted =
      typeof row.access_token_ciphertext === "string" ? row.access_token_ciphertext : "";
    if (!encrypted.trim()) return null;

    const accessToken = decryptChannelCredentialCiphertext(encrypted, this.resolveEncryptionKeyMaterial());
    return {
      tenantId: input.tenantId,
      channelConnectionId: input.channelConnectionId,
      credentialId: input.credentialId,
      accessToken,
      tokenExpiresAt: row.token_expires_at ? new Date(row.token_expires_at) : null,
      credentialVersion: row.credential_version
    };
  }
}
