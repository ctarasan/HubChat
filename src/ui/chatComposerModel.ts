export type OutboundChannel = "LINE" | "FACEBOOK";

export interface ComposerConversationContext {
  id: string;
  channelType: OutboundChannel;
}

export interface SelectedImage {
  name: string;
  size: number;
  type: string;
}

export interface ComposerValidationInput {
  selectedChannel: OutboundChannel;
  text: string;
  image: SelectedImage | null;
  context: ComposerConversationContext | null;
}

export interface ComposerSendStep {
  kind: "text" | "image";
}

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateComposer(input: ComposerValidationInput): string[] {
  const errors: string[] = [];
  const hasText = Boolean(input.text.trim());
  const hasImage = Boolean(input.image);
  if (!hasText && !hasImage) errors.push("Please enter text or select an image.");
  if (!input.context) errors.push("Please select a conversation.");
  if (input.context && input.context.channelType !== input.selectedChannel) {
    errors.push(`Selected channel ${input.selectedChannel} is not allowed for this conversation.`);
  }
  if (input.image) {
    if (!ALLOWED.has(input.image.type)) {
      errors.push("Unsupported file type. Use JPEG, PNG, or WEBP.");
    }
    if (input.image.size > 10 * 1024 * 1024) {
      errors.push("Image file is too large (max 10MB).");
    }
    if (input.selectedChannel === "FACEBOOK" && input.image.size > 8 * 1024 * 1024) {
      errors.push("Facebook Messenger image must be <= 8MB.");
    }
  }
  return errors;
}

export function buildSendSequence(input: { text: string; hasImage: boolean }): ComposerSendStep[] {
  const steps: ComposerSendStep[] = [];
  if (input.text.trim()) steps.push({ kind: "text" });
  if (input.hasImage) steps.push({ kind: "image" });
  return steps;
}

export function canSubmitComposer(input: { busy: boolean; text: string; hasImage: boolean }): boolean {
  if (input.busy) return false;
  return Boolean(input.text.trim()) || input.hasImage;
}
