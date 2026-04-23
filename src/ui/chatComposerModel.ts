export type OutboundChannel = "LINE" | "FACEBOOK";
export type ComposerAttachmentKind = "image" | "document_pdf";
export type OutboundSendKind = "text" | "image" | "document_pdf";

export interface ComposerConversationContext {
  id: string;
  channelType: OutboundChannel;
}

export interface SelectedAttachment {
  name: string;
  size: number;
  type: string;
  kind: ComposerAttachmentKind;
}

export interface ComposerValidationInput {
  selectedChannel: OutboundChannel;
  text: string;
  attachment: SelectedAttachment | null;
  context: ComposerConversationContext | null;
}

export interface ComposerSendStep {
  kind: OutboundSendKind;
}

export interface ComposerSequenceResult {
  status: "success" | "partial_success" | "failure";
  successfulSteps: OutboundSendKind[];
  failedStep?: OutboundSendKind;
  error?: string;
}

const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_PDF = "application/pdf";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_FB_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_FB_PDF_BYTES = 25 * 1024 * 1024;

export function validateComposer(input: ComposerValidationInput): string[] {
  const errors: string[] = [];
  const hasText = Boolean(input.text.trim());
  const hasAttachment = Boolean(input.attachment);
  if (!hasText && !hasAttachment) errors.push("Please enter text or select an attachment.");
  if (!input.context) errors.push("Please select a conversation.");
  if (input.context && input.context.channelType !== input.selectedChannel) {
    errors.push(`Selected channel ${input.selectedChannel} is not allowed for this conversation.`);
  }
  if (input.attachment) {
    if (input.attachment.kind === "image") {
      if (!ALLOWED_IMAGE.has(input.attachment.type)) {
        errors.push("Unsupported image type. Use JPEG, PNG, or WEBP.");
      }
      if (input.attachment.size > MAX_UPLOAD_BYTES) {
        errors.push("Image file is too large (max 10MB).");
      }
      if (input.selectedChannel === "FACEBOOK" && input.attachment.size > MAX_FB_IMAGE_BYTES) {
        errors.push("Facebook Messenger image must be <= 8MB.");
      }
    } else {
      if (input.attachment.type !== ALLOWED_PDF) {
        errors.push("Unsupported file type. Use PDF for document attachments.");
      }
      if (input.attachment.size > MAX_UPLOAD_BYTES) {
        errors.push("PDF file is too large (max 10MB).");
      }
      if (input.selectedChannel === "FACEBOOK" && input.attachment.size > MAX_FB_PDF_BYTES) {
        errors.push("Facebook Messenger PDF must be <= 25MB.");
      }
    }
  }
  return errors;
}

export function attachmentKindFromMime(mimeType: string): ComposerAttachmentKind | null {
  if (ALLOWED_IMAGE.has(mimeType)) return "image";
  if (mimeType === ALLOWED_PDF) return "document_pdf";
  return null;
}

export function buildSendSequence(input: { text: string; attachmentKind: ComposerAttachmentKind | null }): ComposerSendStep[] {
  const steps: ComposerSendStep[] = [];
  if (input.text.trim()) steps.push({ kind: "text" });
  if (input.attachmentKind) steps.push({ kind: input.attachmentKind });
  return steps;
}

export async function performSendSequence(
  steps: ComposerSendStep[],
  run: (step: ComposerSendStep) => Promise<void>
): Promise<ComposerSequenceResult> {
  const successfulSteps: OutboundSendKind[] = [];
  for (const step of steps) {
    try {
      await run(step);
      successfulSteps.push(step.kind);
    } catch (error) {
      return successfulSteps.length > 0
        ? {
            status: "partial_success",
            successfulSteps,
            failedStep: step.kind,
            error: String(error)
          }
        : {
            status: "failure",
            successfulSteps: [],
            failedStep: step.kind,
            error: String(error)
          };
    }
  }
  return { status: "success", successfulSteps };
}

export function canSubmitComposer(input: { busy: boolean; text: string; hasAttachment: boolean }): boolean {
  if (input.busy) return false;
  return Boolean(input.text.trim()) || input.hasAttachment;
}
