/**
 * Compact chat message layout contracts (UI-only).
 * Keeps timestamp DOM order and bubble sizing rules testable without React DOM.
 */

export type ChatMessageDirection = "INBOUND" | "OUTBOUND";

export const CHAT_BUBBLE_MAX_WIDTH_DESKTOP = "70%";
export const CHAT_BUBBLE_MAX_WIDTH_NARROW = "85%";
export const CHAT_MESSAGE_ROW_GAP_PX = 6;

/** True when the bubble should keep a dedicated media/attachment layout (not fit-content text). */
export function isChatMediaMessageLayout(input: {
  messageType?: string | null;
  hasImageUrl?: boolean;
  hasLineMessageId?: boolean;
  isLineImageError?: boolean;
}): boolean {
  const msgType = String(input.messageType ?? "TEXT").toUpperCase() || "TEXT";
  if (msgType === "DOCUMENT_PDF" || msgType === "IMAGE") return true;
  if (input.hasImageUrl || input.hasLineMessageId || input.isLineImageError) return true;
  return false;
}

export function chatMessageBubbleClassNames(input: {
  direction: ChatMessageDirection;
  mediaLayout: boolean;
}): string {
  const side = input.direction === "OUTBOUND" ? "outbound" : "inbound";
  const sizing = input.mediaLayout ? "msg-media" : "msg-text-bubble";
  return `msg msg-${side} ${sizing}`;
}

export function chatMessageRowClassNames(direction: ChatMessageDirection): string {
  const side = direction === "OUTBOUND" ? "outbound" : "inbound";
  return `msg-row msg-row-${side}`;
}

/**
 * DOM children order for assistive tech (no CSS order tricks).
 * Inbound: bubble then time. Outbound: time then bubble (visual: time left of right-aligned bubble).
 */
export function chatMessageDomChildOrder(
  direction: ChatMessageDirection
): readonly ["bubble", "time"] | readonly ["time", "bubble"] {
  return direction === "OUTBOUND" ? (["time", "bubble"] as const) : (["bubble", "time"] as const);
}

export function shouldRenderUnreadBadgeHelp(): boolean {
  return false;
}
