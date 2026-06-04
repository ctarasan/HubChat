import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ChannelConnectionPublicDto,
  ChannelConnectionRecord,
  ChannelCredentialMetadataDto,
  ChannelCredentialRuntimeSecret,
  ChannelCredentialType,
  CreateChannelConnectionInput,
  FindChannelConnectionByAccountInput,
  StoreChannelCredentialInput,
  UpdateChannelConnectHealthInput,
  UpdateChannelConnectionLifecycleInput,
  UpdateChannelConnectionWebhookInput
} from "../../../domain/channelConnections.js";
import type { ChannelConnectionRepository } from "../../../domain/ports.js";
import {
  assertChannelConnectionStatusTransition,
  generatePublicConnectionKey,
  normalizeChannelConnectProvider,
  normalizeChannelConnectionStatus
} from "../../../lib/channelConnectionLifecycle.js";
import {
  CHANNEL_CONNECTION_PUBLIC_SELECT,
  CHANNEL_CREDENTIAL_INTERNAL_SELECT,
  CHANNEL_CREDENTIAL_METADATA_SELECT,
  mapChannelConnectionRow,
  mapChannelCredentialMetadataRow,
  sanitizeChannelConnectionErrorMessage,
  toChannelConnectionPublicDto,
  toChannelCredentialMetadataDto
} from "../../../lib/channelConnectionPublicDto.js";
import {
  decryptChannelCredentialCiphertext,
  encryptChannelCredentialPlaintext,
  readChannelCredentialEncryptionKeyFromEnv
} from "../../../lib/channelCredentialEncryption.js";
import { fingerprintSecretValue } from "../../../lib/channelSettingSecrets.js";
import { throwIfSupabaseError } from "../../../lib/supabasePostgrestError.js";

type ConnectionDbRow = Parameters<typeof mapChannelConnectionRow>[0];
type CredentialDbRow = Parameters<typeof mapChannelCredentialMetadataRow>[0];

export class ChannelConnectionNotFoundError extends Error {
  override readonly name = "ChannelConnectionNotFoundError";
}

export class SupabaseChannelConnectionRepository implements ChannelConnectionRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly encryptionKeyMaterial?: string | null
  ) {}

  private resolveEncryptionKeyMaterial(): string {
    const configured =
      this.encryptionKeyMaterial ?? readChannelCredentialEncryptionKeyFromEnv() ?? "";
    if (!configured.trim()) {
      throw new Error("Credential encryption key is not configured");
    }
    return configured;
  }

  private async loadConnectionRow(tenantId: string, connectionId: string): Promise<ConnectionDbRow | null> {
    const { data, error } = await this.supabase
      .from("channel_connections")
      .select(CHANNEL_CONNECTION_PUBLIC_SELECT)
      .eq("tenant_id", tenantId)
      .eq("id", connectionId)
      .maybeSingle();
    throwIfSupabaseError(error);
    return (data as ConnectionDbRow | null) ?? null;
  }

  private mapOrThrow(row: ConnectionDbRow | null, tenantId: string, connectionId: string): ChannelConnectionRecord {
    if (!row) {
      throw new ChannelConnectionNotFoundError(`Channel connection not found: ${connectionId}`);
    }
    if (row.tenant_id !== tenantId) {
      throw new ChannelConnectionNotFoundError(`Channel connection not found: ${connectionId}`);
    }
    return mapChannelConnectionRow(row);
  }

  async createConnection(input: CreateChannelConnectionInput): Promise<ChannelConnectionRecord> {
    const provider = normalizeChannelConnectProvider(input.provider);
    const status = input.status ? normalizeChannelConnectionStatus(input.status) : "DRAFT";
    const publicConnectionKey = input.publicConnectionKey?.trim() || generatePublicConnectionKey();
    const nowIso = new Date().toISOString();

    const { data, error } = await this.supabase
      .from("channel_connections")
      .insert({
        tenant_id: input.tenantId,
        provider,
        status,
        provider_account_id: input.providerAccountId ?? null,
        provider_account_name: input.providerAccountName ?? null,
        provider_page_id: input.providerPageId ?? null,
        provider_ig_account_id: input.providerIgAccountId ?? null,
        public_connection_key: publicConnectionKey,
        webhook_endpoint: input.webhookEndpoint ?? null,
        connected_by: input.connectedBy ?? null,
        created_at: nowIso,
        updated_at: nowIso
      })
      .select(CHANNEL_CONNECTION_PUBLIC_SELECT)
      .single();
    throwIfSupabaseError(error);
    return mapChannelConnectionRow(data as ConnectionDbRow);
  }

  async findById(tenantId: string, connectionId: string): Promise<ChannelConnectionRecord | null> {
    const row = await this.loadConnectionRow(tenantId, connectionId);
    return row ? mapChannelConnectionRow(row) : null;
  }

  async findByTenantAndProvider(tenantId: string, provider: CreateChannelConnectionInput["provider"]) {
    const normalized = normalizeChannelConnectProvider(provider);
    const { data, error } = await this.supabase
      .from("channel_connections")
      .select(CHANNEL_CONNECTION_PUBLIC_SELECT)
      .eq("tenant_id", tenantId)
      .eq("provider", normalized)
      .maybeSingle();
    throwIfSupabaseError(error);
    return data ? mapChannelConnectionRow(data as ConnectionDbRow) : null;
  }

  async findByTenantProviderAccount(input: FindChannelConnectionByAccountInput) {
    const provider = normalizeChannelConnectProvider(input.provider);
    const accountId = input.providerAccountId.trim();
    if (!accountId) return null;
    const { data, error } = await this.supabase
      .from("channel_connections")
      .select(CHANNEL_CONNECTION_PUBLIC_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("provider", provider)
      .eq("provider_account_id", accountId)
      .maybeSingle();
    throwIfSupabaseError(error);
    return data ? mapChannelConnectionRow(data as ConnectionDbRow) : null;
  }

  async findByPublicConnectionKey(publicConnectionKey: string): Promise<ChannelConnectionRecord | null> {
    const key = publicConnectionKey.trim();
    if (!key) return null;
    const { data, error } = await this.supabase
      .from("channel_connections")
      .select(CHANNEL_CONNECTION_PUBLIC_SELECT)
      .eq("public_connection_key", key)
      .maybeSingle();
    throwIfSupabaseError(error);
    return data ? mapChannelConnectionRow(data as ConnectionDbRow) : null;
  }

  async updateLifecycleStatus(input: UpdateChannelConnectionLifecycleInput): Promise<ChannelConnectionRecord> {
    const existing = await this.loadConnectionRow(input.tenantId, input.connectionId);
    const current = this.mapOrThrow(existing, input.tenantId, input.connectionId);
    const nextStatus = normalizeChannelConnectionStatus(input.status);
    assertChannelConnectionStatusTransition(current.status, nextStatus);

    const patch: Record<string, unknown> = {
      status: nextStatus,
      updated_at: new Date().toISOString()
    };
    if (input.connectedAt !== undefined) {
      patch.connected_at = input.connectedAt ? input.connectedAt.toISOString() : null;
    }
    if (input.connectedBy !== undefined) {
      patch.connected_by = input.connectedBy;
    }

    const { data, error } = await this.supabase
      .from("channel_connections")
      .update(patch)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.connectionId)
      .select(CHANNEL_CONNECTION_PUBLIC_SELECT)
      .single();
    throwIfSupabaseError(error);
    return mapChannelConnectionRow(data as ConnectionDbRow);
  }

  async updateWebhookStatus(input: UpdateChannelConnectionWebhookInput): Promise<ChannelConnectionRecord> {
    const existing = await this.loadConnectionRow(input.tenantId, input.connectionId);
    const current = this.mapOrThrow(existing, input.tenantId, input.connectionId);
    const patch: Record<string, unknown> = {
      webhook_active: input.webhookActive,
      updated_at: new Date().toISOString()
    };
    if (input.webhookEndpoint !== undefined) {
      patch.webhook_endpoint = input.webhookEndpoint;
    }
    if (input.status) {
      const nextStatus = normalizeChannelConnectionStatus(input.status);
      assertChannelConnectionStatusTransition(current.status, nextStatus);
      patch.status = nextStatus;
    }

    const { data, error } = await this.supabase
      .from("channel_connections")
      .update(patch)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.connectionId)
      .select(CHANNEL_CONNECTION_PUBLIC_SELECT)
      .single();
    throwIfSupabaseError(error);
    return mapChannelConnectionRow(data as ConnectionDbRow);
  }

  async updateHealthFields(input: UpdateChannelConnectHealthInput): Promise<ChannelConnectionRecord> {
    const existing = await this.loadConnectionRow(input.tenantId, input.connectionId);
    const current = this.mapOrThrow(existing, input.tenantId, input.connectionId);
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (input.lastInboundVerifiedAt !== undefined) {
      patch.last_inbound_verified_at = input.lastInboundVerifiedAt
        ? input.lastInboundVerifiedAt.toISOString()
        : null;
    }
    if (input.lastOutboundVerifiedAt !== undefined) {
      patch.last_outbound_verified_at = input.lastOutboundVerifiedAt
        ? input.lastOutboundVerifiedAt.toISOString()
        : null;
    }
    if (input.lastHealthCheckAt !== undefined) {
      patch.last_health_check_at = input.lastHealthCheckAt ? input.lastHealthCheckAt.toISOString() : null;
    }
    if (input.lastErrorCode !== undefined) {
      patch.last_error_code = input.lastErrorCode;
    }
    if (input.lastErrorMessageSafe !== undefined) {
      patch.last_error_message_safe = input.lastErrorMessageSafe
        ? sanitizeChannelConnectionErrorMessage(input.lastErrorMessageSafe)
        : null;
    }
    if (input.status) {
      const nextStatus = normalizeChannelConnectionStatus(input.status);
      assertChannelConnectionStatusTransition(current.status, nextStatus);
      patch.status = nextStatus;
    }

    const { data, error } = await this.supabase
      .from("channel_connections")
      .update(patch)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.connectionId)
      .select(CHANNEL_CONNECTION_PUBLIC_SELECT)
      .single();
    throwIfSupabaseError(error);
    return mapChannelConnectionRow(data as ConnectionDbRow);
  }

  async findPublicConnectionSummary(
    tenantId: string,
    connectionId: string
  ): Promise<ChannelConnectionPublicDto | null> {
    const connection = await this.findById(tenantId, connectionId);
    if (!connection) return null;
    const credentialMetadata = await this.listCredentialMetadataByConnection(tenantId, connectionId);
    return toChannelConnectionPublicDto({ connection, credentialMetadata });
  }

  async listCredentialMetadataByConnection(
    tenantId: string,
    connectionId: string
  ): Promise<ChannelCredentialMetadataDto[]> {
    const { data, error } = await this.supabase
      .from("channel_credentials")
      .select(CHANNEL_CREDENTIAL_METADATA_SELECT)
      .eq("tenant_id", tenantId)
      .eq("connection_id", connectionId)
      .order("credential_type", { ascending: true });
    throwIfSupabaseError(error);
    return (data ?? []).map((row) => toChannelCredentialMetadataDto(mapChannelCredentialMetadataRow(row as CredentialDbRow)));
  }

  async storeEncryptedCredential(input: StoreChannelCredentialInput): Promise<ChannelCredentialMetadataDto> {
    await this.loadConnectionRow(input.tenantId, input.connectionId);
    const provider = normalizeChannelConnectProvider(input.provider);
    const encrypted = encryptChannelCredentialPlaintext(
      input.plaintextSecret,
      this.resolveEncryptionKeyMaterial()
    );
    const fingerprint = fingerprintSecretValue(input.plaintextSecret.trim());
    const nowIso = new Date().toISOString();
    const credentialState = input.credentialState ?? "SET";

    const { data, error } = await this.supabase
      .from("channel_credentials")
      .upsert(
        {
          tenant_id: input.tenantId,
          connection_id: input.connectionId,
          provider,
          credential_type: input.credentialType,
          encrypted_secret_value: encrypted,
          secret_fingerprint: fingerprint,
          token_expires_at: input.tokenExpiresAt ? input.tokenExpiresAt.toISOString() : null,
          credential_state: credentialState,
          updated_at: nowIso
        },
        { onConflict: "connection_id,credential_type" }
      )
      .select(CHANNEL_CREDENTIAL_METADATA_SELECT)
      .single();
    throwIfSupabaseError(error);
    return toChannelCredentialMetadataDto(mapChannelCredentialMetadataRow(data as CredentialDbRow));
  }

  async retrieveDecryptedCredentialForRuntime(input: {
    tenantId: string;
    connectionId: string;
    credentialType: ChannelCredentialType;
  }): Promise<ChannelCredentialRuntimeSecret | null> {
    const { data, error } = await this.supabase
      .from("channel_credentials")
      .select(CHANNEL_CREDENTIAL_INTERNAL_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("connection_id", input.connectionId)
      .eq("credential_type", input.credentialType)
      .maybeSingle();
    throwIfSupabaseError(error);
    if (!data) return null;

    const row = data as CredentialDbRow & { encrypted_secret_value?: string };
    if (row.tenant_id !== input.tenantId) return null;
    const encrypted = typeof row.encrypted_secret_value === "string" ? row.encrypted_secret_value : "";
    if (!encrypted.trim()) return null;

    const plaintextSecret = decryptChannelCredentialCiphertext(encrypted, this.resolveEncryptionKeyMaterial());
    return {
      tenantId: input.tenantId,
      connectionId: input.connectionId,
      provider: row.provider as ChannelCredentialRuntimeSecret["provider"],
      credentialType: input.credentialType,
      plaintextSecret,
      tokenExpiresAt: row.token_expires_at ? new Date(row.token_expires_at) : null
    };
  }
}
