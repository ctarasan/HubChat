import { extractPersistableSourcePostMetadata } from "./sourcePostContextMetadata.js";

/** Persisted metadata for inbound `messageRepository.create` (allowlisted source post keys on TEXT comments). */
export function buildPersistedInboundMessageMetadata(input: {
  channel: string;
  messageType: string;
  inboundMetadataJson: Record<string, unknown>;
  payloadMetadataJson?: Record<string, unknown> | null;
  instagramRecipientId?: string | null;
}): Record<string, unknown> {
  const isImage = String(input.messageType).toUpperCase() === "IMAGE";

  if (isImage) {
    return {
      ...input.inboundMetadataJson,
      ...(input.channel === "INSTAGRAM" && input.instagramRecipientId
        ? { instagramRecipientId: input.instagramRecipientId }
        : {}),
      mediaUrl: input.inboundMetadataJson.mediaUrl ?? null,
      previewUrl: input.inboundMetadataJson.previewUrl ?? null
    };
  }

  const safeSource = extractPersistableSourcePostMetadata(input.payloadMetadataJson);

  if (input.channel === "INSTAGRAM" && input.instagramRecipientId) {
    return { ...safeSource, instagramRecipientId: input.instagramRecipientId };
  }

  return safeSource;
}
