import type { SupabaseClient } from "@supabase/supabase-js";

const FACEBOOK_REACTION_ONLY_PREVIEW = "[reaction]";
const FACEBOOK_COMMENT_PLACEHOLDER = "[comment]";

/** Short customer comments stay visible; longer copy is usually leaked parent post body. */
const REAL_LEAD_COMMENT_MAX_LENGTH = 120;

export type FacebookCommentInboundContentKind =
  | "reaction_placeholder"
  | "comment_placeholder"
  | "empty"
  | "real_lead_comment"
  | "legacy_parent_post_pollution";

const LEGACY_PARENT_POST_POLLUTION_FIXTURE =
  'ในโลกของการทำธุรกิจ หลายครั้งที่เรามัวแต่โฟกัสกับการ "พูด" แทนที่จะ "ฟัง" และ "เข้าใจ" ลูกค้า การขายที่ยั่งยืนจึงไม่ได้เริ่มจากสิ่งที่เราอยากบอก แต่เริ่มจากสิ่งที่ลูกค้าต้องการรู้';

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

export function filterFacebookReactionOnlyInboxRows<T extends Record<string, unknown>>(
  rows: T[],
  conversationIdsWithRealInbound?: ReadonlySet<string>
): T[] {
  return rows.filter((row) => !isFacebookReactionOnlyInboxRow(row, conversationIdsWithRealInbound));
}

export function classifyFacebookCommentInboundMessageContent(
  content: unknown
): FacebookCommentInboundContentKind {
  if (typeof content !== "string") return "empty";
  const trimmed = content.trim();
  if (!trimmed) return "empty";
  if (trimmed === FACEBOOK_REACTION_ONLY_PREVIEW) return "reaction_placeholder";
  if (trimmed === FACEBOOK_COMMENT_PLACEHOLDER) return "comment_placeholder";
  if (trimmed.length <= REAL_LEAD_COMMENT_MAX_LENGTH) return "real_lead_comment";
  return "legacy_parent_post_pollution";
}

/** True when inbound content should rescue a `[reaction]` preview row from being hidden. */
export function isRealFacebookCommentInboundMessageContent(content: unknown): boolean {
  return classifyFacebookCommentInboundMessageContent(content) === "real_lead_comment";
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
    if (!conversationId) continue;
    if (isRealFacebookCommentInboundMessageContent(record.content)) {
      result.add(conversationId);
    }
  }
  return result;
}

export { LEGACY_PARENT_POST_POLLUTION_FIXTURE };

export async function applyFacebookReactionOnlyInboxListFilter<T extends Record<string, unknown>>(
  supabase: Pick<SupabaseClient, "from">,
  tenantId: string,
  rows: T[]
): Promise<T[]> {
  const candidates = rows.filter(isFacebookReactionOnlyInboxCandidate);
  if (candidates.length === 0) return rows;

  try {
    const withRealInbound = await findFacebookCommentConversationIdsWithRealInboundText(
      supabase,
      tenantId,
      candidates.map((row) => readConversationId(row))
    );
    return filterFacebookReactionOnlyInboxRows(rows, withRealInbound);
  } catch {
    return rows;
  }
}
