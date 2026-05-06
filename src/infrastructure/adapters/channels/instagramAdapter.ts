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
    const payload = raw as {
      entry?: Array<{
        id?: string;
        messaging?: Array<{
          sender?: { id?: string };
          recipient?: { id?: string };
          timestamp?: unknown;
          message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: unknown[] };
        }>;
      }>;
    };

    let sawInstagramMediaUnsupported = false;
    for (const entry of payload.entry ?? []) {
      for (const msg of entry.messaging ?? []) {
        if (!msg.sender?.id || !msg.message || msg.message.is_echo) continue;
        const text = typeof msg.message.text === "string" ? msg.message.text.trim() : "";
        if (!text) {
          if (Array.isArray(msg.message.attachments) && msg.message.attachments.length > 0) {
            sawInstagramMediaUnsupported = true;
          }
          continue;
        }
        const timestamp = msg.timestamp ?? Date.now();
        const occurredAt = parseMetaTimestamp(timestamp);
        const hasMid = typeof msg.message.mid === "string" && msg.message.mid.trim().length > 0;
        const messageMid = hasMid ? msg.message.mid!.trim() : `ig-message:${msg.sender.id}:${timestamp}`;
        const idempotencyKey = hasMid ? `instagram:${messageMid}` : `instagram:${msg.sender.id}:${timestamp}`;
        const profile = await this.fetchUserProfile(msg.sender.id);
        return {
          externalEventId: messageMid,
          idempotencyKey,
          externalMessageId: messageMid,
          externalUserId: msg.sender.id,
          channelThreadId: normalizeInstagramThreadId(msg.sender.id),
          text,
          messageType: "TEXT",
          occurredAt,
          metadataJson: {
            instagramRecipientId: msg.recipient?.id ?? null
          },
          profile,
          profileDiagnostics: {
            profileLookupAttempted: true,
            profileLookupSucceeded: Boolean(profile.name || profile.profileImageUrl)
          }
        };
      }
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
