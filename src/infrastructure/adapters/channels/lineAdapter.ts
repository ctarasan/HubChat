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

  private async fetchLineDisplayName(userId: string): Promise<string | null> {
    try {
      const response = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.config.channelAccessToken}`
        }
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { displayName?: unknown };
      const name = typeof body.displayName === "string" ? body.displayName.trim() : "";
      return name.length > 0 ? name : null;
    } catch {
      return null;
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
    profile?: { name?: string; phone?: string; email?: string };
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

    const displayName = ev?.source?.userId ? await this.fetchLineDisplayName(ev.source.userId) : null;

    return {
      externalEventId: ev?.message?.id ?? `line-event:${sourceId}:${ts}`,
      idempotencyKey: `line:${ev?.message?.id ?? `${sourceId}:${ts}`}`,
      externalMessageId: ev?.message?.id ?? `line-message:${sourceId}:${ts}`,
      externalUserId: ev?.source?.userId ?? sourceId,
      channelThreadId: sourceId,
      text: ev?.message?.type === "text" ? ev.message.text ?? "" : `[${ev?.message?.type ?? "event"}]`,
      occurredAt,
      profile: displayName ? { name: displayName } : undefined
    };
  }

  async sendMessage(input: {
    channelThreadId: string;
    content: string;
    idempotencyKey: string;
    messageType?: "TEXT" | "IMAGE" | "DOCUMENT_PDF";
    mediaUrl?: string;
    previewUrl?: string;
    mediaMimeType?: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
    fileName?: string;
    fileSizeBytes?: number;
    width?: number;
    height?: number;
  }): Promise<{ externalMessageId: string }> {
    const messageType = input.messageType ?? "TEXT";
    let messages: Array<Record<string, unknown>>;
    if (messageType === "IMAGE") {
      if (!input.mediaUrl) {
        throw new Error("LINE image outbound requires mediaUrl");
      }
      const previewUrl = input.previewUrl ?? input.mediaUrl;
      this.assertHttpsUrl(input.mediaUrl, "mediaUrl");
      this.assertHttpsUrl(previewUrl, "previewUrl");
      messages = [
        {
          type: "image",
          originalContentUrl: input.mediaUrl,
          previewImageUrl: previewUrl
        }
      ];
    } else if (messageType === "DOCUMENT_PDF") {
      if (!input.mediaUrl) {
        throw new Error("LINE document outbound requires mediaUrl");
      }
      this.assertHttpsUrl(input.mediaUrl, "mediaUrl");
      const fileName = input.fileName?.trim() || "document.pdf";
      // LINE does not support native PDF attachment in this phase; send explicit link fallback.
      messages = [
        {
          type: "text",
          text: `Document: ${fileName}\n${input.mediaUrl}`
        }
      ];
    } else {
      messages = [
        {
          type: "text",
          text: input.content
        }
      ];
    }
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
