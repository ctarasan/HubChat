import { classifyLeadSource } from "../../domain/leadSourceClassification.js";
import type { MessageRepository } from "../../domain/ports.js";
import { hasPersistableSourcePostMetadata } from "../../lib/sourcePostContextMetadata.js";

function pickString(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickIso(row: Record<string, unknown>, ...keys: string[]): string | null {
  const raw = pickString(row, ...keys);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Facebook/Instagram comment or private-reply rows eligible for persisted post metadata bridge. */
export function isSourcePostMetadataCandidateRow(row: Record<string, unknown>): boolean {
  const channel = String(row.channel_type ?? row.channelType ?? "").trim().toUpperCase();
  if (channel !== "FACEBOOK" && channel !== "INSTAGRAM") return false;
  const source = classifyLeadSource({
    channelType: channel,
    providerThreadType: pickString(row, "provider_thread_type", "providerThreadType"),
    privateReplySentAt: pickIso(row, "private_reply_sent_at", "privateReplySentAt"),
    channelThreadId: String(row.channel_thread_id ?? row.channelThreadId ?? ""),
    providerCommentId: pickString(row, "provider_comment_id", "providerCommentId")
  });
  return source.sourceType === "COMMENT" || source.sourceType === "PRIVATE_REPLY";
}

export function collectSourcePostMetadataCandidateConversationIds(rows: Record<string, unknown>[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!isSourcePostMetadataCandidateRow(row)) continue;
    const id = String(row.id ?? "").trim();
    if (id) ids.add(id);
  }
  return [...ids];
}

export function attachSourcePostMetadataToConversationRows(
  rows: Record<string, unknown>[],
  metadataByConversationId: ReadonlyMap<string, Record<string, unknown>>
): Record<string, unknown>[] {
  if (metadataByConversationId.size === 0) return rows;
  return rows.map((row) => {
    const id = String(row.id ?? "").trim();
    if (!id) return row;
    const metadata = metadataByConversationId.get(id);
    if (!metadata || !hasPersistableSourcePostMetadata(metadata)) return row;
    return { ...row, source_post_message_metadata: metadata };
  });
}

/**
 * Bounded secondary lookup: latest inbound message metadata with safe source post keys.
 * Fail-open: returns empty map on error or missing repository method.
 */
export async function loadSourcePostMetadataForConversationListRows(input: {
  tenantId: string;
  rows: Record<string, unknown>[];
  messageRepository?: Pick<MessageRepository, "findLatestInboundSourcePostMetadataByConversationIds">;
}): Promise<Map<string, Record<string, unknown>>> {
  const conversationIds = collectSourcePostMetadataCandidateConversationIds(input.rows);
  if (conversationIds.length === 0) return new Map();
  const lookup = input.messageRepository?.findLatestInboundSourcePostMetadataByConversationIds;
  if (!lookup) return new Map();
  try {
    return await lookup.call(input.messageRepository, {
      tenantId: input.tenantId,
      conversationIds
    });
  } catch {
    return new Map();
  }
}
