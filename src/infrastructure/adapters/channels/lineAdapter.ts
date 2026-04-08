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
        timestamp?: number | string;
        replyToken: string;
        source: { userId: string };
        message?: { id?: string; type?: string; text?: string };
      }>;
    };

    const ev = payload.events[0];
    const ts = typeof ev?.timestamp === "number" ? ev.timestamp : Number(ev?.timestamp ?? Date.now());
    const occurredAtDate = Number.isFinite(ts) ? new Date(ts) : new Date();
    const isValidDate = !Number.isNaN(occurredAtDate.getTime());
    const occurredAt = isValidDate ? occurredAtDate.toISOString() : new Date().toISOString();

    if (!ev?.source?.userId) {
      throw new Error("LINE event missing source.userId");
    }

    return {
      externalEventId: ev?.message?.id ?? `line-event:${ev.source.userId}:${ts}`,
      idempotencyKey: `line:${ev?.message?.id ?? `${ev.source.userId}:${ts}`}`,
      externalMessageId: ev?.message?.id ?? `line-message:${ev.source.userId}:${ts}`,
      externalUserId: ev.source.userId,
      channelThreadId: ev.source.userId,
      text: ev?.message?.type === "text" ? ev.message.text ?? "" : `[${ev?.message?.type ?? "event"}]`,
      occurredAt
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
