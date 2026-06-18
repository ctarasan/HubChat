import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ClaimInstagramOAuthStateInput,
  CreateInstagramOAuthStateInput,
  FinalizeInstagramOAuthStateInput,
  InstagramOAuthReturnDestination,
  InstagramOAuthStateRecord,
  InstagramOAuthStateStatus
} from "../../../domain/instagramOAuthStates.js";
import type { InstagramOAuthStateRepository } from "../../../domain/ports.js";
import { isInstagramOAuthStateExpired } from "../../../lib/instagramOAuthSecurity.js";
import { throwIfSupabaseError } from "../../../lib/supabasePostgrestError.js";

type InstagramOAuthStateRow = {
  id: string;
  tenant_id: string;
  channel_connection_id: string;
  provider: string;
  state_hash: string;
  return_destination: string;
  requested_scopes: string[];
  status: string;
  initiated_by_auth_user_id: string;
  initiated_by_sales_agent_id: string;
  failure_code: string | null;
  claimed_at: string | null;
  consumed_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

const STATE_SELECT =
  "id,tenant_id,channel_connection_id,provider,state_hash,return_destination,requested_scopes,status,initiated_by_auth_user_id,initiated_by_sales_agent_id,failure_code,claimed_at,consumed_at,expires_at,created_at,updated_at";

export class InstagramOAuthStateNotFoundError extends Error {
  override readonly name = "InstagramOAuthStateNotFoundError";
}

export class InstagramOAuthStateConflictError extends Error {
  override readonly name = "InstagramOAuthStateConflictError";
}

function normalizeStatus(value: string): InstagramOAuthStateStatus {
  return value.trim().toUpperCase() as InstagramOAuthStateStatus;
}

function normalizeReturnDestination(value: string): InstagramOAuthReturnDestination {
  const upper = value.trim().toUpperCase() as InstagramOAuthReturnDestination;
  return upper;
}

function mapRow(row: InstagramOAuthStateRow): InstagramOAuthStateRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    channelConnectionId: row.channel_connection_id,
    provider: "INSTAGRAM",
    stateHash: row.state_hash,
    returnDestination: normalizeReturnDestination(row.return_destination),
    requestedScopes: row.requested_scopes ?? [],
    status: normalizeStatus(row.status),
    initiatedByAuthUserId: row.initiated_by_auth_user_id,
    initiatedBySalesAgentId: row.initiated_by_sales_agent_id,
    failureCode: row.failure_code,
    claimedAt: row.claimed_at ? new Date(row.claimed_at) : null,
    consumedAt: row.consumed_at ? new Date(row.consumed_at) : null,
    expiresAt: new Date(row.expires_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

export class SupabaseInstagramOAuthStateRepository implements InstagramOAuthStateRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createState(input: CreateInstagramOAuthStateInput): Promise<InstagramOAuthStateRecord> {
    const nowIso = new Date().toISOString();
    const { data, error } = await this.supabase
      .from("instagram_oauth_states")
      .insert({
        tenant_id: input.tenantId,
        channel_connection_id: input.channelConnectionId,
        provider: "INSTAGRAM",
        state_hash: input.stateHash,
        return_destination: input.returnDestination,
        requested_scopes: input.requestedScopes,
        status: "PENDING",
        initiated_by_auth_user_id: input.initiatedByAuthUserId,
        initiated_by_sales_agent_id: input.initiatedBySalesAgentId,
        expires_at: input.expiresAt.toISOString(),
        created_at: nowIso,
        updated_at: nowIso
      })
      .select(STATE_SELECT)
      .single();
    throwIfSupabaseError(error);
    return mapRow(data as InstagramOAuthStateRow);
  }

  async claimStateAtCallback(input: ClaimInstagramOAuthStateInput): Promise<InstagramOAuthStateRecord> {
    const nowIso = input.now.toISOString();
    const { data, error } = await this.supabase
      .from("instagram_oauth_states")
      .update({
        status: "CLAIMED",
        claimed_at: nowIso,
        updated_at: nowIso
      })
      .eq("state_hash", input.stateHash)
      .eq("provider", input.provider)
      .eq("status", "PENDING")
      .is("claimed_at", null)
      .is("consumed_at", null)
      .gt("expires_at", nowIso)
      .select(STATE_SELECT)
      .maybeSingle();
    throwIfSupabaseError(error);
    if (!data) {
      const { data: stale, error: staleError } = await this.supabase
        .from("instagram_oauth_states")
        .select(STATE_SELECT)
        .eq("state_hash", input.stateHash)
        .eq("provider", input.provider)
        .maybeSingle();
      throwIfSupabaseError(staleError);
      if (stale) {
        const mapped = mapRow(stale as InstagramOAuthStateRow);
        if (isInstagramOAuthStateExpired(mapped.expiresAt, input.now)) {
          throw new InstagramOAuthStateNotFoundError("OAuth state expired");
        }
        if (mapped.status !== "PENDING") {
          throw new InstagramOAuthStateConflictError("OAuth state replay rejected");
        }
      }
      throw new InstagramOAuthStateNotFoundError("OAuth state not found");
    }
    return mapRow(data as InstagramOAuthStateRow);
  }

  async finalizeState(input: FinalizeInstagramOAuthStateInput): Promise<InstagramOAuthStateRecord> {
    const nowIso = new Date().toISOString();
    const { data, error } = await this.supabase
      .from("instagram_oauth_states")
      .update({
        status: input.status,
        failure_code: input.failureCode ?? null,
        consumed_at: nowIso,
        updated_at: nowIso
      })
      .eq("id", input.stateId)
      .eq("status", "CLAIMED")
      .is("consumed_at", null)
      .select(STATE_SELECT)
      .maybeSingle();
    throwIfSupabaseError(error);
    if (!data) {
      throw new InstagramOAuthStateConflictError("OAuth state finalize conflict");
    }
    return mapRow(data as InstagramOAuthStateRow);
  }
}
