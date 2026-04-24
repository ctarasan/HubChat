export interface DomainEvent<TPayload> {
  eventId: string;
  tenantId: string;
  eventType: string;
  payload: TPayload;
  occurredAt: string;
  idempotencyKey: string;
  traceId?: string;
}

export interface InboundMessageNormalizedPayload {
  channel: "LINE" | "FACEBOOK" | "INSTAGRAM" | "TIKTOK" | "SHOPEE" | "LAZADA";
  tenantId: string;
  externalUserId: string;
  externalMessageId: string;
  channelThreadId: string;
  text: string;
  occurredAt: string;
  senderDisplayName?: string | null;
  /** Denormalized convenience; canonical profile image also lives under `profile.profileImageUrl` when present. */
  senderProfileImageUrl?: string | null;
  profile?: {
    name?: string;
    phone?: string;
    email?: string;
    avatarUrl?: string;
    profileImageUrl?: string;
  };
}

export interface OutboundMessageRequestedPayload {
  tenantId: string;
  messageId: string;
  conversationId: string;
  leadId: string;
  channel: "LINE" | "FACEBOOK" | "INSTAGRAM" | "TIKTOK" | "SHOPEE" | "LAZADA";
  channelThreadId: string;
  content: string;
  messageType?: "TEXT" | "IMAGE" | "DOCUMENT_PDF";
  mediaUrl?: string;
  previewUrl?: string;
  mediaMimeType?: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  fileName?: string;
  fileSizeBytes?: number;
  width?: number;
  height?: number;
}
