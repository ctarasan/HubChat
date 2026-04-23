import type { ChannelAdapter } from "../../../domain/ports.js";

export class LineAdapter implements ChannelAdapter {
  readonly channel = "LINE" as const;

  constructor(
    private readonly config: {
      channelAccessToken: string;
      channelSecret: string;
    }
  ) {}

  private assertHttpsUrl(value: string, fieldName: string): void {
    try {
      const u = new URL(value);
      if (u.protocol !== "https:") throw new Error();
    } catch {
      throw new Error(`LINE outbound ${fieldName} must be HTTPS`);
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
  }> {
    const payload = raw as {
      destination: string;
      events: Array<{
        timestamp?: number | string;
        replyToken: string;
        source?: { userId?: string; groupId?: string; roomId?: string };
        message?: { id?: string; type?: string; text?: string };
      }>;
    };

    const ev = payload.events[0];
    const ts = typeof ev?.timestamp === "number" ? ev.timestamp : Number(ev?.timestamp ?? Date.now());
    const occurredAtDate = Number.isFinite(ts) ? new Date(ts) : new Date();
    const isValidDate = !Number.isNaN(occurredAtDate.getTime());
    const occurredAt = isValidDate ? occurredAtDate.toISOString() : new Date().toISOString();

    const sourceId =
      ev?.source?.userId ??
      ev?.source?.groupId ??
      ev?.source?.roomId;
    if (!sourceId) {
      throw new Error("LINE event missing source id (userId/groupId/roomId)");
    }

    return {
      externalEventId: ev?.message?.id ?? `line-event:${sourceId}:${ts}`,
      idempotencyKey: `line:${ev?.message?.id ?? `${sourceId}:${ts}`}`,
      externalMessageId: ev?.message?.id ?? `line-message:${sourceId}:${ts}`,
      externalUserId: ev?.source?.userId ?? sourceId,
      channelThreadId: sourceId,
      text: ev?.message?.type === "text" ? ev.message.text ?? "" : `[${ev?.message?.type ?? "event"}]`,
      occurredAt
    };
  }

  async sendMessage(input: {
    channelThreadId: string;
    content: string;
    idempotencyKey: string;
    messageType?: "TEXT" | "IMAGE";
    mediaUrl?: string;
    previewUrl?: string;
    mediaMimeType?: "image/jpeg" | "image/png" | "image/webp";
    fileSizeBytes?: number;
    width?: number;
    height?: number;
  }): Promise<{ externalMessageId: string }> {
    const messageType = input.messageType ?? "TEXT";
    if (messageType === "IMAGE" && !input.mediaUrl) {
      throw new Error("LINE image outbound requires mediaUrl");
    }
    const previewUrl = input.previewUrl ?? input.mediaUrl ?? "";
    if (messageType === "IMAGE") {
      this.assertHttpsUrl(input.mediaUrl ?? "", "mediaUrl");
      this.assertHttpsUrl(previewUrl, "previewUrl");
    }
    const messages =
      messageType === "IMAGE"
        ? [
            {
              type: "image",
              originalContentUrl: input.mediaUrl,
              previewImageUrl: previewUrl
            }
          ]
        : [
            {
              type: "text",
              text: input.content
            }
          ];
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.channelAccessToken}`,
        "X-Line-Retry-Key": input.idempotencyKey
      },
      body: JSON.stringify({
        to: input.channelThreadId,
        messages
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
