import type { ChannelAdapter } from "../../../domain/ports.js";

export class LineAdapter implements ChannelAdapter {
  readonly channel = "LINE" as const;

  constructor(
    private readonly config: {
      channelAccessToken: string;
      channelSecret: string;
    }
  ) {}

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
      destination: string;
      events: Array<{
        timestamp: number;
        replyToken: string;
        source: { userId: string };
        message: { id: string; text: string };
      }>;
    };

    const ev = payload.events[0];
    return {
      externalEventId: ev.message.id,
      idempotencyKey: `line:${ev.message.id}`,
      externalMessageId: ev.message.id,
      externalUserId: ev.source.userId,
      channelThreadId: ev.source.userId,
      text: ev.message.text,
      occurredAt: new Date(ev.timestamp).toISOString()
    };
  }

  async sendMessage(input: { channelThreadId: string; content: string; idempotencyKey: string }): Promise<{ externalMessageId: string }> {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.channelAccessToken}`,
        "X-Line-Retry-Key": input.idempotencyKey
      },
      body: JSON.stringify({
        to: input.channelThreadId,
        messages: [
          {
            type: "text",
            text: input.content
          }
        ]
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`LINE push API failed (${response.status}): ${body}`);
    }

    // LINE push API does not return message id directly.
    return { externalMessageId: `line-push:${input.channelThreadId}:${Date.now()}` };
  }

  async fetchUserProfile(_externalUserId: string): Promise<{ name?: string; phone?: string; email?: string }> {
    return { name: "LINE User" };
  }

  async fetchConversationThread(_channelThreadId: string): Promise<Array<{ externalMessageId: string; content: string }>> {
    return [];
  }
}
