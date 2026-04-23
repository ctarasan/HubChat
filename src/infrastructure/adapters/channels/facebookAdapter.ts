import type { ChannelAdapter } from "../../../domain/ports.js";

interface FacebookConfig {
  pageAccessToken?: string;
}

export class FacebookAdapter implements ChannelAdapter {
  readonly channel = "FACEBOOK" as const;

  constructor(private readonly config: FacebookConfig) {}

  private parseOutboundTarget(channelThreadId: string): { mode: "messenger" | "comment"; id: string } {
    const trimmed = channelThreadId.trim();
    if (trimmed.startsWith("user:")) return { mode: "messenger", id: trimmed.slice(5) };
    if (trimmed.startsWith("comment:")) return { mode: "comment", id: trimmed.slice(8) };
    if (trimmed.startsWith("post:")) return { mode: "comment", id: trimmed.slice(5) };

    // Heuristic: Facebook comment/post object ids usually contain underscore; PSID for Messenger does not.
    if (trimmed.includes("_")) return { mode: "comment", id: trimmed };
    return { mode: "messenger", id: trimmed };
  }

  private assertHttpsUrl(value: string, fieldName: string): void {
    try {
      const u = new URL(value);
      if (u.protocol !== "https:") throw new Error();
    } catch {
      throw new Error(`Facebook outbound ${fieldName} must be HTTPS`);
    }
  }

  private pickTextCandidate(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private extractCommentText(value: {
    message?: unknown;
    comment_text?: unknown;
    text?: unknown;
    comment?: { message?: unknown; text?: unknown };
  }): string | null {
    return (
      this.pickTextCandidate(value.message) ??
      this.pickTextCandidate(value.comment_text) ??
      this.pickTextCandidate(value.text) ??
      this.pickTextCandidate(value.comment?.message) ??
      this.pickTextCandidate(value.comment?.text) ??
      null
    );
  }

  private async fetchCommentTextFromGraph(commentId: string): Promise<string | null> {
    if (!this.config.pageAccessToken) {
      console.warn("[facebook-adapter] FACEBOOK_PAGE_ACCESS_TOKEN missing; cannot fetch comment text", { commentId });
      return null;
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/v22.0/${encodeURIComponent(commentId)}?fields=message&access_token=${encodeURIComponent(this.config.pageAccessToken)}`
      );
      if (!response.ok) {
        const body = await response.text();
        console.warn("[facebook-adapter] Graph API comment lookup failed", { commentId, status: response.status, body });
        return null;
      }

      const parsed = (await response.json()) as { message?: unknown };
      return this.pickTextCandidate(parsed.message);
    } catch (error) {
      console.warn("[facebook-adapter] Graph API comment lookup threw", { commentId, error });
      return null;
    }
  }

  private async fetchUserDisplayNameFromGraph(userId: string): Promise<string | null> {
    if (!this.config.pageAccessToken) return null;
    try {
      const response = await fetch(
        `https://graph.facebook.com/v22.0/${encodeURIComponent(userId)}?fields=name&access_token=${encodeURIComponent(this.config.pageAccessToken)}`
      );
      if (!response.ok) return null;
      const body = (await response.json()) as { name?: unknown };
      const name = typeof body.name === "string" ? body.name.trim() : "";
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
      entry?: Array<{
        id?: string;
        messaging?: Array<{
          sender?: { id?: string };
          recipient?: { id?: string };
          timestamp?: number;
          message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: Array<{ type?: string }> };
        }>;
        changes?: Array<{
          field?: string;
          value?: {
            from?: { id?: string; name?: string };
            sender_id?: string;
            sender?: { id?: string };
            post_id?: string;
            parent_id?: string;
            comment_id?: string;
            message?: string;
            item?: string;
            verb?: string;
            comment_text?: string;
            text?: string;
            comment?: { message?: string; text?: string };
            time?: number;
            created_time?: string;
          };
        }>;
      }>;
    };

    for (const entry of payload.entry ?? []) {
      for (const msg of entry.messaging ?? []) {
        if (!msg.sender?.id || !msg.message) continue;
        if (msg.message.is_echo) continue;

        const textValue = typeof msg.message.text === "string" ? msg.message.text.trim() : "";
        const attachmentType = msg.message.attachments?.[0]?.type;
        if (!textValue && !attachmentType) continue;

        const senderId = msg.sender.id;
        const timestamp = msg.timestamp ?? Date.now();
        const occurredAt = new Date(timestamp).toISOString();
        const messageMid = msg.message?.mid ?? `fb-message:${senderId}:${timestamp}`;
        const text = textValue || `[${attachmentType}]`;

        const displayName = await this.fetchUserDisplayNameFromGraph(senderId);

        return {
          externalEventId: messageMid,
          idempotencyKey: `facebook:${messageMid}`,
          externalMessageId: messageMid,
          externalUserId: senderId,
          channelThreadId: senderId,
          text,
          occurredAt,
          profile: displayName ? { name: displayName } : undefined
        };
      }
    }

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "feed" && change.field !== "comments") continue;
        const value = change.value;
        const commenterId = value?.from?.id ?? value?.sender_id ?? value?.sender?.id;
        if (!commenterId) continue;
        const timestamp = value?.time ? Number(value.time) : undefined;
        const occurredAt = value?.created_time
          ? new Date(value.created_time).toISOString()
          : timestamp
            ? new Date(timestamp).toISOString()
            : new Date().toISOString();
        const commentId = value?.comment_id ?? `fb-comment:${commenterId}:${occurredAt}`;
        const payloadText = value ? this.extractCommentText(value) : null;
        const graphText = !payloadText && value?.comment_id ? await this.fetchCommentTextFromGraph(value.comment_id) : null;
        const text = payloadText ?? graphText ?? (value?.item ? `[${value.item}]` : "[comment]");
        const threadId = value?.comment_id ?? value?.parent_id ?? value?.post_id ?? commenterId;

        const payloadName =
          typeof value?.from?.name === "string" && value.from.name.trim() ? value.from.name.trim() : null;
        const displayName = payloadName ?? (commenterId ? await this.fetchUserDisplayNameFromGraph(commenterId) : null);

        return {
          externalEventId: commentId,
          idempotencyKey: `facebook:${commentId}`,
          externalMessageId: commentId,
          externalUserId: commenterId,
          channelThreadId: threadId,
          text,
          occurredAt,
          profile: displayName ? { name: displayName } : undefined
        };
      }
    }

    throw new Error("Unsupported Facebook webhook event payload");
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
    if (!this.config.pageAccessToken) {
      throw new Error("Facebook page access token is not configured");
    }

    const target = this.parseOutboundTarget(input.channelThreadId);
    if (!target.id) {
      throw new Error("Facebook outbound target is empty");
    }

    const messageType = input.messageType ?? "TEXT";
    if (messageType === "IMAGE" && !input.mediaUrl) {
      throw new Error("Facebook Messenger image outbound requires mediaUrl");
    }
    if (messageType === "DOCUMENT_PDF" && !input.mediaUrl) {
      throw new Error("Facebook Messenger document outbound requires mediaUrl");
    }
    if (messageType === "IMAGE" && typeof input.fileSizeBytes === "number" && input.fileSizeBytes > 8 * 1024 * 1024) {
      throw new Error("Facebook Messenger image outbound supports up to 8MB for URL-based attachment");
    }
    if (messageType === "IMAGE" || messageType === "DOCUMENT_PDF") {
      this.assertHttpsUrl(input.mediaUrl ?? "", "mediaUrl");
    }

    if (target.mode === "comment") {
      if (messageType !== "TEXT") {
        throw new Error("Facebook media outbound is supported for Messenger DM only");
      }
      const url = `https://graph.facebook.com/v22.0/${encodeURIComponent(target.id)}/comments?access_token=${encodeURIComponent(this.config.pageAccessToken)}`;
      // Graph often documents POST body as form fields; avoids silent failures with some token/app combos.
      const form = new URLSearchParams();
      form.set("message", input.content);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: form.toString()
      });

      const bodyText = await response.text();
      let parsed: { id?: string; error?: { message?: string; code?: number; type?: string } };
      try {
        parsed = JSON.parse(bodyText) as typeof parsed;
      } catch {
        throw new Error(`Facebook Comment Reply API invalid JSON (${response.status}): ${bodyText.slice(0, 500)}`);
      }
      if (parsed.error) {
        throw new Error(`Facebook Comment Reply API error: ${JSON.stringify(parsed.error)}`);
      }
      if (!response.ok) {
        throw new Error(`Facebook Comment Reply API failed (${response.status}): ${bodyText}`);
      }
      if (!parsed.id || typeof parsed.id !== "string") {
        throw new Error(`Facebook Comment Reply API missing id (reply not created): ${bodyText}`);
      }
      return { externalMessageId: parsed.id };
    }

    const response = await fetch(
      `https://graph.facebook.com/v22.0/me/messages?access_token=${encodeURIComponent(this.config.pageAccessToken)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(
          messageType === "IMAGE"
            ? {
                recipient: { id: target.id },
                messaging_type: "RESPONSE",
                message: {
                  attachment: {
                    type: "image",
                    payload: {
                      url: input.mediaUrl,
                      is_reusable: true
                    }
                  }
                }
              }
            : messageType === "DOCUMENT_PDF"
              ? {
                  recipient: { id: target.id },
                  messaging_type: "RESPONSE",
                  message: {
                    attachment: {
                      type: "file",
                      payload: {
                        url: input.mediaUrl,
                        is_reusable: true
                      }
                    }
                  }
                }
            : {
                recipient: { id: target.id },
                messaging_type: "RESPONSE",
                message: { text: input.content }
              }
        )
      }
    );
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`Facebook Send API failed (${response.status}): ${bodyText}`);
    }

    const parsed = JSON.parse(bodyText) as { message_id?: string };
    return { externalMessageId: parsed.message_id ?? `facebook-send:${target.id}:${Date.now()}` };
  }

  async fetchUserProfile(_externalUserId: string): Promise<{ name?: string; phone?: string; email?: string }> {
    return { name: "Facebook User" };
  }

  async fetchConversationThread(_channelThreadId: string): Promise<Array<{ externalMessageId: string; content: string }>> {
    return [];
  }
}
