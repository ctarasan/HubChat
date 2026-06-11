import type { SupabaseClient } from "@supabase/supabase-js";

const FACEBOOK_REACTION_ONLY_PREVIEW = "[reaction]";

function readChannelType(row: Record<string, unknown>): string {
  const raw = row.channel_type ?? row.channelType;
  return typeof raw === "string" ? raw.trim().toUpperCase() : "";
}

function readProviderThreadType(row: Record<string, unknown>): string {
  const raw = row.provider_thread_type ?? row.providerThreadType;
  return typeof raw === "string" ? raw.trim().toUpperCase() : "";
}

function readLastMessagePreview(row: Record<string, unknown>): string | null {
  const raw = row.last_message_preview ?? row.lastMessagePreview;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readConversationId(row: Record<string, unknown>): string {
  const raw = row.id ?? row.conversationId;
  return typeof raw === "string" ? raw.trim() : "";
}

/** True when a row matches the narrow Facebook Comment reaction-only preview heuristic. */
export function isFacebookReactionOnlyInboxCandidate(row: Record<string, unknown>): boolean {
  if (readChannelType(row) !== "FACEBOOK") return false;
  if (readProviderThreadType(row) !== "FACEBOOK_COMMENT") return false;
  return readLastMessagePreview(row) === FACEBOOK_REACTION_ONLY_PREVIEW;
}

/**
 * True when a Facebook Comment conversation row should be hidden from inbox list queries.
 * When `conversationIdsWithRealInbound` is provided, rows with real inbound comment text are kept visible.
 */
export function isFacebookReactionOnlyInboxRow(
  row: Record<string, unknown>,
  conversationIdsWithRealInbound?: ReadonlySet<string>
): boolean {
  if (!isFacebookReactionOnlyInboxCandidate(row)) return false;
  if (!conversationIdsWithRealInbound) return true;
  const conversationId = readConversationId(row);
  if (!conversationId) return true;
  return !conversationIdsWithRealInbound.has(conversationId);
}

/**
 * PostgREST `.or()` filter: keep non-Facebook-comment rows and Facebook Comment rows whose preview is not `[reaction]`.
 */
export function buildFacebookReactionOnlyInboxExclusionOrFilter(): string {
  return [
    "channel_type.neq.FACEBOOK",
    "provider_thread_type.neq.FACEBOOK_COMMENT",
    "and(channel_type.eq.FACEBOOK,provider_thread_type.eq.FACEBOOK_COMMENT,last_message_preview.neq.[reaction])",
    "and(channel_type.eq.FACEBOOK,provider_thread_type.eq.FACEBOOK_COMMENT,last_message_preview.is.null)"
  ].join(",");
}

export function filterFacebookReactionOnlyInboxRows<T extends Record<string, unknown>>(
  rows: T[],
  conversationIdsWithRealInbound?: ReadonlySet<string>
): T[] {
  return rows.filter((row) => !isFacebookReactionOnlyInboxRow(row, conversationIdsWithRealInbound));
}

export function isRealFacebookCommentInboundMessageContent(content: unknown): boolean {
  if (typeof content !== "string") return false;
  const trimmed = content.trim();
  if (!trimmed) return false;
  return trimmed !== FACEBOOK_REACTION_ONLY_PREVIEW;
}

/** Bounded lookup: conversation IDs that have at least one real inbound comment message. */
export async function findFacebookCommentConversationIdsWithRealInboundText(
  supabase: Pick<SupabaseClient, "from">,
  tenantId: string,
  conversationIds: string[]
): Promise<Set<string>> {
  const ids = [...new Set(conversationIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return new Set();

  const boundLimit = Math.min(Math.max(ids.length * 5, ids.length), 500);
  const { data, error } = await supabase
    .from("messages")
    .select("conversation_id, content")
    .eq("tenant_id", tenantId)
    .eq("direction", "INBOUND")
    .in("conversation_id", ids)
    .neq("content", FACEBOOK_REACTION_ONLY_PREVIEW)
    .not("content", "is", null)
    .limit(boundLimit);
  if (error) throw error;

  const result = new Set<string>();
  for (const row of data ?? []) {
    const record = row as { conversation_id?: unknown; content?: unknown };
    const conversationId = typeof record.conversation_id === "string" ? record.conversation_id.trim() : "";
    if (!conversationId || result.has(conversationId)) continue;
    if (isRealFacebookCommentInboundMessageContent(record.content)) {
      result.add(conversationId);
    }
  }
  return result;
}

export async function applyFacebookReactionOnlyInboxListFilter<T extends Record<string, unknown>>(
  supabase: Pick<SupabaseClient, "from">,
  tenantId: string,
  rows: T[]
): Promise<T[]> {
  const candidates = rows.filter(isFacebookReactionOnlyInboxCandidate);
  if (candidates.length === 0) return rows;
  const withRealInbound = await findFacebookCommentConversationIdsWithRealInboundText(
    supabase,
    tenantId,
    candidates.map((row) => readConversationId(row))
  );
  return filterFacebookReactionOnlyInboxRows(rows, withRealInbound);
}
