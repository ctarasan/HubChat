import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BindOAuthResumeSessionInput,
  ConsumeOAuthStateInput,
  CreateOAuthTransactionInput,
  FacebookOAuthPageCandidate,
  OAuthErrorCategory,
  OAuthTransactionRecord,
  OAuthTransactionStage,
  UpdateOAuthTransactionStatusInput
} from "../../../domain/oauthTransactions.js";
import type { OAuthTransactionRepository } from "../../../domain/ports.js";
import {
  ChannelCredentialEncryptionError,
  decryptChannelCredentialCiphertext,
  encryptChannelCredentialPlaintext,
  resolveChannelCredentialEncryptionKey
} from "../../../lib/channelCredentialEncryption.js";
import { isFacebookOAuthTransactionExpired } from "../../../lib/facebookOAuthSecurity.js";
import { throwIfSupabaseError } from "../../../lib/supabasePostgrestError.js";

type OAuthTransactionRow = {
  id: string;
  tenant_id: string;
  connection_id: string;
  provider: string;
  state_hash: string;
  resume_session_hash: string | null;
  status: string;
  initiated_by_auth_user_id: string;
  initiated_by_sales_agent_id: string;
  encrypted_user_token: string | null;
  user_token_expires_at: string | null;
  page_candidates_json: FacebookOAuthPageCandidate[] | null;
  selected_page_id: string | null;
  error_category: string | null;
  callback_received_at: string | null;
  consumed_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

const OAUTH_TRANSACTION_SELECT =
  "id,tenant_id,connection_id,provider,state_hash,resume_session_hash,status,initiated_by_auth_user_id,initiated_by_sales_agent_id,encrypted_user_token,user_token_expires_at,page_candidates_json,selected_page_id,error_category,callback_received_at,consumed_at,expires_at,created_at,updated_at";

export class OAuthTransactionNotFoundError extends Error {
  override readonly name = "OAuthTransactionNotFoundError";
}

export class OAuthTransactionConflictError extends Error {
  override readonly name = "OAuthTransactionConflictError";
}

function normalizeStage(value: string): OAuthTransactionStage {
  const upper = value.trim().toUpperCase() as OAuthTransactionStage;
  return upper;
}

function mapRow(row: OAuthTransactionRow): OAuthTransactionRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    connectionId: row.connection_id,
    provider: row.provider as OAuthTransactionRecord["provider"],
    stateHash: row.state_hash,
    resumeSessionHash: row.resume_session_hash,
    status: normalizeStage(row.status),
    initiatedByAuthUserId: row.initiated_by_auth_user_id,
    initiatedBySalesAgentId: row.initiated_by_sales_agent_id,
    userTokenExpiresAt: row.user_token_expires_at ? new Date(row.user_token_expires_at) : null,
    pageCandidatesJson: row.page_candidates_json,
    selectedPageId: row.selected_page_id,
    errorCategory: row.error_category as OAuthErrorCategory | null,
    callbackReceivedAt: row.callback_received_at ? new Date(row.callback_received_at) : null,
    consumedAt: row.consumed_at ? new Date(row.consumed_at) : null,
    expiresAt: new Date(row.expires_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

export class SupabaseOAuthTransactionRepository implements OAuthTransactionRepository {
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

  private async loadRowById(tenantId: string, transactionId: string): Promise<OAuthTransactionRow | null> {
    const { data, error } = await this.supabase
      .from("oauth_transactions")
      .select(OAUTH_TRANSACTION_SELECT)
      .eq("tenant_id", tenantId)
      .eq("id", transactionId)
      .maybeSingle();
    throwIfSupabaseError(error);
    return (data as OAuthTransactionRow | null) ?? null;
  }

  async createTransaction(input: CreateOAuthTransactionInput): Promise<OAuthTransactionRecord> {
    const nowIso = new Date().toISOString();
    const { data, error } = await this.supabase
      .from("oauth_transactions")
      .insert({
        tenant_id: input.tenantId,
        connection_id: input.connectionId,
        provider: input.provider ?? "FACEBOOK",
        state_hash: input.stateHash,
        status: "PENDING",
        initiated_by_auth_user_id: input.initiatedByAuthUserId,
        initiated_by_sales_agent_id: input.initiatedBySalesAgentId,
        expires_at: input.expiresAt.toISOString(),
        created_at: nowIso,
        updated_at: nowIso
      })
      .select(OAUTH_TRANSACTION_SELECT)
      .single();
    throwIfSupabaseError(error);
    return mapRow(data as OAuthTransactionRow);
  }

  async findById(tenantId: string, transactionId: string): Promise<OAuthTransactionRecord | null> {
    const row = await this.loadRowById(tenantId, transactionId);
    return row ? mapRow(row) : null;
  }

  async findActiveByStateHash(stateHash: string): Promise<OAuthTransactionRecord | null> {
    const { data, error } = await this.supabase
      .from("oauth_transactions")
      .select(OAUTH_TRANSACTION_SELECT)
      .eq("state_hash", stateHash)
      .eq("status", "PENDING")
      .is("consumed_at", null)
      .maybeSingle();
    throwIfSupabaseError(error);
    if (!data) return null;
    const row = mapRow(data as OAuthTransactionRow);
    if (isFacebookOAuthTransactionExpired(row.expiresAt)) return null;
    return row;
  }

  async findLatestCompletedForConnection(
    tenantId: string,
    connectionId: string
  ): Promise<OAuthTransactionRecord | null> {
    const { data, error } = await this.supabase
      .from("oauth_transactions")
      .select(OAUTH_TRANSACTION_SELECT)
      .eq("tenant_id", tenantId)
      .eq("connection_id", connectionId)
      .eq("status", "COMPLETED")
      .order("consumed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    throwIfSupabaseError(error);
    return data ? mapRow(data as OAuthTransactionRow) : null;
  }

  async findLatestActiveForConnectionAndUser(input: {
    tenantId: string;
    connectionId: string;
    authUserId: string;
  }): Promise<OAuthTransactionRecord | null> {
    const { data, error } = await this.supabase
      .from("oauth_transactions")
      .select(OAUTH_TRANSACTION_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("connection_id", input.connectionId)
      .eq("initiated_by_auth_user_id", input.authUserId)
      .in("status", ["CALLBACK_RECEIVED", "PAGES_READY"])
      .is("consumed_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    throwIfSupabaseError(error);
    if (!data) return null;
    const row = mapRow(data as OAuthTransactionRow);
    if (isFacebookOAuthTransactionExpired(row.expiresAt)) return null;
    return row;
  }

  async findActiveByResumeSessionHash(resumeSessionHash: string): Promise<OAuthTransactionRecord | null> {
    const { data, error } = await this.supabase
      .from("oauth_transactions")
      .select(OAUTH_TRANSACTION_SELECT)
      .eq("resume_session_hash", resumeSessionHash)
      .is("consumed_at", null)
      .maybeSingle();
    throwIfSupabaseError(error);
    if (!data) return null;
    const row = mapRow(data as OAuthTransactionRow);
    if (isFacebookOAuthTransactionExpired(row.expiresAt)) return null;
    if (row.status === "COMPLETED" || row.status === "FAILED" || row.status === "EXPIRED") {
      return null;
    }
    return row;
  }

  async consumeStateAtCallback(input: ConsumeOAuthStateInput): Promise<OAuthTransactionRecord> {
    const existing = await this.findActiveByStateHash(input.stateHash);
    if (!existing) {
      throw new OAuthTransactionNotFoundError("OAuth transaction not found for state");
    }

    const encryptedUserToken = encryptChannelCredentialPlaintext(
      input.userAccessToken,
      this.resolveEncryptionKeyMaterial()
    );
    const nowIso = new Date().toISOString();
    const { data, error } = await this.supabase
      .from("oauth_transactions")
      .update({
        status: "CALLBACK_RECEIVED",
        resume_session_hash: input.resumeSessionHash,
        encrypted_user_token: encryptedUserToken,
        user_token_expires_at: input.userTokenExpiresAt ? input.userTokenExpiresAt.toISOString() : null,
        callback_received_at: nowIso,
        updated_at: nowIso
      })
      .eq("id", existing.id)
      .eq("status", "PENDING")
      .is("consumed_at", null)
      .select(OAUTH_TRANSACTION_SELECT)
      .single();
    throwIfSupabaseError(error);
    if (!data) {
      throw new OAuthTransactionConflictError("OAuth state was already consumed");
    }
    return mapRow(data as OAuthTransactionRow);
  }

  async bindResumeSession(input: BindOAuthResumeSessionInput): Promise<OAuthTransactionRecord> {
    const row = await this.loadRowById(input.tenantId, input.transactionId);
    if (!row) {
      throw new OAuthTransactionNotFoundError("OAuth transaction not found");
    }
    if (row.initiated_by_auth_user_id !== input.initiatedByAuthUserId) {
      throw new OAuthTransactionNotFoundError("OAuth transaction not found");
    }
    const { data, error } = await this.supabase
      .from("oauth_transactions")
      .update({
        resume_session_hash: input.resumeSessionHash,
        updated_at: new Date().toISOString()
      })
      .eq("id", input.transactionId)
      .eq("tenant_id", input.tenantId)
      .select(OAUTH_TRANSACTION_SELECT)
      .single();
    throwIfSupabaseError(error);
    return mapRow(data as OAuthTransactionRow);
  }

  async updateTransaction(input: UpdateOAuthTransactionStatusInput): Promise<OAuthTransactionRecord> {
    const patch: Record<string, unknown> = {
      status: input.status,
      updated_at: new Date().toISOString()
    };
    if (input.errorCategory !== undefined) {
      patch.error_category = input.errorCategory;
    }
    if (input.pageCandidatesJson !== undefined) {
      patch.page_candidates_json = input.pageCandidatesJson;
    }
    if (input.selectedPageId !== undefined) {
      patch.selected_page_id = input.selectedPageId;
    }
    if (input.consumedAt !== undefined) {
      patch.consumed_at = input.consumedAt ? input.consumedAt.toISOString() : null;
    }

    const { data, error } = await this.supabase
      .from("oauth_transactions")
      .update(patch)
      .eq("id", input.transactionId)
      .eq("tenant_id", input.tenantId)
      .select(OAUTH_TRANSACTION_SELECT)
      .single();
    throwIfSupabaseError(error);
    if (!data) {
      throw new OAuthTransactionNotFoundError("OAuth transaction not found");
    }
    return mapRow(data as OAuthTransactionRow);
  }

  async getDecryptedUserToken(transactionId: string, tenantId: string): Promise<string | null> {
    const row = await this.loadRowById(tenantId, transactionId);
    if (!row?.encrypted_user_token) return null;
    return decryptChannelCredentialCiphertext(
      row.encrypted_user_token,
      this.resolveEncryptionKeyMaterial()
    );
  }

  async expireActiveTransactionsForConnection(tenantId: string, connectionId: string): Promise<number> {
    const nowIso = new Date().toISOString();
    const { data, error } = await this.supabase
      .from("oauth_transactions")
      .update({
        status: "EXPIRED",
        updated_at: nowIso
      })
      .eq("tenant_id", tenantId)
      .eq("connection_id", connectionId)
      .is("consumed_at", null)
      .in("status", ["PENDING", "CALLBACK_RECEIVED", "PAGES_READY"])
      .select("id");
    throwIfSupabaseError(error);
    return Array.isArray(data) ? data.length : 0;
  }
}
