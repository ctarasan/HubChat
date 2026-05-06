import type { ChannelAdapter } from "../../../domain/ports.js";
import { parseMetaTimestamp } from "../../../domain/dateUtils.js";

interface InstagramConfig {
  accessToken: string;
  graphVersion?: string;
  businessAccountId?: string;
}

const DEFAULT_META_GRAPH_VERSION = "v25.0";

function normalizeGraphVersion(value: string | undefined): string {
  const raw = (value ?? DEFAULT_META_GRAPH_VERSION).trim();
  if (!raw) return DEFAULT_META_GRAPH_VERSION;
  if (/^\d+\.\d+$/.test(raw)) return `v${raw}`;
  if (/^v\d+\.\d+$/i.test(raw)) return `v${raw.slice(1)}`;
  return raw.startsWith("v") ? raw : `v${raw}`;
}

function normalizeInstagramThreadId(igsid: string): string {
  return `ig:user:${igsid}`;
}

function extractIgsidFromThreadId(channelThreadId: string): string | null {
  const trimmed = channelThreadId.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("ig:user:")) {
    const value = trimmed.slice("ig:user:".length).trim();
    return value || null;
  }
  return null;
}

export class InstagramAdapter implements ChannelAdapter {
  readonly channel = "INSTAGRAM" as const;

  constructor(private readonly config: InstagramConfig) {}

  private *iterateMessagingEvents(payload: {
    entry?: Array<{
      messaging?: Array<{
        sender?: { id?: string };
        recipient?: { id?: string };
        timestamp?: unknown;
        message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: unknown[] };
      }>;
      changes?: Array<{
        value?: {
          messaging?: Array<{
            sender?: { id?: string };
            recipient?: { id?: string };
            timestamp?: unknown;
            message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: unknown[] };
          }>;
          messages?: Array<{
            id?: string;
            from?: string;
            text?: string;
            timestamp?: unknown;
          }>;
        };
      }>;
    }>;
  }): Generator<{
    senderId: string;
    recipientId: string | null;
    timestamp: unknown;
    messageMid: string | null;
    text: string;
    attachments: unknown[];
    isEcho: boolean;
  }> {
    for (const entry of payload.entry ?? []) {
      for (const msg of entry.messaging ?? []) {
        const senderId = typeof msg.sender?.id === "string" ? msg.sender.id.trim() : "";
        if (!senderId) continue;
        const text = typeof msg.message?.text === "string" ? msg.message.text.trim() : "";
        const attachments = Array.isArray(msg.message?.attachments) ? msg.message.attachments : [];
        const messageMid = typeof msg.message?.mid === "string" && msg.message.mid.trim() ? msg.message.mid.trim() : null;
        const recipientId = typeof msg.recipient?.id === "string" && msg.recipient.id.trim() ? msg.recipient.id.trim() : null;
        yield {
          senderId,
          recipientId,
          timestamp: msg.timestamp,
          messageMid,
          text,
          attachments,
          isEcho: Boolean(msg.message?.is_echo)
        };
      }
      for (const change of entry.changes ?? []) {
        for (const msg of change.value?.messaging ?? []) {
          const senderId = typeof msg.sender?.id === "string" ? msg.sender.id.trim() : "";
          if (!senderId) continue;
          const text = typeof msg.message?.text === "string" ? msg.message.text.trim() : "";
          const attachments = Array.isArray(msg.message?.attachments) ? msg.message.attachments : [];
          const messageMid = typeof msg.message?.mid === "string" && msg.message.mid.trim() ? msg.message.mid.trim() : null;
          const recipientId = typeof msg.recipient?.id === "string" && msg.recipient.id.trim() ? msg.recipient.id.trim() : null;
          yield {
            senderId,
            recipientId,
            timestamp: msg.timestamp,
            messageMid,
            text,
            attachments,
            isEcho: Boolean(msg.message?.is_echo)
          };
        }
        for (const msg of change.value?.messages ?? []) {
          const senderId = typeof msg.from === "string" ? msg.from.trim() : "";
          if (!senderId) continue;
          const text = typeof msg.text === "string" ? msg.text.trim() : "";
          const messageMid = typeof msg.id === "string" && msg.id.trim() ? msg.id.trim() : null;
          yield {
            senderId,
            recipientId: null,
            timestamp: msg.timestamp,
            messageMid,
            text,
            attachments: [],
            isEcho: false
          };
        }
      }
    }
  }

  async receiveMessage(raw: unknown): Promise<{
    externalEventId: string;
    idempotencyKey: string;
    externalMessageId: string;
    externalUserId: string;
    channelThreadId: string;
    text: string;
    occurredAt: string;
    metadataJson?: Record<string, unknown>;
    profile?: { name?: string; phone?: string; email?: string; avatarUrl?: string; profileImageUrl?: string };
    profileDiagnostics?: { profileLookupAttempted: boolean; profileLookupSucceeded: boolean };
    messageType?: "TEXT";
  }> {
    const payload = raw as Parameters<InstagramAdapter["iterateMessagingEvents"]>[0];

    let sawInstagramMediaUnsupported = false;
    for (const event of this.iterateMessagingEvents(payload)) {
      if (event.isEcho) continue;
      if (!event.text) {
        if (event.attachments.length > 0) {
          sawInstagramMediaUnsupported = true;
        }
        continue;
      }
      const timestamp = event.timestamp ?? Date.now();
      const occurredAt = parseMetaTimestamp(timestamp);
      const hasMid = typeof event.messageMid === "string" && event.messageMid.trim().length > 0;
      const messageMid = hasMid ? event.messageMid!.trim() : `ig-message:${event.senderId}:${timestamp}`;
      const idempotencyKey = hasMid ? `instagram:${messageMid}` : `instagram:${event.senderId}:${timestamp}`;
      const profile = await this.fetchUserProfile(event.senderId);
      return {
        externalEventId: messageMid,
        idempotencyKey,
        externalMessageId: messageMid,
        externalUserId: event.senderId,
        channelThreadId: normalizeInstagramThreadId(event.senderId),
        text: event.text,
        messageType: "TEXT",
        occurredAt,
        metadataJson: {
          instagramRecipientId: event.recipientId
        },
        profile,
        profileDiagnostics: {
          profileLookupAttempted: true,
          profileLookupSucceeded: Boolean(profile.name || profile.profileImageUrl)
        }
      };
    }

    if (sawInstagramMediaUnsupported) {
      throw new Error("Instagram inbound media is not supported in this phase");
    }
    throw new Error("Unsupported Instagram webhook event payload");
  }

  async sendMessage(input: {
    channelThreadId: string;
    content: string;
    idempotencyKey: string;
    messageType?: "TEXT" | "IMAGE" | "DOCUMENT_PDF";
  }): Promise<{ externalMessageId: string }> {
    if ((input.messageType ?? "TEXT") !== "TEXT") {
      throw new Error("Instagram outbound supports text only in this phase");
    }
    const recipientId = extractIgsidFromThreadId(input.channelThreadId);
    if (!recipientId || !/^\d+$/.test(recipientId)) {
      throw new Error(`Instagram outbound target is invalid. Expected ig:user:<IGSID>, got: ${input.channelThreadId}`);
    }
    const graphVersion = normalizeGraphVersion(
      this.config.graphVersion ?? process.env.META_GRAPH_VERSION ?? process.env.FACEBOOK_GRAPH_VERSION
    );

    const response = await fetch(
      `https://graph.facebook.com/${graphVersion}/me/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          messaging_type: "RESPONSE",
          message: { text: input.content },
          access_token: this.config.accessToken
        })
      }
    );
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`Instagram Send API failed (${response.status}): ${bodyText}`);
    }
    const parsed = JSON.parse(bodyText) as { message_id?: string };
    return { externalMessageId: parsed.message_id ?? `instagram-send:${recipientId}:${Date.now()}` };
  }

  async fetchUserProfile(externalUserId: string): Promise<{
    name?: string;
    phone?: string;
    email?: string;
    avatarUrl?: string;
    profileImageUrl?: string;
  }> {
    try {
      const response = await fetch(
        `https://graph.facebook.com/${normalizeGraphVersion(
          this.config.graphVersion ?? process.env.META_GRAPH_VERSION ?? process.env.FACEBOOK_GRAPH_VERSION
        )}/${encodeURIComponent(externalUserId)}?fields=name,profile_pic&access_token=${encodeURIComponent(this.config.accessToken)}`
      );
      if (!response.ok) return {};
      const body = (await response.json()) as { name?: unknown; profile_pic?: unknown };
      const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : undefined;
      const profileImageUrl =
        typeof body.profile_pic === "string" && body.profile_pic.trim() ? body.profile_pic.trim() : undefined;
      return {
        ...(name ? { name } : {}),
        ...(profileImageUrl ? { profileImageUrl, avatarUrl: profileImageUrl } : {})
      };
    } catch {
      return {};
    }
  }

  async fetchConversationThread(_channelThreadId: string): Promise<Array<{ externalMessageId: string; content: string }>> {
    return [];
  }
}
