export type OutboundChannel = "LINE" | "FACEBOOK";
export type ComposerAttachmentKind = "image" | "document_pdf";
export type OutboundSendKind = "text" | "image" | "document_pdf";

export interface ConversationParticipantFallbackRow {
  participant_display_name?: string | null;
  participantDisplayName?: string | null;
  participant_profile_image_url?: string | null;
  participantProfileImageUrl?: string | null;
  contacts?: {
    display_name?: string | null;
    displayName?: string | null;
    profile_image_url?: string | null;
    profileImageUrl?: string | null;
  } | null;
  contactIdentityDisplayName?: string | null;
  contactIdentityProfileImageUrl?: string | null;
  external_user_id?: string | null;
  externalUserId?: string | null;
  channel_thread_id?: string | null;
  channelThreadId?: string | null;
  unreadCount?: number | null;
  unread_count?: number | null;
}

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

export function resolveConversationParticipantName(row: ConversationParticipantFallbackRow): string {
  const candidates = [
    row.participant_display_name,
    row.participantDisplayName,
    row.contacts?.display_name,
    row.contacts?.displayName,
    row.contactIdentityDisplayName,
    row.external_user_id,
    row.externalUserId,
    row.channel_thread_id,
    row.channelThreadId
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim();
  }
  return "Unknown User";
}

function pickHttpsImageUrl(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const t = c.trim();
    if (!t) continue;
    try {
      if (new URL(t).protocol === "https:") return t;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Avatar image URL only (no initials). Order: conversation snapshot → identity → contact.
 */
export function resolveConversationParticipantAvatarUrl(row: ConversationParticipantFallbackRow): string | null {
  return pickHttpsImageUrl(
    row.participant_profile_image_url,
    row.participantProfileImageUrl,
    row.contactIdentityProfileImageUrl,
    row.contacts?.profile_image_url,
    row.contacts?.profileImageUrl
  );
}

export function initialsAvatarFromDisplayName(displayName: string): string {
  const parts = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) {
    const w = parts[0]!;
    if (w.length >= 2) return (w[0]! + w[1]!).toUpperCase();
    return w[0]!.toUpperCase();
  }
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export type ConversationAvatarPlan =
  | { kind: "image"; url: string }
  | { kind: "initials"; initials: string }
  | { kind: "generic" };

export function resolveConversationAvatarPlan(row: ConversationParticipantFallbackRow): ConversationAvatarPlan {
  const url = resolveConversationParticipantAvatarUrl(row);
  if (url) return { kind: "image", url };
  const name = resolveConversationParticipantName(row);
  const initials = initialsAvatarFromDisplayName(name);
  if (initials) return { kind: "initials", initials };
  return { kind: "generic" };
}

export function resolveConversationUnreadCount(row: ConversationParticipantFallbackRow): number {
  const raw = row.unreadCount ?? row.unread_count ?? 0;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.floor(raw));
}

export function shouldShowUnreadBadge(row: ConversationParticipantFallbackRow): boolean {
  return resolveConversationUnreadCount(row) > 0;
}
