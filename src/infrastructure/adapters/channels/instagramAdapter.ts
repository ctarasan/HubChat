import type { ChannelAdapter } from "../../../domain/ports.js";

interface InstagramConfig {
  accessToken: string;
  accountId?: string;
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
          timestamp?: number;
          message?: { mid?: string; text?: string; is_echo?: boolean };
        }>;
      }>;
    };

    for (const entry of payload.entry ?? []) {
      for (const msg of entry.messaging ?? []) {
        if (!msg.sender?.id || !msg.message || msg.message.is_echo) continue;
        const text = typeof msg.message.text === "string" ? msg.message.text.trim() : "";
        if (!text) continue;
        const timestamp = msg.timestamp ?? Date.now();
        const occurredAt = new Date(timestamp).toISOString();
        const messageMid = msg.message.mid ?? `ig-message:${msg.sender.id}:${timestamp}`;
        const profile = await this.fetchUserProfile(msg.sender.id);
        return {
          externalEventId: messageMid,
          idempotencyKey: `instagram:${messageMid}`,
          externalMessageId: messageMid,
          externalUserId: msg.sender.id,
          channelThreadId: msg.sender.id,
          text,
          messageType: "TEXT",
          occurredAt,
          profile,
          profileDiagnostics: {
            profileLookupAttempted: true,
            profileLookupSucceeded: Boolean(profile.name || profile.profileImageUrl)
          }
        };
      }
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
    const recipientId = input.channelThreadId.trim();
    if (!recipientId) throw new Error("Instagram outbound target is empty");

    const response = await fetch(
      `https://graph.facebook.com/v22.0/${encodeURIComponent(this.config.accountId ?? "me")}/messages`,
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
        `https://graph.facebook.com/v22.0/${encodeURIComponent(externalUserId)}?fields=name,profile_pic&access_token=${encodeURIComponent(this.config.accessToken)}`
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
