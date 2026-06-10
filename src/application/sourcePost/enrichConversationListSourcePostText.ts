import type { MessageRepository } from "../../domain/ports.js";
import { extractSourcePostTextFromMetadata } from "../../lib/sourcePostTextFromMetadata.js";

function pickString(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function pickIso(row: Record<string, unknown>, ...keys: string[]): string | null {
  const raw = pickString(row, ...keys);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Rows that may receive source post text enrichment from stored message metadata. */
export function conversationNeedsSourcePostTextEnrichment(row: Record<string, unknown>): boolean {
  const channel = pickString(row, "channel_type", "channelType").toUpperCase();
  if (channel !== "FACEBOOK" && channel !== "INSTAGRAM") return false;

  const providerThreadType = pickString(row, "provider_thread_type", "providerThreadType");
  if (providerThreadType === "FACEBOOK_COMMENT" || providerThreadType === "INSTAGRAM_COMMENT") {
    return true;
  }

  if (pickIso(row, "private_reply_sent_at", "privateReplySentAt")) return true;

  const threadId = pickString(row, "channel_thread_id", "channelThreadId");
  return threadId.startsWith("comment:") || threadId.startsWith("ig:comment:");
}

function pickSafeThumbnailMetadata(metadata: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const key of ["thumbnailUrl", "thumbnail_url", "fullImageUrl", "full_image_url"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      out[key] = value.trim();
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Attach `source_post_snippet` / thumbnail metadata from earliest inbound message rows.
 * Read-only DB enrichment; no provider API calls.
 */
export async function enrichConversationListSourcePostText(input: {
  tenantId: string;
  rows: Record<string, unknown>[];
  messageRepository?: Pick<MessageRepository, "findEarliestInboundMetadataByConversationIds"> | null;
}): Promise<Record<string, unknown>[]> {
  const lookup = input.messageRepository?.findEarliestInboundMetadataByConversationIds;
  if (!lookup) return input.rows;

  const targetIds = input.rows
    .filter(conversationNeedsSourcePostTextEnrichment)
    .map((row) => String(row.id ?? ""))
    .filter(Boolean);

  if (targetIds.length === 0) return input.rows;

  const earliestByConversation = await lookup({
    tenantId: input.tenantId,
    conversationIds: targetIds
  });

  return input.rows.map((row) => {
    const conversationId = String(row.id ?? "");
    const earliest = earliestByConversation.get(conversationId);
    if (!earliest) return row;

    const postSnippet =
      pickString(row, "source_post_snippet", "sourcePostSnippet") ||
      extractSourcePostTextFromMetadata(earliest.metadataJson);
    if (!postSnippet) return row;

    const thumbnailMetadata = pickSafeThumbnailMetadata(earliest.metadataJson);
    return {
      ...row,
      source_post_snippet: postSnippet,
      source_post_timestamp:
        pickIso(row, "source_post_timestamp", "sourcePostTimestamp") ??
        (Number.isNaN(new Date(earliest.createdAt).getTime())
          ? null
          : new Date(earliest.createdAt).toISOString()),
      ...(thumbnailMetadata ? { source_post_message_metadata: thumbnailMetadata } : {})
    };
  });
}
