import { INSTAGRAM_OUTBOUND_PDF_NOT_SUPPORTED } from "../domain/instagramDmMessages.js";
import {
  isAllowedOutboundImageMime,
  MEDIA_META_IMAGE_MAX_BYTES,
  MEDIA_UPLOAD_MAX_BYTES,
  OUTBOUND_PDF_MIME
} from "../lib/mediaPolicy.js";

export type OutboundChannel = "LINE" | "FACEBOOK" | "INSTAGRAM";
export type ComposerAttachmentKind = "image" | "document_pdf";
export type OutboundSendKind = "text" | "image" | "document_pdf";

export interface ConversationParticipantFallbackRow {
  id?: string;
  tenant_id?: string | null;
  tenantId?: string | null;
  contact_id?: string | null;
  contactId?: string | null;
  channel_type?: OutboundChannel | string | null;
  channelType?: OutboundChannel | string | null;
  provider_thread_type?: string | null;
  providerThreadType?: string | null;
  provider_external_user_id?: string | null;
  providerExternalUserId?: string | null;
  last_message_at?: string | null;
  lastMessageAt?: string | null;
  last_message_preview?: string | null;
  lastMessagePreview?: string | null;
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
  assigned_agent_id?: string | null;
  assignedAgentId?: string | null;
  assignment_status?: string | null;
  assignmentStatus?: string | null;
  priority?: string | null;
  /** Flat lead status from lean inbox list DTO. */
  lead_status?: string | null;
  leadStatus?: string | null;
  contact_identity_display_name?: string | null;
  contact_identity_profile_image_url?: string | null;
  /** From GET /api/conversations (snake_case row). */
  follow_up_at?: string | null;
  follow_up_note?: string | null;
  sla_due_at?: string | null;
  first_response_at?: string | null;
  last_customer_message_at?: string | null;
  last_agent_message_at?: string | null;
  /** Optional camelCase mirror when rows are normalized client-side. */
  followUpAt?: string | null;
  followUpNote?: string | null;
  slaDueAt?: string | null;
  firstResponseAt?: string | null;
  lastCustomerMessageAt?: string | null;
  lastAgentMessageAt?: string | null;
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
  succeededActions: OutboundSendKind[];
  failedStep?: OutboundSendKind;
  failedAction?: OutboundSendKind;
  failedKind?: "text" | "image" | "pdf";
  errorMessage?: string;
  /** Backward-compat alias; prefer errorMessage. */
  error?: string;
}

function failedStepLabel(step: OutboundSendKind | undefined): string {
  if (step === "text") return "text";
  if (step === "image") return "image";
  if (step === "document_pdf") return "PDF";
  return "message";
}

export function buildComposerErrorMessage(result: ComposerSequenceResult): string {
  const rawReason = (result.errorMessage ?? result.error ?? "").trim();
  if (rawReason.includes("Instagram Send API outside-window")) {
    return "ส่ง Instagram DM ไม่ได้ เนื่องจากอยู่นอกช่วงเวลาที่ Meta อนุญาต กรุณาให้ลูกค้าทัก DM ใหม่ก่อน";
  }
  const failedAction = result.failedAction ?? result.failedStep;
  if (result.status === "partial_success" && result.succeededActions.includes("text") && failedAction === "image") {
    return "Text sent successfully, but image failed to send.";
  }
  if (result.status === "partial_success" && result.succeededActions.includes("text") && failedAction === "document_pdf") {
    return "Text sent successfully, but PDF failed to send.";
  }
  if (result.status === "failure") {
    const label = failedStepLabel(failedAction);
    const reason = result.errorMessage ?? result.error;
    if (reason && reason.trim()) return `Failed to send ${label}: ${reason}`;
    return `Failed to send ${label}.`;
  }
  return `Failed to send message: ${result.errorMessage ?? result.error ?? "unknown error"}`;
}

const MAX_UPLOAD_BYTES = MEDIA_UPLOAD_MAX_BYTES;
const MAX_FB_IMAGE_BYTES = MEDIA_META_IMAGE_MAX_BYTES;
const MAX_FB_PDF_BYTES = MEDIA_UPLOAD_MAX_BYTES;

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
    if (input.selectedChannel === "INSTAGRAM" && input.attachment.kind === "document_pdf") {
      errors.push(INSTAGRAM_OUTBOUND_PDF_NOT_SUPPORTED);
      return errors;
    }
    if (input.attachment.kind === "image") {
      if (!isAllowedOutboundImageMime(input.attachment.type)) {
        errors.push("Unsupported image type. Use JPEG, PNG, or WEBP.");
      }
      if (input.attachment.size > MAX_UPLOAD_BYTES) {
        errors.push("Image file is too large (max 10MB).");
      }
      if (input.selectedChannel === "FACEBOOK" && input.attachment.size > MAX_FB_IMAGE_BYTES) {
        errors.push("Facebook Messenger image must be <= 8MB.");
      }
      if (input.selectedChannel === "INSTAGRAM" && input.attachment.size > MAX_FB_IMAGE_BYTES) {
        errors.push("Instagram DM image must be <= 8MB.");
      }
    } else {
      if (input.attachment.type !== OUTBOUND_PDF_MIME) {
        errors.push("Unsupported file type. Use PDF for document attachments.");
      }
      if (input.attachment.size > MAX_UPLOAD_BYTES) {
        errors.push("PDF file is too large (max 10MB).");
      }
      if (input.selectedChannel === "FACEBOOK" && input.attachment.size > MAX_FB_PDF_BYTES) {
        errors.push(`Facebook Messenger PDF must be <= ${Math.floor(MAX_FB_PDF_BYTES / (1024 * 1024))}MB.`);
      }
    }
  }
  return errors;
}

export function attachmentKindFromMime(mimeType: string): ComposerAttachmentKind | null {
  if (isAllowedOutboundImageMime(mimeType)) return "image";
  if (mimeType === OUTBOUND_PDF_MIME) return "document_pdf";
  return null;
}

export function buildSendSequence(input: {
  text: string;
  attachmentKind: ComposerAttachmentKind | null;
  selectedChannel: OutboundChannel;
}): ComposerSendStep[] {
  const steps: ComposerSendStep[] = [];
  // Instagram image outbound sends one IMAGE command with caption in `content`.
  if (!(input.selectedChannel === "INSTAGRAM" && input.attachmentKind === "image") && input.text.trim()) {
    steps.push({ kind: "text" });
  }
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
            succeededActions: [...successfulSteps],
            failedStep: step.kind,
            failedAction: step.kind,
            failedKind: step.kind === "document_pdf" ? "pdf" : step.kind,
            errorMessage: String(error),
            error: String(error)
          }
        : {
            status: "failure",
            successfulSteps: [],
            succeededActions: [],
            failedStep: step.kind,
            failedAction: step.kind,
            failedKind: step.kind === "document_pdf" ? "pdf" : step.kind,
            errorMessage: String(error),
            error: String(error)
          };
    }
  }
  return { status: "success", successfulSteps, succeededActions: [...successfulSteps] };
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
    row.contact_identity_display_name,
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
    row.contact_identity_profile_image_url,
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

export interface LeadListItem {
  leadKey: string;
  platform: string;
  displayName: string;
  avatarPlan: ConversationAvatarPlan;
  latestConversationId: string;
  conversationIds: string[];
  latestMessagePreview: string;
  latestMessageAt: string;
  unreadCountTotal: number;
  conversationCount: number;
  isFacebookCommentOrigin: boolean;
  /** From latest thread row in the lead group (Team Inbox). */
  latestAssignedAgentId: string | null;
  latestAssignmentStatus: string;
  latestPriority: string;
  /** Latest thread `conversations.status`. */
  latestConversationStatus: string;
  /** From nested `leads.status` on latest row when present. */
  latestLeadStatus: string;
  /** Latest thread timestamps from GET /api/conversations (snake_case). */
  follow_up_at: string | null;
  follow_up_note: string | null;
  sla_due_at: string | null;
  first_response_at: string | null;
  last_customer_message_at: string | null;
  last_agent_message_at: string | null;
}

function normalizeString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeDateIso(value: unknown): string {
  const raw = normalizeString(value);
  if (!raw) return "";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString();
}

/** Optional API field (snake_case or camelCase) → trimmed string or null. */
function readLatestRowString(row: ConversationParticipantFallbackRow, snake: string, camel: string): string | null {
  const r = row as Record<string, unknown>;
  const raw = r[snake] ?? r[camel];
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

function resolveTenantKey(row: ConversationParticipantFallbackRow, fallbackTenantId?: string): string {
  return (
    normalizeString(row.tenant_id) ||
    normalizeString(row.tenantId) ||
    normalizeString(fallbackTenantId) ||
    "unknown-tenant"
  );
}

export function resolveLeadPlatform(row: ConversationParticipantFallbackRow): string {
  const raw = normalizeString(row.channel_type) || normalizeString(row.channelType);
  return raw ? raw.toUpperCase() : "LINE";
}

export function resolveLeadIdentityKey(
  row: ConversationParticipantFallbackRow,
  options?: { tenantId?: string }
): string {
  const tenantKey = resolveTenantKey(row, options?.tenantId);
  const platform = resolveLeadPlatform(row);
  const externalIdentity =
    normalizeString(row.provider_external_user_id) ||
    normalizeString(row.providerExternalUserId) ||
    normalizeString(row.external_user_id) ||
    normalizeString(row.externalUserId);
  if (externalIdentity) return `${tenantKey}|${platform}|ext:${externalIdentity}`;
  const contactIdentity = normalizeString(row.contact_id) || normalizeString(row.contactId);
  if (contactIdentity) return `${tenantKey}|${platform}|contact:${contactIdentity}`;
  const threadIdentity = normalizeString(row.channel_thread_id) || normalizeString(row.channelThreadId);
  if (threadIdentity) return `${tenantKey}|${platform}|thread:${threadIdentity}`;
  return `${tenantKey}|${platform}|unknown`;
}

export function buildLeadListItems(
  conversations: ConversationParticipantFallbackRow[],
  options?: { tenantId?: string }
): LeadListItem[] {
  const grouped = new Map<string, ConversationParticipantFallbackRow[]>();
  for (const conversation of conversations) {
    const key = resolveLeadIdentityKey(conversation, options);
    const list = grouped.get(key);
    if (list) {
      list.push(conversation);
    } else {
      grouped.set(key, [conversation]);
    }
  }

  const leadItems: LeadListItem[] = [];
  for (const [leadKey, rows] of grouped.entries()) {
    const sortedRows = [...rows].sort((a, b) => {
      const aTime = normalizeDateIso((a as { last_message_at?: string; lastMessageAt?: string }).last_message_at) ||
        normalizeDateIso((a as { last_message_at?: string; lastMessageAt?: string }).lastMessageAt);
      const bTime = normalizeDateIso((b as { last_message_at?: string; lastMessageAt?: string }).last_message_at) ||
        normalizeDateIso((b as { last_message_at?: string; lastMessageAt?: string }).lastMessageAt);
      if (aTime === bTime) return normalizeString((b as { id?: string }).id).localeCompare(normalizeString((a as { id?: string }).id));
      return aTime < bTime ? 1 : -1;
    });
    const latest = sortedRows[0];
    if (!latest || !normalizeString((latest as { id?: string }).id)) continue;

    const bestNamed = sortedRows.find((row) => {
      const value = resolveConversationParticipantName(row);
      return value !== "Unknown User";
    }) ?? latest;

    const bestAvatarSource = sortedRows.find((row) => resolveConversationAvatarPlan(row).kind === "image")
      ?? sortedRows.find((row) => resolveConversationAvatarPlan(row).kind === "initials")
      ?? bestNamed;

    const unreadCountTotal = sortedRows.reduce((sum, row) => sum + resolveConversationUnreadCount(row), 0);
    const latestMessagePreview =
      normalizeString((latest as { lastMessagePreview?: string; last_message_preview?: string }).lastMessagePreview) ||
      normalizeString((latest as { lastMessagePreview?: string; last_message_preview?: string }).last_message_preview);
    const latestMessageAt =
      normalizeDateIso((latest as { lastMessageAt?: string; last_message_at?: string }).lastMessageAt) ||
      normalizeDateIso((latest as { lastMessageAt?: string; last_message_at?: string }).last_message_at);
    const isFacebookCommentOrigin = sortedRows.some((row) => {
      const threadType =
        normalizeString((row as { provider_thread_type?: string; providerThreadType?: string }).provider_thread_type) ||
        normalizeString((row as { provider_thread_type?: string; providerThreadType?: string }).providerThreadType);
      return threadType === "FACEBOOK_COMMENT";
    });

    const latestAssignedRaw =
      normalizeString((latest as { assigned_agent_id?: string | null; assignedAgentId?: string | null }).assigned_agent_id) ||
      normalizeString((latest as { assigned_agent_id?: string | null; assignedAgentId?: string | null }).assignedAgentId);
    const latestAssignedAgentId = latestAssignedRaw.length > 0 ? latestAssignedRaw : null;
    const latestAssignmentStatus =
      normalizeString((latest as { assignment_status?: string | null; assignmentStatus?: string | null }).assignment_status) ||
      normalizeString((latest as { assignment_status?: string | null; assignmentStatus?: string | null }).assignmentStatus) ||
      "UNASSIGNED";
    const latestPriority = normalizeString((latest as { priority?: string | null }).priority) || "NORMAL";
    const latestConversationStatus =
      normalizeString((latest as { status?: string | null }).status) || "OPEN";
    const leadNested = (latest as { leads?: { status?: string } | { status?: string }[] | null }).leads;
    const leadObj = Array.isArray(leadNested) ? leadNested[0] : leadNested;
    const latestLeadStatus =
      normalizeString((latest as { lead_status?: string | null; leadStatus?: string | null }).lead_status) ||
      normalizeString((latest as { lead_status?: string | null; leadStatus?: string | null }).leadStatus) ||
      normalizeString(leadObj?.status) ||
      "";

    const follow_up_at = readLatestRowString(latest, "follow_up_at", "followUpAt");
    const follow_up_note = readLatestRowString(latest, "follow_up_note", "followUpNote");
    const sla_due_at = readLatestRowString(latest, "sla_due_at", "slaDueAt");
    const first_response_at = readLatestRowString(latest, "first_response_at", "firstResponseAt");
    const last_customer_message_at = readLatestRowString(latest, "last_customer_message_at", "lastCustomerMessageAt");
    const last_agent_message_at = readLatestRowString(latest, "last_agent_message_at", "lastAgentMessageAt");

    leadItems.push({
      leadKey,
      platform: resolveLeadPlatform(latest),
      displayName: resolveConversationParticipantName(bestNamed),
      avatarPlan: resolveConversationAvatarPlan(bestAvatarSource),
      latestConversationId: normalizeString((latest as { id?: string }).id),
      conversationIds: sortedRows
        .map((row) => normalizeString((row as { id?: string }).id))
        .filter((id) => id.length > 0),
      latestMessagePreview,
      latestMessageAt,
      unreadCountTotal,
      conversationCount: sortedRows.length,
      isFacebookCommentOrigin,
      latestAssignedAgentId,
      latestAssignmentStatus,
      latestPriority,
      latestConversationStatus,
      latestLeadStatus,
      follow_up_at,
      follow_up_note,
      sla_due_at,
      first_response_at,
      last_customer_message_at,
      last_agent_message_at
    });
  }

  return leadItems.sort((a, b) => {
    if (a.latestMessageAt === b.latestMessageAt) return b.latestConversationId.localeCompare(a.latestConversationId);
    return a.latestMessageAt < b.latestMessageAt ? 1 : -1;
  });
}
