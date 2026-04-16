import type { ChannelAdapter } from "../../../domain/ports.js";

interface FacebookConfig {
  pageAccessToken: string;
}

export class FacebookAdapter implements ChannelAdapter {
  readonly channel = "FACEBOOK" as const;

  constructor(private readonly config: FacebookConfig) {}

  async receiveMessage(raw: unknown): Promise<{
    externalEventId: string;
    idempotencyKey: string;
    externalMessageId: string;
    externalUserId: string;
    channelThreadId: string;
    text: string;
    occurredAt: string;
  }> {
    const payload = raw as {
      entry?: Array<{
        id?: string;
        messaging?: Array<{
          sender?: { id?: string };
          recipient?: { id?: string };
          timestamp?: number;
          message?: { mid?: string; text?: string; attachments?: Array<{ type?: string }> };
        }>;
      }>;
    };

    const firstEntry = payload.entry?.[0];
    const firstMsg = firstEntry?.messaging?.[0];
    const senderId = firstMsg?.sender?.id;
    if (!senderId) throw new Error("Facebook webhook missing sender.id");

    const timestamp = firstMsg?.timestamp ?? Date.now();
    const occurredAt = new Date(timestamp).toISOString();
    const messageMid = firstMsg?.message?.mid ?? `fb-message:${senderId}:${timestamp}`;
    const text =
      firstMsg?.message?.text ??
      (firstMsg?.message?.attachments?.[0]?.type ? `[${firstMsg.message.attachments[0].type}]` : "[event]");

    return {
      externalEventId: messageMid,
      idempotencyKey: `facebook:${messageMid}`,
      externalMessageId: messageMid,
      externalUserId: senderId,
      channelThreadId: senderId,
      text,
      occurredAt
    };
  }

  async sendMessage(input: { channelThreadId: string; content: string; idempotencyKey: string }): Promise<{ externalMessageId: string }> {
    const response = await fetch(
      `https://graph.facebook.com/v22.0/me/messages?access_token=${encodeURIComponent(this.config.pageAccessToken)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          recipient: { id: input.channelThreadId },
          messaging_type: "RESPONSE",
          message: { text: input.content }
        })
      }
    );

    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`Facebook Send API failed (${response.status}): ${bodyText}`);
    }

    const parsed = JSON.parse(bodyText) as { message_id?: string };
    return { externalMessageId: parsed.message_id ?? `facebook-send:${input.channelThreadId}:${Date.now()}` };
  }

  async fetchUserProfile(_externalUserId: string): Promise<{ name?: string; phone?: string; email?: string }> {
    return { name: "Facebook User" };
  }

  async fetchConversationThread(_channelThreadId: string): Promise<Array<{ externalMessageId: string; content: string }>> {
    return [];
  }
}
