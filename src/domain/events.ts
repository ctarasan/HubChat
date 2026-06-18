import type { InstagramCredentialBinding } from "./instagramOAuthOutboundContract.js";

export interface DomainEvent<TPayload> {
  eventId: string;
  tenantId: string;
  eventType: string;
  payload: TPayload;
  occurredAt: string;
  idempotencyKey: string;
  traceId?: string;
}

export type FacebookMessengerEchoNormalizedPayload = {
  webhookIngestKind: "facebook_messenger_echo";
  tenantId: string;
  channel: "FACEBOOK";
  externalMessageId: string;
  customerPsid: string;
  channelThreadId: string;
  text: string;
  messageType?: "TEXT" | "IMAGE";
  mediaUrl?: string | null;
  previewUrl?: string | null;
  occurredAt: string;
  facebookPageId?: string | null;
  queueCreatedAt?: string;
};

export function isFacebookMessengerEchoNormalizedPayload(
  payload: unknown
): payload is FacebookMessengerEchoNormalizedPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as FacebookMessengerEchoNormalizedPayload).webhookIngestKind === "facebook_messenger_echo"
  );
}

export interface InboundMessageNormalizedPayload {
  channel: "LINE" | "FACEBOOK" | "INSTAGRAM" | "TIKTOK" | "SHOPEE" | "LAZADA";
  tenantId: string;
  externalUserId: string;
  externalMessageId: string;
  channelThreadId: string;
  text: string;
  messageType?: "TEXT" | "IMAGE" | "DOCUMENT_PDF";
  mediaUrl?: string | null;
  previewUrl?: string | null;
  lineMessageId?: string | null;
  metadataJson?: Record<string, unknown>;
  occurredAt: string;
  senderDisplayName?: string | null;
  /** Denormalized convenience; canonical profile image also lives under `profile.profileImageUrl` when present. */
  senderProfileImageUrl?: string | null;
  sourceThreadType?: "MESSENGER_DM" | "FACEBOOK_COMMENT" | "INSTAGRAM_DM" | "INSTAGRAM_COMMENT";
  facebookPageId?: string | null;
  facebookPostId?: string | null;
  facebookCommentId?: string | null;
  instagramPageId?: string | null;
  instagramCommentId?: string | null;
  profile?: {
    name?: string;
    phone?: string;
    email?: string;
    avatarUrl?: string;
    profileImageUrl?: string;
  };
  queueCreatedAt?: string;
}

export interface OutboundMessageRequestedPayload {
  tenantId: string;
  messageId: string;
  conversationId: string;
  conversationIds?: string[];
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
  /** Optional Instagram OAuth credential binding (IG-AUTH-2B). Absent = legacy delivery path. */
  instagramCredentialBinding?: InstagramCredentialBinding;
}
