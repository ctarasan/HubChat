"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  attachmentKindFromMime,
  buildLeadListItems,
  buildSendSequence,
  buildComposerErrorMessage,
  canSubmitComposer,
  initialsAvatarFromDisplayName,
  performSendSequence,
  resolveConversationAvatarPlan,
  resolveLeadListItemAvatarPlan,
  syncInboxConversationAvatarFields,
  resolveLeadIdentityKey,
  resolveLeadPlatform,
  resolveConversationParticipantName,
  resolveConversationUnreadCount,
  type LeadListItem,
  type OutboundChannel,
  type SelectedAttachment,
  validateComposer
} from "./chatComposerModel.js";
import { clearSessionConfig, hasRequiredSessionConfig, loadSessionConfig, type SessionConfig } from "./sessionConfig.js";
import {
  canManageConversationAssignments,
  formatSalesAgentDisplayLabel,
  getComposerOwnershipState,
  type DashboardRole
} from "./teamInboxDashboardHelpers.js";
import {
  applyActionFilterPreset,
  buildConversationsListQuerySuffix,
  clearAllInboxFilters,
  computeInboxFirstPageSummary,
  copyInboxFilters,
  defaultDashboardInboxFiltersForRole,
  hasActiveInboxFilters,
  listActiveFilterBadges,
  mergeInboxFilters,
  type ChannelFilter,
  type ConversationStatusFilter,
  type DashboardInboxFilterState,
  type FollowUpFilter,
  type InboxActionFilterPreset,
  type InboxScopeFilter,
  type LeadManagementStatusFilter,
  type SlaFilter,
  type WaitingFilter
} from "./dashboardInboxFilters.js";
import {
  formatDashboardLoadError,
  getChatMessagesEmptyHint,
  getInboxSidebarPresentation,
  resolveInboxSelectionAfterListRefresh,
  shouldReloadMessagesForSelection
} from "./dashboardInboxStability.js";
import {
  DashboardAppRail,
  DashboardAppRailReloadButton,
  DashboardAppRailSetupLink,
  DashboardAppRailSignOutButton
} from "./DashboardAppRail.js";
import {
  formatFollowUpHeaderLine,
  resolveInboxBadgeDescriptors,
  type InboxBadgeDescriptor,
  type InboxBadgeSlaOptions
} from "./inboxBadgeLabels.js";
import { readListSlaWarningBeforeBreachMinutes } from "../interfaces/api/listSlaPageInfo.js";
import {
  buildFollowUpClearPatch,
  buildFollowUpSavePatch,
  conversationFollowUpPatchPath,
  followUpDraftFromConversationFields,
  getFollowUpStateDescriptor,
  mergeConversationFollowUpFromPayload,
  FOLLOW_UP_NOTE_MAX_LENGTH,
  validateFollowUpSaveDraft
} from "./followUpEditorModel.js";
import {
  buildLeadStatusPatch,
  buildQualifiedLeadStatusPatch,
  canShowMarkQualifiedLeadAction,
  conversationLeadStatusPatchPath,
  getConversationLeadDisplayLabel,
  getLeadManagementStatusLabel,
  isLeadFunnelQualified,
  listAllowedLeadManagementStatusTransitions,
  mapLeadStatusSaveError,
  mergeConversationLeadStatusFromPayload,
  resolveLeadManagementStatusFromRow,
  type LeadManagementStatus
} from "./leadStatusEditorModel.js";
import { ChannelConnectionLabel } from "./ChannelConnectionLabel.js";
import { ChannelConnectionScopeToggle } from "./ChannelConnectionScopeToggle.js";
import {
  readConnectionScopeFieldsFromRow,
  resolveConnectionDetailBanner
} from "./channelConnectionScopeModel.js";
import { LeadSourceBadge } from "./LeadSourceBadge.js";
import { resolveLeadSourceBadge } from "./leadSourceBadgeModel.js";
import {
  DashboardConversationPollScheduler,
  parseConversationsPollIntervalMs
} from "./dashboardPollGovernance.js";
import { MarketingTimelinePanel, type MarketingTimelinePanelStatus } from "./MarketingTimelinePanel.js";
import type { MarketingTimelineItemViewModel } from "./marketingTimelineModel.js";
import {
  fetchMarketingEventsList,
  mergeMarketingTimelineItems,
  mapMarketingEventToTimelineItem,
  readConversationLeadId,
  MARKETING_EVENTS_DEFAULT_LIMIT
} from "./marketingTimelineApi.js";

const DEBUG_MEDIA = process.env.NEXT_PUBLIC_DEBUG_MEDIA === "true";

type ConversationRow = {
  id: string;
  tenant_id?: string | null;
  tenantId?: string | null;
  lead_id?: string;
  leadId?: string;
  channel_type?: OutboundChannel;
  channelType?: OutboundChannel;
  channel_thread_id?: string;
  channelThreadId?: string;
  contact_id?: string | null;
  contactId?: string | null;
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
  provider_external_user_id?: string | null;
  providerExternalUserId?: string | null;
  last_message_at?: string | null;
  lastMessageAt?: string | null;
  unreadCount?: number;
  unread_count?: number;
  last_message_preview?: string | null;
  lastMessagePreview?: string | null;
  last_message_type?: string | null;
  lastMessageType?: string | null;
  provider_thread_type?: "MESSENGER_DM" | "FACEBOOK_COMMENT" | "INSTAGRAM_DM" | "INSTAGRAM_COMMENT" | null;
  private_reply_sent_at?: string | null;
  source_type?: "DM" | "COMMENT" | "PRIVATE_REPLY" | "CHAT" | "UNKNOWN" | null;
  sourceType?: "DM" | "COMMENT" | "PRIVATE_REPLY" | "CHAT" | "UNKNOWN" | null;
  source_label?: string | null;
  sourceLabel?: string | null;
  has_comment_context?: boolean | null;
  hasCommentContext?: boolean | null;
  has_private_reply?: boolean | null;
  hasPrivateReply?: boolean | null;
  assigned_agent_id?: string | null;
  assignedAgentId?: string | null;
  assignment_status?: string | null;
  assignmentStatus?: string | null;
  priority?: string | null;
  status?: string | null;
  resolved_at?: string | null;
  resolvedAt?: string | null;
  leads?: { status?: string | null } | null;
  lead_status?: string | null;
  leadStatus?: string | null;
  lead_management_status?: string | null;
  leadManagementStatus?: string | null;
  contact_identity_display_name?: string | null;
  contact_identity_profile_image_url?: string | null;
  follow_up_at?: string | null;
  follow_up_note?: string | null;
  sla_due_at?: string | null;
  first_response_at?: string | null;
  last_customer_message_at?: string | null;
  last_agent_message_at?: string | null;
  connection_label?: string | null;
  connection_scope_bucket?: string | null;
  connectionLabel?: string | null;
  connectionScopeBucket?: string | null;
};

type MessageRow = {
  id: string;
  conversationId?: string;
  conversation_id?: string;
  direction: "INBOUND" | "OUTBOUND";
  content: string;
  messageType?: string;
  message_type?: string;
  channelType?: string;
  channel_type?: string;
  mediaUrl?: string | null;
  media_url?: string | null;
  previewUrl?: string | null;
  preview_url?: string | null;
  metadataJson?: Record<string, unknown>;
  metadata_json?: Record<string, unknown>;
  occurredAt?: string;
  occurred_at?: string;
  createdAt?: string;
  created_at?: string;
};

type UploadedAttachment =
  | {
      kind: "image";
      mediaUrl: string;
      previewUrl?: string;
      mimeType: "image/jpeg" | "image/png" | "image/webp";
      fileName: string;
      fileSizeBytes: number;
      width?: number;
      height?: number;
    }
  | {
      kind: "document_pdf";
      fileUrl: string;
      mimeType: "application/pdf";
      fileName: string;
      fileSizeBytes: number;
    };

type TimelineEntry =
  | { kind: "date"; key: string; label: string }
  | { kind: "message"; key: string; message: MessageRow; timeLabel: string };

type MeContext = {
  tenantId: string;
  userId: string;
  email: string;
  role: DashboardRole;
  salesAgentId: string | null;
};

type SalesAgentRow = { id: string; email: string; name: string; role: string; status: string };

function getField<T>(row: any, names: string[], fallback?: T): T | undefined {
  for (const key of names) {
    if (row && row[key] !== undefined && row[key] !== null) return row[key] as T;
  }
  return fallback;
}

const CONVERSATION_PAGE_LIMIT = 25;
const MESSAGE_PAGE_LIMIT = 30;

function mapApiConversationRow(row: Record<string, unknown>, tenantId: string): ConversationRow {
  const leadStatus =
    typeof row.lead_status === "string"
      ? row.lead_status
      : typeof (row as { leadStatus?: string }).leadStatus === "string"
        ? (row as { leadStatus?: string }).leadStatus
        : null;
  const leadManagementStatus =
    typeof row.lead_management_status === "string"
      ? row.lead_management_status
      : typeof (row as { leadManagementStatus?: string }).leadManagementStatus === "string"
        ? (row as { leadManagementStatus?: string }).leadManagementStatus
        : null;
  const mapped = {
    ...(row as ConversationRow),
    tenant_id: (row.tenant_id as string | undefined) ?? tenantId,
    contact_id: (row.contact_id as string | undefined) ?? null,
    leads: leadStatus ? { status: leadStatus } : (row as ConversationRow).leads,
    lead_status: leadStatus,
    lead_management_status: leadManagementStatus,
    provider_external_user_id:
      (row.provider_external_user_id as string | undefined) ??
      ((row as ConversationRow).providerExternalUserId as string | undefined),
    external_user_id: (row.external_user_id as string | undefined) ?? undefined,
    contactIdentityDisplayName:
      (row.contact_identity_display_name as string | undefined) ??
      (row.contactIdentityDisplayName as string | undefined),
    contact_identity_display_name: (row.contact_identity_display_name as string | undefined) ?? null,
    contactIdentityProfileImageUrl:
      (row.contact_identity_profile_image_url as string | undefined) ??
      (row.contactIdentityProfileImageUrl as string | undefined),
    contact_identity_profile_image_url: (row.contact_identity_profile_image_url as string | undefined) ?? null,
    unreadCount:
      typeof row.unread_count === "number"
        ? Number(row.unread_count)
        : typeof (row as { unreadCount?: number }).unreadCount === "number"
          ? Number((row as { unreadCount?: number }).unreadCount)
          : 0,
    unread_count: typeof row.unread_count === "number" ? Number(row.unread_count) : 0,
    lastMessagePreview:
      typeof row.last_message_preview === "string"
        ? String(row.last_message_preview)
        : typeof (row as { lastMessagePreview?: string }).lastMessagePreview === "string"
          ? String((row as { lastMessagePreview?: string }).lastMessagePreview)
          : "",
    last_message_preview:
      typeof row.last_message_preview === "string" ? String(row.last_message_preview) : "",
    lastMessageAt:
      typeof row.last_message_at === "string"
        ? String(row.last_message_at)
        : typeof (row as { lastMessageAt?: string }).lastMessageAt === "string"
          ? String((row as { lastMessageAt?: string }).lastMessageAt)
          : "",
    last_message_at: typeof row.last_message_at === "string" ? String(row.last_message_at) : "",
    participant_profile_image_url:
      typeof row.participant_profile_image_url === "string"
        ? String(row.participant_profile_image_url)
        : typeof (row as ConversationRow).participantProfileImageUrl === "string"
          ? String((row as ConversationRow).participantProfileImageUrl)
          : null,
    participantProfileImageUrl:
      typeof row.participant_profile_image_url === "string"
        ? String(row.participant_profile_image_url)
        : typeof (row as ConversationRow).participantProfileImageUrl === "string"
          ? String((row as ConversationRow).participantProfileImageUrl)
          : undefined,
    channel_thread_id:
      typeof row.channel_thread_id === "string"
        ? String(row.channel_thread_id)
        : typeof (row as ConversationRow).channelThreadId === "string"
          ? String((row as ConversationRow).channelThreadId)
          : undefined,
    channelThreadId:
      typeof row.channel_thread_id === "string"
        ? String(row.channel_thread_id)
        : typeof (row as ConversationRow).channelThreadId === "string"
          ? String((row as ConversationRow).channelThreadId)
          : undefined
  } as ConversationRow;
  syncInboxConversationAvatarFields(mapped);
  return mapped;
}

function mergeConversationAssignmentFromPayload(row: ConversationRow, payload: Record<string, unknown>): ConversationRow {
  const assignedRaw =
    (typeof payload.assignedAgentId === "string" && payload.assignedAgentId.trim()) ||
    (typeof payload.assigned_agent_id === "string" && payload.assigned_agent_id.trim()) ||
    "";
  const assigned = assignedRaw.length > 0 ? assignedRaw : null;
  const statusRaw =
    (typeof payload.assignmentStatus === "string" && payload.assignmentStatus.trim()) ||
    (typeof payload.assignment_status === "string" && payload.assignment_status.trim()) ||
    "";
  const assignmentStatus =
    statusRaw ||
    getField<string>(row, ["assignment_status", "assignmentStatus"], "") ||
    "UNASSIGNED";
  return {
    ...row,
    assigned_agent_id: assigned,
    assignedAgentId: assigned ?? undefined,
    assignment_status: assignmentStatus,
    assignmentStatus,
    status:
      (typeof payload.status === "string" && payload.status.trim()) ||
      getField<string>(row, ["status"], "OPEN") ||
      "OPEN"
  };
}

function mediaUrlFromAny(msg: MessageRow): string | null {
  const metadata = (msg.metadataJson ?? msg.metadata_json ?? {}) as Record<string, unknown>;
  const candidates = [
    msg.previewUrl,
    msg.preview_url,
    msg.mediaUrl,
    msg.media_url,
    metadata.previewUrl,
    metadata.mediaUrl
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function fileNameFromMessage(msg: MessageRow): string | null {
  const metadata = (msg.metadataJson ?? msg.metadata_json ?? {}) as Record<string, unknown>;
  const fileName = metadata.fileName as string | undefined;
  return typeof fileName === "string" && fileName.trim() ? fileName : null;
}

function formatFileSize(size: number | undefined): string {
  if (!size || size < 1) return "-";
  const kb = size / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function parseMessageCreatedAt(msg: MessageRow): Date | null {
  const raw = String(msg.occurredAt ?? msg.occurred_at ?? msg.createdAt ?? msg.created_at ?? "").trim();
  if (!raw) return null;
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function normalizeMessageRow(row: Record<string, unknown>, fallbackConversationId?: string): MessageRow {
  const msg = row as MessageRow;
  return {
    ...msg,
    conversationId:
      typeof msg.conversationId === "string"
        ? msg.conversationId
        : typeof msg.conversation_id === "string"
          ? msg.conversation_id
          : fallbackConversationId,
    messageType:
      typeof msg.messageType === "string"
        ? msg.messageType
        : typeof msg.message_type === "string"
          ? msg.message_type
          : undefined,
    mediaUrl:
      typeof msg.mediaUrl === "string"
        ? msg.mediaUrl
        : typeof msg.media_url === "string"
          ? msg.media_url
          : null,
    previewUrl:
      typeof msg.previewUrl === "string"
        ? msg.previewUrl
        : typeof msg.preview_url === "string"
          ? msg.preview_url
          : null,
    occurredAt:
      typeof msg.occurredAt === "string"
        ? msg.occurredAt
        : typeof msg.occurred_at === "string"
          ? msg.occurred_at
          : undefined,
    metadataJson: (msg.metadataJson ?? msg.metadata_json ?? {}) as Record<string, unknown>
  } as MessageRow;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateSeparator(dt: Date): string {
  return `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

function formatTimeLabel(dt: Date): string {
  return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

function formatInboxListTime(iso: string): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMsgDay = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const dayDiff = Math.round((startOfToday.getTime() - startOfMsgDay.getTime()) / 86400000);
  if (dayDiff === 0) return formatTimeLabel(dt);
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return dt.toLocaleDateString(undefined, { weekday: "short" });
  return formatDateSeparator(dt);
}

/** Outbound messages only: show Dashboard copy when provider send failed (metadata from worker). */
function outboundDeliveryFailureFromMetadata(metadata: Record<string, unknown>): { title: string; detail: string } | null {
  if (metadata.delivery_status !== "FAILED") return null;
  const msg = typeof metadata.delivery_error_message === "string" ? metadata.delivery_error_message.trim() : "";
  const reason = typeof metadata.reason === "string" ? metadata.reason.trim() : "";
  const raw = msg || reason;
  if (!raw) return null;
  const failedDeliveryTitle = "\u0E2A\u0E48\u0E07\u0E44\u0E21\u0E48\u0E1C\u0E48\u0E32\u0E19";
  const title = failedDeliveryTitle;
  let detail = raw;
  if (raw.startsWith(`${failedDeliveryTitle}: `)) {
    detail = raw.slice(`${failedDeliveryTitle}: `.length).trim();
  } else if (raw.startsWith(`${failedDeliveryTitle}\uFF1A`)) {
    detail = raw.slice(`${failedDeliveryTitle}\uFF1A`.length).trim();
  }
  return { title, detail: detail || raw };
}

function normalizeSelectedAttachmentMime(file: File): string {
  const rawType = String(file.type ?? "").trim().toLowerCase();
  if (rawType) return rawType;
  const name = String(file.name ?? "").toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".pdf")) return "application/pdf";
  return "";
}

function buildTimeline(messages: MessageRow[]): TimelineEntry[] {
  const timeline: TimelineEntry[] = [];
  let lastDateLabel = "";
  for (const msg of messages) {
    const createdAt = parseMessageCreatedAt(msg);
    const dateLabel = createdAt ? formatDateSeparator(createdAt) : "";
    if (dateLabel && dateLabel !== lastDateLabel) {
      timeline.push({ kind: "date", key: `date:${dateLabel}`, label: dateLabel });
      lastDateLabel = dateLabel;
    }
    timeline.push({
      kind: "message",
      key: `message:${msg.id}`,
      message: msg,
      timeLabel: createdAt ? formatTimeLabel(createdAt) : "--:--"
    });
  }
  return timeline;
}

function ConversationAvatar({ row }: { row: ConversationRow }) {
  const plan = resolveConversationAvatarPlan(row);
  const imageUrl = plan.kind === "image" ? plan.url : null;
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [imageUrl]);

  if (imageUrl && !broken) {
    return (
      <img
        className="conv-avatar conv-avatar-img"
        src={imageUrl}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  const initials =
    plan.kind === "initials"
      ? plan.initials
      : initialsAvatarFromDisplayName(resolveConversationParticipantName(row));
  if (initials) {
    return <span className="conv-avatar conv-avatar-initials">{initials}</span>;
  }
  return <span className="conv-avatar conv-avatar-generic">◎</span>;
}

function LeadAvatar({ item, conversations }: { item: LeadListItem; conversations: ConversationRow[] }) {
  const plan = useMemo(
    () => resolveLeadListItemAvatarPlan(item, conversations),
    [item, conversations]
  );
  const imageUrl = plan.kind === "image" ? plan.url : null;
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [imageUrl]);

  if (imageUrl && !broken) {
    return (
      <img
        className="conv-avatar conv-avatar-img"
        src={imageUrl}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  const initials =
    plan.kind === "initials" ? plan.initials : initialsAvatarFromDisplayName(item.displayName);
  if (initials) {
    return <span className="conv-avatar conv-avatar-initials">{initials}</span>;
  }
  return <span className="conv-avatar conv-avatar-generic">◎</span>;
}

function LeadListItemRow(props: {
  item: LeadListItem;
  conversations: ConversationRow[];
  active: boolean;
  onPick: () => void;
  onHide: () => void;
  assignmentSummary: string;
  conversationStatusLabel: string;
  leadStatusLabel: string;
  inboxBadges: InboxBadgeDescriptor[];
  includeDisconnectedConnections: boolean;
}) {
  const {
    item,
    conversations,
    active,
    onPick,
    onHide,
    assignmentSummary,
    conversationStatusLabel,
    leadStatusLabel,
    inboxBadges,
    includeDisconnectedConnections
  } = props;
  const previewShort =
    item.latestMessagePreview && item.latestMessagePreview.length > 72
      ? `${item.latestMessagePreview.slice(0, 72)}…`
      : item.latestMessagePreview;
  const listTimeLabel = formatInboxListTime(item.latestMessageAt);

  return (
    <div className={`conversation-list-item${active ? " conversation-list-item-active" : ""}`}>
      <button type="button" className="conversation-list-main-hit" onClick={onPick} aria-label={`Open ${item.displayName}`}>
      <div className="conversation-avatar-wrap">
        <LeadAvatar item={item} conversations={conversations} />
      </div>
      <div className="conversation-list-text">
        <div className="conversation-list-top">
          <div className="conversation-list-name-row">
            <strong>{item.displayName}</strong>
            {item.unreadCountTotal > 0 ? (
              <span
                className="unread-count-pill"
                aria-label={`Unread messages: ${item.unreadCountTotal}. Messages are received but not yet read.`}
                title="Unread messages received and processed, but not yet read by an agent"
              >
                {item.unreadCountTotal}
              </span>
            ) : null}
          </div>
          {listTimeLabel ? <time className="conversation-list-time" dateTime={item.latestMessageAt}>{listTimeLabel}</time> : null}
        </div>
        <div className="conversation-list-channel-row conversation-list-source-row">
          <LeadSourceBadge badge={item.leadSourceBadge} />
          {item.conversationCount > 1 ? (
            <span className="conversation-thread-count">{item.conversationCount} threads</span>
          ) : null}
        </div>
        <div className="conversation-list-connection-row" data-testid="inbox-row-connection">
          <ChannelConnectionLabel
            input={item.connectionScopeInput}
            includeDisconnectedChannels={includeDisconnectedConnections}
          />
        </div>
        {previewShort ? <div className="conversation-list-preview">{previewShort}</div> : null}
        <div className="hint conversation-list-assignment">{assignmentSummary}</div>
        <div className="conversation-list-badges-row">
          <span className="status-pill status-pill-conversation" title="Conversation status">
            {conversationStatusLabel}
          </span>
          {leadStatusLabel ? (
            <span className="status-pill status-pill-lead" title="Lead status">
              {leadStatusLabel}
            </span>
          ) : null}
          {inboxBadges.length > 0 ? (
            <span className="conversation-list-inbox-badges" role="list" aria-label="Inbox urgency">
              {inboxBadges.map((b, i) => (
                <span key={`${b.label}-${i}`} className={b.className} title={b.title} role="listitem">
                  {b.label}
                </span>
              ))}
            </span>
          ) : null}
        </div>
      </div>
      </button>
      <button
        type="button"
        className="conversation-trash-button"
        onClick={onHide}
        aria-label={`Hide ${item.displayName}`}
        title="Hide from list"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h2v9H7V9Zm4 0h2v9h-2V9Zm4 0h2v9h-2V9Z" />
        </svg>
      </button>
    </div>
  );
}

export default function DashboardPage() {
  const [hiddenLeadMap, setHiddenLeadMap] = useState<Record<string, string>>({});
  const [session, setSession] = useState<SessionConfig | null>(null);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draftText, setDraftText] = useState("");
  const [selectedAttachmentFile, setSelectedAttachmentFile] = useState<File | null>(null);
  const [selectedAttachment, setSelectedAttachment] = useState<SelectedAttachment | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [busyState, setBusyState] = useState<"" | "loading" | "uploading" | "sending">("");
  const [errorMessage, setErrorMessage] = useState("");
  const [inboxListError, setInboxListError] = useState("");
  const [resultMessage, setResultMessage] = useState("");
  const [meContext, setMeContext] = useState<MeContext | null>(null);
  const [meError, setMeError] = useState("");
  const [salesAgents, setSalesAgents] = useState<SalesAgentRow[]>([]);
  const [salesAgentsError, setSalesAgentsError] = useState("");
  const [inboxFilters, setInboxFilters] = useState<DashboardInboxFilterState>(() =>
    defaultDashboardInboxFiltersForRole(undefined)
  );
  const [inboxFiltersDrawerOpen, setInboxFiltersDrawerOpen] = useState(false);
  const [inboxFiltersDrawerDraft, setInboxFiltersDrawerDraft] = useState<DashboardInboxFilterState>(() =>
    defaultDashboardInboxFiltersForRole(undefined)
  );
  const [statusUpdateBusy, setStatusUpdateBusy] = useState(false);
  const [leadStatusUpdateBusy, setLeadStatusUpdateBusy] = useState(false);
  const [followUpPanelOpen, setFollowUpPanelOpen] = useState(false);
  const [followUpDraftAt, setFollowUpDraftAt] = useState("");
  const [followUpDraftNote, setFollowUpDraftNote] = useState("");
  const [followUpUpdateBusy, setFollowUpUpdateBusy] = useState(false);
  const [followUpPanelError, setFollowUpPanelError] = useState("");
  const [assignmentSelectedAgentId, setAssignmentSelectedAgentId] = useState("");
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [conversationsNextCursor, setConversationsNextCursor] = useState<string | null>(null);
  const [slaWarningBeforeBreachMinutes, setSlaWarningBeforeBreachMinutes] = useState<number | null>(null);
  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false);
  const [olderMessagesCursor, setOlderMessagesCursor] = useState<string | null>(null);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [marketingTimelineItems, setMarketingTimelineItems] = useState<MarketingTimelineItemViewModel[]>([]);
  const [marketingTimelineStatus, setMarketingTimelineStatus] =
    useState<MarketingTimelinePanelStatus>("idle");
  const [marketingTimelineError, setMarketingTimelineError] = useState("");
  const [marketingTimelineNextCursor, setMarketingTimelineNextCursor] = useState<string | null>(null);
  const [marketingTimelineLoadMoreBusy, setMarketingTimelineLoadMoreBusy] = useState(false);
  const [contextPanelOpen, setContextPanelOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 1100px)").matches;
  });
  const [contextPanelTab, setContextPanelTab] = useState<"details" | "marketing" | "activity">("details");
  const [chatHeaderActionsOpen, setChatHeaderActionsOpen] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const messageLoadSeqRef = useRef(0);
  const pendingForceScrollAfterMessagesRef = useRef(false);
  const pendingForceScrollConversationIdRef = useRef("");
  const loadedConversationIdRef = useRef("");
  const previousMessageCountRef = useRef(0);
  const scrollRafIdRef = useRef<number | null>(null);
  const loadConversationsRef = useRef<(options?: { silent?: boolean; append?: boolean }) => Promise<boolean>>(
    async () => false
  );
  const selectedConversationIdRef = useRef("");
  const inboxFiltersRef = useRef<DashboardInboxFilterState>(defaultDashboardInboxFiltersForRole(undefined));
  const meContextRef = useRef<MeContext | null>(null);
  const conversationsNextCursorRef = useRef<string | null>(null);
  const hasLoadedMoreConversationsRef = useRef(false);
  const marketingTimelineNextCursorRef = useRef<string | null>(null);
  const marketingTimelineLoadSeqRef = useRef(0);

  useEffect(() => {
    setSession(loadSessionConfig(globalThis.localStorage));
  }, []);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );
  const selectedConnectionScopeInput = useMemo(
    () => (selectedConversation ? readConnectionScopeFieldsFromRow(selectedConversation) : null),
    [selectedConversation]
  );
  const selectedConnectionDetailBanner = useMemo(
    () =>
      selectedConnectionScopeInput
        ? resolveConnectionDetailBanner(selectedConnectionScopeInput)
        : null,
    [selectedConnectionScopeInput]
  );
  const leadItems = useMemo(
    () => buildLeadListItems(conversations, { tenantId: session?.tenantId }),
    [conversations, session?.tenantId]
  );
  const inboxBadgeClock = useMemo(() => new Date(), [conversations]);
  const inboxBadgeSlaOptions = useMemo((): InboxBadgeSlaOptions | undefined => {
    if (slaWarningBeforeBreachMinutes == null) return undefined;
    return { slaWarningBeforeBreachMinutes };
  }, [slaWarningBeforeBreachMinutes]);
  const inboxFirstPageSummary = useMemo(
    () =>
      computeInboxFirstPageSummary(conversations, inboxBadgeClock, meContext?.salesAgentId ?? null),
    [conversations, inboxBadgeClock, meContext?.salesAgentId]
  );
  const visibleLeadItems = useMemo(
    () =>
      leadItems.filter((item) => {
        const hiddenAtIso = hiddenLeadMap[item.leadKey];
        if (!hiddenAtIso) return true;
        if (!item.latestMessageAt) return false;
        return item.latestMessageAt > hiddenAtIso;
      }),
    [leadItems, hiddenLeadMap]
  );
  const inboxSidebarPresentation = useMemo(
    () =>
      getInboxSidebarPresentation({
        meError,
        conversationsLoadError: inboxListError,
        listLoading: busyState === "loading" && visibleLeadItems.length === 0,
        visibleLeadCount: visibleLeadItems.length,
        totalConversationCount: conversations.length
      }),
    [meError, inboxListError, busyState, visibleLeadItems.length, conversations.length]
  );
  const chatMessagesEmptyHint = useMemo(
    () =>
      getChatMessagesEmptyHint({
        selectedConversationId,
        hasSelectedConversation: Boolean(selectedConversation),
        messagesLoading: busyState === "loading",
        messagesError: errorMessage,
        messageCount: messages.length
      }),
    [selectedConversationId, selectedConversation, busyState, errorMessage, messages.length]
  );
  const selectedLeadKey = useMemo(
    () => (selectedConversation ? resolveLeadIdentityKey(selectedConversation, { tenantId: session?.tenantId }) : ""),
    [selectedConversation, session?.tenantId]
  );
  const selectedLeadItem = useMemo(
    () =>
      (selectedLeadKey ? visibleLeadItems.find((item) => item.leadKey === selectedLeadKey) : null)
      ?? (selectedConversation ? visibleLeadItems.find((item) => item.latestConversationId === selectedConversation.id) : null)
      ?? null,
    [visibleLeadItems, selectedLeadKey, selectedConversation]
  );
  const contextChannel = getField<OutboundChannel>(selectedConversation, ["channel_type", "channelType"], "LINE");
  const activeChannel: OutboundChannel = contextChannel ?? "LINE";
  const canSubmit = canSubmitComposer({
    busy: Boolean(busyState),
    text: draftText,
    hasAttachment: Boolean(selectedAttachmentFile)
  });
  const selectedAssignedId = useMemo(() => {
    if (!selectedConversation) return "";
    return (getField<string>(selectedConversation, ["assigned_agent_id", "assignedAgentId"], "") ?? "").trim();
  }, [selectedConversation]);
  const selectedFollowUpAtIso = useMemo(() => {
    if (!selectedConversation) return null;
    const atRaw = (getField<string>(selectedConversation, ["follow_up_at", "followUpAt"], "") ?? "").trim();
    return atRaw || null;
  }, [selectedConversation]);
  const selectedFollowUpNote = useMemo(() => {
    if (!selectedConversation) return "";
    return (getField<string>(selectedConversation, ["follow_up_note", "followUpNote"], "") ?? "").trim();
  }, [selectedConversation]);
  const selectedFollowUpHeaderLine = useMemo(() => {
    if (!selectedConversation) return null;
    return formatFollowUpHeaderLine({
      follow_up_at: selectedFollowUpAtIso,
      follow_up_note: selectedFollowUpNote || null
    });
  }, [selectedConversation, selectedFollowUpAtIso, selectedFollowUpNote]);
  const selectedFollowUpState = useMemo(() => {
    if (!selectedConversation) return null;
    return getFollowUpStateDescriptor(inboxBadgeClock, selectedFollowUpAtIso);
  }, [selectedConversation, inboxBadgeClock, selectedFollowUpAtIso]);

  useEffect(() => {
    setChatHeaderActionsOpen(false);
  }, [selectedConversationId]);

  useEffect(() => {
    if (!selectedConversation) {
      setFollowUpPanelOpen(false);
      setFollowUpDraftAt("");
      setFollowUpDraftNote("");
      setFollowUpPanelError("");
      return;
    }
    const draft = followUpDraftFromConversationFields({
      follow_up_at: selectedFollowUpAtIso,
      follow_up_note: selectedFollowUpNote || null
    });
    setFollowUpDraftAt(draft.atLocal);
    setFollowUpDraftNote(draft.note);
    setFollowUpPanelOpen(false);
    setFollowUpPanelError("");
  }, [selectedConversation?.id]);
  const composerOwnership = useMemo(() => {
    if (!meContext) {
      return { canReplyByOwnership: true, reason: null as string | null };
    }
    return getComposerOwnershipState({
      role: meContext.role,
      salesAgentId: meContext.salesAgentId,
      selectedAssignedAgentId: selectedAssignedId || null,
      hasSelectedConversation: Boolean(selectedConversation)
    });
  }, [meContext, selectedConversation, selectedAssignedId]);
  const timeline = useMemo(() => buildTimeline(messages), [messages]);
  const inboxFilterBadges = useMemo(
    () => listActiveFilterBadges(meContext?.role, inboxFilters),
    [meContext?.role, inboxFilters]
  );
  const selectedContextInboxBadges = useMemo(() => {
    if (!selectedConversation) return [] as InboxBadgeDescriptor[];
    return resolveInboxBadgeDescriptors(inboxBadgeClock, {
      follow_up_at: selectedFollowUpAtIso,
      follow_up_note: selectedFollowUpNote || null,
      sla_due_at: getField<string>(selectedConversation, ["sla_due_at", "slaDueAt"]),
      last_customer_message_at: getField<string>(selectedConversation, [
        "last_customer_message_at",
        "lastCustomerMessageAt"
      ]),
      last_agent_message_at: getField<string>(selectedConversation, [
        "last_agent_message_at",
        "lastAgentMessageAt"
      ])
    }, inboxBadgeSlaOptions);
  }, [selectedConversation, inboxBadgeClock, selectedFollowUpAtIso, selectedFollowUpNote, inboxBadgeSlaOptions]);
  const filtersBusy = busyState === "loading";

  function patchInboxFilters(patch: Partial<DashboardInboxFilterState>) {
    setInboxFilters((prev) => mergeInboxFilters(prev, patch));
  }

  function openInboxFiltersDrawer() {
    setInboxFiltersDrawerDraft(copyInboxFilters(inboxFilters));
    setInboxFiltersDrawerOpen(true);
  }

  function closeInboxFiltersDrawer() {
    setInboxFiltersDrawerOpen(false);
  }

  function applyInboxFiltersDrawer() {
    setInboxFilters(copyInboxFilters(inboxFiltersDrawerDraft));
    setInboxFiltersDrawerOpen(false);
  }

  function patchInboxFiltersDrawer(patch: Partial<DashboardInboxFilterState>) {
    setInboxFiltersDrawerDraft((prev) => mergeInboxFilters(prev, patch));
  }

  function applyInboxActionPreset(preset: InboxActionFilterPreset) {
    setInboxFilters((prev) => mergeInboxFilters(prev, applyActionFilterPreset(preset)));
  }

  function applyInboxActionPresetToDrawer(preset: InboxActionFilterPreset) {
    setInboxFiltersDrawerDraft((prev) => mergeInboxFilters(prev, applyActionFilterPreset(preset)));
  }

  const isFirstFacebookCommentReply =
    activeChannel === "FACEBOOK" &&
    (selectedConversation?.provider_thread_type ?? null) === "FACEBOOK_COMMENT" &&
    !selectedConversation?.private_reply_sent_at;
  const FB_COMMENT_ATTACH_BLOCKED_TITLE = "ยังไม่สามารถแนบไฟล์ได้";
  const FB_COMMENT_ATTACH_BLOCKED_BODY_LINE_1 = "Facebook Comment private reply รองรับเฉพาะข้อความ Text";
  const FB_COMMENT_ATTACH_BLOCKED_BODY_LINE_2 = "แนบรูปได้หลังจากลูกค้าตอบกลับใน Messenger แล้ว";

  function isNearBottom(container: HTMLDivElement): boolean {
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceToBottom <= 96;
  }

  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior, block: "end" });
      return;
    }
    const container = chatScrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }

  function clearPendingForceScroll() {
    pendingForceScrollAfterMessagesRef.current = false;
    pendingForceScrollConversationIdRef.current = "";
  }

  async function apiFetch(path: string, init?: RequestInit): Promise<any> {
    const s = session;
    if (!s || !hasRequiredSessionConfig(s)) {
      throw new Error("Missing session configuration");
    }
    const res = await fetch(`${s.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${s.accessToken}`,
        "x-tenant-id": s.tenantId,
        ...(init?.headers ?? {})
      }
    });
    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    if (!res.ok) throw new Error(body?.error ?? body?.detail ?? text ?? `HTTP ${res.status}`);
    return body;
  }

  async function loadConversations(options?: { silent?: boolean; append?: boolean }): Promise<boolean> {
    const silent = Boolean(options?.silent);
    const append = Boolean(options?.append);
    const s = session;
    if (!s || !hasRequiredSessionConfig(s)) return false;
    const me = meContextRef.current;
    if (!me) return false;
    const cursor = append ? conversationsNextCursorRef.current : null;
    if (append && !cursor) return false;
    if (!silent && !append) {
      setErrorMessage("");
      setInboxListError("");
      setBusyState("loading");
    }
    if (append) {
      setLoadingMoreConversations(true);
    }
    const prevId = selectedConversationIdRef.current;
    const filterSuffix = buildConversationsListQuerySuffix(me.role, inboxFiltersRef.current);
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const listUrl = `/api/conversations?limit=${CONVERSATION_PAGE_LIMIT}${filterSuffix}${cursorParam}`;
    try {
      const res = await apiFetch(listUrl);
      const tenantId = s.tenantId;
      const pageRows = ((res?.data ?? []) as Array<Record<string, unknown>>).map((row) =>
        mapApiConversationRow(row, tenantId)
      );
      const nextCursor =
        typeof res?.pageInfo?.nextCursor === "string" && res.pageInfo.nextCursor.trim()
          ? res.pageInfo.nextCursor.trim()
          : null;
      const warningMinutes = readListSlaWarningBeforeBreachMinutes(res?.pageInfo);
      if (warningMinutes != null) setSlaWarningBeforeBreachMinutes(warningMinutes);
      setConversationsNextCursor(nextCursor);
      conversationsNextCursorRef.current = nextCursor;

      if (append) {
        hasLoadedMoreConversationsRef.current = true;
        setConversations((prev) => {
          const seen = new Set(prev.map((c) => c.id));
          const merged = [...prev];
          for (const row of pageRows) {
            if (!seen.has(row.id)) merged.push(row);
          }
          return merged;
        });
        if (!silent) {
          setResultMessage(`Loaded ${pageRows.length} more conversations`);
        }
        return true;
      }

      if (silent && hasLoadedMoreConversationsRef.current) {
        const freshMap = new Map(pageRows.map((r) => [r.id, r]));
        setConversations((prev) => prev.map((c) => freshMap.get(c.id) ?? c));
        return true;
      }

      hasLoadedMoreConversationsRef.current = false;
      setConversations(pageRows);
      const selection = resolveInboxSelectionAfterListRefresh({
        previousSelectedId: prevId,
        pageRows,
        tenantId,
        reloadMessagesForKeptSelection: !silent
      });
      setSelectedConversationId(selection.selectedConversationId);
      if (selection.shouldLoadMessages && selection.selectedConversationId) {
        await loadMessages(selection.selectedConversationId, selection.groupedConversationIds, {
          forceScroll: !silent
        });
        const leadForUnread = buildLeadListItems(pageRows, { tenantId }).find(
          (item) => item.latestConversationId === selection.selectedConversationId
        );
        if (!silent && leadForUnread && leadForUnread.unreadCountTotal > 0) {
          await markConversationRead(leadForUnread.conversationIds);
        }
      } else if (!selection.selectedConversationId) {
        loadedConversationIdRef.current = "";
        clearPendingForceScroll();
        setMessages([]);
        setOlderMessagesCursor(null);
      }
      if (!silent) {
        setResultMessage(`Loaded ${pageRows.length} conversations`);
      }
      return true;
    } catch (error) {
      if (!silent) {
        setInboxListError(formatDashboardLoadError("Conversation list load failed", error));
      } else if (process.env.NODE_ENV !== "production") {
        console.warn("[dashboard] silent conversation refresh failed", error);
      }
      return false;
    } finally {
      if (!silent && !append) {
        setBusyState("");
      }
      if (append) {
        setLoadingMoreConversations(false);
      }
    }
  }

  async function loadMoreConversations() {
    await loadConversations({ append: true });
  }

  loadConversationsRef.current = loadConversations;

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    if (!meContext || meError) return;
    const selectedId = selectedConversationId.trim();
    if (!selectedId) return;
    if (busyState === "loading") return;

    if (selectedConversation) {
      if (
        shouldReloadMessagesForSelection(selectedId, loadedConversationIdRef.current) &&
        !loadingOlderMessages
      ) {
        const ids = selectedLeadItem?.conversationIds ?? [selectedId];
        void loadMessages(selectedId, ids);
      }
      return;
    }

    const firstVisible = visibleLeadItems[0];
    if (firstVisible) {
      setSelectedConversationId(firstVisible.latestConversationId);
      void loadMessages(firstVisible.latestConversationId, firstVisible.conversationIds, {
        forceScroll: true
      });
      return;
    }

    setSelectedConversationId("");
    loadedConversationIdRef.current = "";
    clearPendingForceScroll();
    setMessages([]);
    setOlderMessagesCursor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedConversationId,
    selectedConversation,
    visibleLeadItems,
    meContext,
    meError,
    busyState,
    loadingOlderMessages
  ]);

  useEffect(() => {
    inboxFiltersRef.current = inboxFilters;
  }, [inboxFilters]);

  useEffect(() => {
    meContextRef.current = meContext;
  }, [meContext]);

  useEffect(() => {
    const conv = conversations.find((c) => c.id === selectedConversationId);
    const raw = conv ? getField<string>(conv, ["assigned_agent_id", "assignedAgentId"], "") : "";
    setAssignmentSelectedAgentId((raw ?? "").trim());
  }, [selectedConversationId, conversations]);

  useEffect(() => {
    if (!session || !hasRequiredSessionConfig(session)) return;
    const conversationId = selectedConversationId.trim();
    if (!conversationId) {
      marketingTimelineLoadSeqRef.current += 1;
      setMarketingTimelineStatus("idle");
      setMarketingTimelineItems([]);
      setMarketingTimelineError("");
      setMarketingTimelineNextCursor(null);
      marketingTimelineNextCursorRef.current = null;
      return;
    }
    void loadMarketingEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationId, session?.baseUrl, session?.tenantId, session?.accessToken]);

  useEffect(() => {
    if (!session || !hasRequiredSessionConfig(session)) return;
    let cancelled = false;
    setMeError("");
    (async () => {
      try {
        const res = await apiFetch("/api/me");
        if (cancelled) return;
        const data = res?.data as MeContext | undefined;
        if (!data || typeof data.role !== "string") {
          throw new Error("Invalid /api/me response");
        }
        setMeContext(data);
        setInboxFilters(defaultDashboardInboxFiltersForRole(data.role));
      } catch (e) {
        if (!cancelled) {
          setMeContext(null);
          setMeError(`Could not load user profile: ${String(e)}`);
          setConversations([]);
          setSelectedConversationId("");
          setMessages([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.baseUrl, session?.tenantId, session?.accessToken]);

  useEffect(() => {
    if (!session || !hasRequiredSessionConfig(session)) return;
    const me = meContext;
    if (!me || meError) return;
    if (me.role !== "MANAGER" && me.role !== "ADMIN") {
      setSalesAgents([]);
      setSalesAgentsError("");
      return;
    }
    let cancelled = false;
    setSalesAgentsError("");
    (async () => {
      try {
        const res = await apiFetch("/api/sales-agents");
        if (cancelled) return;
        setSalesAgents((res?.data ?? []) as SalesAgentRow[]);
      } catch (e) {
        if (!cancelled) {
          setSalesAgents([]);
          setSalesAgentsError(`Could not load sales agents: ${String(e)}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.baseUrl, session?.tenantId, session?.accessToken, meContext?.userId, meContext?.role, meError]);

  useEffect(() => {
    if (!session || !hasRequiredSessionConfig(session)) return;
    if (!meContext || meError) return;
    void loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    session?.baseUrl,
    session?.tenantId,
    session?.accessToken,
    meContext?.userId,
    meContext?.role,
    inboxFilters,
    meError
  ]);

  useEffect(() => {
    if (!session || !hasRequiredSessionConfig(session)) return;
    if (!meContext || meError) return;
    const pollMs = parseConversationsPollIntervalMs();
    const scheduler = new DashboardConversationPollScheduler({
      baseIntervalMs: pollMs,
      refresh: () => loadConversationsRef.current({ silent: true })
    });
    scheduler.start();
    const onVisibility = () => scheduler.onDocumentVisibilityChange();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      scheduler.stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [session?.baseUrl, session?.tenantId, session?.accessToken, meContext?.userId, meError]);

  useEffect(() => {
    if (!session?.tenantId) return;
    try {
      const raw = globalThis.localStorage.getItem(`hubchat.hidden.leads.v1:${session.tenantId}`);
      if (!raw) {
        setHiddenLeadMap({});
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, string>;
      setHiddenLeadMap(parsed && typeof parsed === "object" ? parsed : {});
    } catch {
      setHiddenLeadMap({});
    }
  }, [session?.tenantId]);

  useEffect(() => {
    if (!session?.tenantId) return;
    globalThis.localStorage.setItem(`hubchat.hidden.leads.v1:${session.tenantId}`, JSON.stringify(hiddenLeadMap));
  }, [hiddenLeadMap, session?.tenantId]);

  useEffect(() => {
    return () => {
      if (scrollRafIdRef.current !== null) {
        cancelAnimationFrame(scrollRafIdRef.current);
        scrollRafIdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1100px)");
    const onChange = () => {
      if (!mq.matches) setContextPanelOpen(false);
    };
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useLayoutEffect(() => {
    const container = chatScrollRef.current;
    if (!container) return;
    if (scrollRafIdRef.current !== null) {
      cancelAnimationFrame(scrollRafIdRef.current);
      scrollRafIdRef.current = null;
    }
    const forceScroll =
      pendingForceScrollAfterMessagesRef.current &&
      pendingForceScrollConversationIdRef.current === selectedConversationId &&
      loadedConversationIdRef.current === selectedConversationId;

    if (messages.length === 0) {
      previousMessageCountRef.current = 0;
      if (forceScroll) {
        clearPendingForceScroll();
      }
      return;
    }

    const hasNewMessage = messages.length > previousMessageCountRef.current;
    const shouldAutoScrollForIncoming = !forceScroll && hasNewMessage && shouldStickToBottomRef.current;
    previousMessageCountRef.current = messages.length;

    if (scrollRafIdRef.current !== null) {
      cancelAnimationFrame(scrollRafIdRef.current);
      scrollRafIdRef.current = null;
    }

    if (!forceScroll && !shouldAutoScrollForIncoming) return;
    scrollRafIdRef.current = requestAnimationFrame(() => {
      scrollToBottom(forceScroll ? "auto" : "smooth");
      if (forceScroll) {
        clearPendingForceScroll();
      }
      shouldStickToBottomRef.current = true;
      scrollRafIdRef.current = null;
    });
    return () => {
      if (scrollRafIdRef.current !== null) {
        cancelAnimationFrame(scrollRafIdRef.current);
        scrollRafIdRef.current = null;
      }
    };
  }, [messages, selectedConversationId]);

  if (!session || !hasRequiredSessionConfig(session)) {
    return (
      <main className="setup-wrapper">
        <div className="card">
          <h1>Sign in to continue</h1>
          <p className="hint">Use your work email and password, or advanced setup for developer access.</p>
          <p>
            <a href="/login" className="primary-link">
              Sign in
            </a>
          </p>
          <p className="hint">
            <a href="/setup" className="secondary-link">
              Advanced setup
            </a>
          </p>
        </div>
      </main>
    );
  }

  function sortMessagesAsc(rows: MessageRow[]): MessageRow[] {
    return [...rows].sort((a, b) => {
      const aTime = parseMessageCreatedAt(a)?.toISOString() ?? "";
      const bTime = parseMessageCreatedAt(b)?.toISOString() ?? "";
      if (aTime === bTime) return String(a.id).localeCompare(String(b.id));
      return aTime < bTime ? -1 : 1;
    });
  }

  async function loadMessages(
    conversationId: string,
    groupedConversationIds?: string[],
    options?: { forceScroll?: boolean; appendOlder?: boolean }
  ) {
    const loadSeq = ++messageLoadSeqRef.current;
    const appendOlder = Boolean(options?.appendOlder);
    if (options?.forceScroll) {
      pendingForceScrollAfterMessagesRef.current = true;
      pendingForceScrollConversationIdRef.current = conversationId;
    }
    if (!appendOlder) {
      setErrorMessage("");
      setBusyState("loading");
    } else {
      setLoadingOlderMessages(true);
    }
    try {
      const conversationIds = Array.from(new Set([conversationId, ...(groupedConversationIds ?? [])])).filter(Boolean);
      const extraIds = conversationIds.filter((id) => id !== conversationId);
      const includeParam =
        extraIds.length > 0 ? `&includeConversationIds=${encodeURIComponent(extraIds.join(","))}` : "";
      const cursorParam =
        appendOlder && olderMessagesCursor
          ? `&cursor=${encodeURIComponent(olderMessagesCursor)}`
          : "";
      const res = await apiFetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/messages?limit=${MESSAGE_PAGE_LIMIT}${includeParam}${cursorParam}`
      );
      const pageRows = ((res?.data ?? []) as Array<Record<string, unknown>>).map((row) =>
        normalizeMessageRow(row, String(row.conversation_id ?? row.conversationId ?? conversationId))
      );
      const nextCursor =
        typeof res?.pageInfo?.nextCursor === "string" && res.pageInfo.nextCursor.trim()
          ? res.pageInfo.nextCursor.trim()
          : null;
      if (loadSeq !== messageLoadSeqRef.current) return;
      loadedConversationIdRef.current = conversationId;
      if (appendOlder) {
        setOlderMessagesCursor(nextCursor);
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const merged = [...pageRows.filter((m) => !seen.has(m.id)), ...prev];
          return sortMessagesAsc(merged);
        });
      } else {
        setOlderMessagesCursor(nextCursor);
        setMessages(sortMessagesAsc(pageRows));
      }
    } catch (error) {
      if (loadSeq !== messageLoadSeqRef.current) return;
      setErrorMessage(formatDashboardLoadError("Message load failed", error));
      if (!appendOlder) {
        setMessages([]);
        loadedConversationIdRef.current = "";
        setOlderMessagesCursor(null);
        clearPendingForceScroll();
      }
    } finally {
      if (loadSeq === messageLoadSeqRef.current) {
        if (!appendOlder) {
          setBusyState("");
        } else {
          setLoadingOlderMessages(false);
        }
      }
    }
  }

  async function loadOlderMessages() {
    if (!selectedConversationId || !olderMessagesCursor || loadingOlderMessages) return;
    const ids = selectedLeadItem?.conversationIds ?? [selectedConversationId];
    await loadMessages(selectedConversationId, ids, { appendOlder: true });
  }

  async function loadMarketingEvents(options?: { append?: boolean }) {
    const conversationId = selectedConversationIdRef.current.trim();
    if (!conversationId) {
      setMarketingTimelineStatus("idle");
      setMarketingTimelineItems([]);
      setMarketingTimelineError("");
      setMarketingTimelineNextCursor(null);
      marketingTimelineNextCursorRef.current = null;
      return;
    }
    const s = session;
    if (!s || !hasRequiredSessionConfig(s)) return;

    const loadSeq = ++marketingTimelineLoadSeqRef.current;
    const append = Boolean(options?.append);
    const cursor = append ? marketingTimelineNextCursorRef.current : null;
    if (append && !cursor) return;

    const conv = conversations.find((c) => c.id === conversationId) ?? null;
    const leadId = readConversationLeadId(conv as Record<string, unknown> | null);

    if (!append) {
      setMarketingTimelineStatus("loading");
      setMarketingTimelineItems([]);
      setMarketingTimelineError("");
    } else {
      setMarketingTimelineLoadMoreBusy(true);
    }

    try {
      const result = await fetchMarketingEventsList({
        baseUrl: s.baseUrl,
        accessToken: s.accessToken,
        tenantId: s.tenantId,
        conversationId,
        leadId,
        cursor,
        limit: MARKETING_EVENTS_DEFAULT_LIMIT
      });
      if (loadSeq !== marketingTimelineLoadSeqRef.current) return;

      if (!result.ok) {
        if (!append) {
          setMarketingTimelineItems([]);
        }
        setMarketingTimelineStatus("error");
        setMarketingTimelineError(result.errorMessage);
        return;
      }

      const mapped = result.items.map(mapMarketingEventToTimelineItem);
      const nextCursor =
        typeof result.pageInfo.nextCursor === "string" && result.pageInfo.nextCursor.trim()
          ? result.pageInfo.nextCursor.trim()
          : null;
      setMarketingTimelineNextCursor(nextCursor);
      marketingTimelineNextCursorRef.current = nextCursor;

      if (append) {
        setMarketingTimelineItems((prev) => {
          const merged = mergeMarketingTimelineItems(prev, mapped);
          setMarketingTimelineStatus(merged.length > 0 ? "ready" : "empty");
          return merged;
        });
      } else {
        setMarketingTimelineItems(mapped);
        setMarketingTimelineStatus(mapped.length === 0 ? "empty" : "ready");
      }
    } catch (error) {
      if (loadSeq !== marketingTimelineLoadSeqRef.current) return;
      if (!append) {
        setMarketingTimelineItems([]);
      }
      setMarketingTimelineStatus("error");
      setMarketingTimelineError(String(error instanceof Error ? error.message : error));
    } finally {
      if (loadSeq === marketingTimelineLoadSeqRef.current) {
        setMarketingTimelineLoadMoreBusy(false);
      }
    }
  }

  async function markConversationRead(conversationIds: string[]) {
    const uniqueConversationIds = Array.from(new Set(conversationIds)).filter(Boolean);
    await Promise.all(uniqueConversationIds.map((conversationId) =>
      apiFetch(`/api/conversations/${encodeURIComponent(conversationId)}/mark-read`, {
        method: "POST"
      })
    ));
    const idSet = new Set(uniqueConversationIds);
    setConversations((prev) =>
      prev.map((item) => (idSet.has(item.id) ? { ...item, unreadCount: 0, unread_count: 0 } : item))
    );
  }

  function hideLead(item: LeadListItem) {
    const hiddenAtIso = item.latestMessageAt || new Date().toISOString();
    setHiddenLeadMap((prev) => ({ ...prev, [item.leadKey]: hiddenAtIso }));
    if (selectedLeadKey !== item.leadKey) return;
    const next = visibleLeadItems.find((x) => x.leadKey !== item.leadKey);
    if (next) {
      setSelectedConversationId(next.latestConversationId);
      void loadMessages(next.latestConversationId, next.conversationIds, { forceScroll: true });
    } else {
      setSelectedConversationId("");
      loadedConversationIdRef.current = "";
      clearPendingForceScroll();
      setMessages([]);
    }
  }

  function confirmHideLead(item: LeadListItem) {
    const confirmed = globalThis.confirm(`Hide ${item.displayName} from dashboard list?`);
    if (!confirmed) return;
    hideLead(item);
  }

  function onSelectAttachment(file: File | null) {
    setErrorMessage("");
    if (isFirstFacebookCommentReply) {
      setErrorMessage(
        `${FB_COMMENT_ATTACH_BLOCKED_TITLE}\n${FB_COMMENT_ATTACH_BLOCKED_BODY_LINE_1}\n${FB_COMMENT_ATTACH_BLOCKED_BODY_LINE_2}`
      );
      return;
    }
    if (!file) return;
    const normalizedMimeType = normalizeSelectedAttachmentMime(file);
    const kind = attachmentKindFromMime(normalizedMimeType);
    if (activeChannel === "INSTAGRAM" && kind === "document_pdf") {
      setErrorMessage("Instagram DM does not support PDF attachments yet.");
      return;
    }
    if (!kind) {
      setErrorMessage("Unsupported file type. Allowed: JPEG, PNG, WEBP, PDF.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("Attachment file is too large (max 10MB).");
      return;
    }
    if (activeChannel === "INSTAGRAM" && kind === "image" && file.size > 8 * 1024 * 1024) {
      setErrorMessage("Instagram DM image must be <= 8MB.");
      return;
    }
    const nextAttachment: SelectedAttachment = { kind, name: file.name, size: file.size, type: normalizedMimeType };
    setSelectedAttachmentFile(file);
    setSelectedAttachment(nextAttachment);
    if (kind === "image") {
      const preview = URL.createObjectURL(file);
      setImagePreviewUrl(preview);
    } else {
      setImagePreviewUrl(null);
    }
  }

  function onAttachInputClick(event: MouseEvent<HTMLInputElement>) {
    if (!isFirstFacebookCommentReply) return;
    event.preventDefault();
    event.stopPropagation();
    setErrorMessage(
      `${FB_COMMENT_ATTACH_BLOCKED_TITLE}\n${FB_COMMENT_ATTACH_BLOCKED_BODY_LINE_1}\n${FB_COMMENT_ATTACH_BLOCKED_BODY_LINE_2}`
    );
  }

  function removeAttachment() {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setSelectedAttachmentFile(null);
    setSelectedAttachment(null);
    setImagePreviewUrl(null);
  }

  async function sendCompose() {
    if (!session || !hasRequiredSessionConfig(session)) return;
    setErrorMessage("");
    setResultMessage("");
    const validationErrors = validateComposer({
      selectedChannel: activeChannel,
      text: draftText,
      attachment: selectedAttachment,
      context: selectedConversation
        ? {
            id: selectedConversation.id,
            channelType: activeChannel,
            providerThreadType: selectedConversation.provider_thread_type ?? null,
            privateReplySentAt: selectedConversation.private_reply_sent_at ?? null
          }
        : null
    });
    if (validationErrors.length > 0) {
      setErrorMessage(validationErrors.join(" "));
      return;
    }
    if (!selectedConversation) {
      setErrorMessage("Please select a conversation.");
      return;
    }
    if (meContext) {
      const own = getComposerOwnershipState({
        role: meContext.role,
        salesAgentId: meContext.salesAgentId,
        selectedAssignedAgentId: selectedAssignedId || null,
        hasSelectedConversation: true
      });
      if (!own.canReplyByOwnership) {
        setErrorMessage(own.reason ?? "You are not allowed to reply to this conversation.");
        return;
      }
    }

    const leadId = getField<string>(selectedConversation, ["lead_id", "leadId"]);
    const channelThreadId = getField<string>(selectedConversation, ["channel_thread_id", "channelThreadId"]);
    if (!leadId || !channelThreadId) {
      setErrorMessage("Selected conversation is missing leadId or channelThreadId.");
      return;
    }

    const steps = buildSendSequence({
      text: draftText,
      attachmentKind: selectedAttachment?.kind ?? null,
      selectedChannel: activeChannel
    });
    let uploaded: UploadedAttachment | null = null;

    const runStep = async (step: { kind: "text" | "image" | "document_pdf" }) => {
      if (step.kind === "text") {
        setBusyState("sending");
        if (process.env.NODE_ENV !== "production") {
          console.debug("[composer/send] /api/messages/send", {
            channel: activeChannel,
            selectedConversationId: selectedConversation.id,
            messageType: "TEXT",
            mediaMimeType: null,
            hasMediaUrl: false,
            fileSizeBytes: null
          });
        }
        await apiFetch("/api/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId: session.tenantId,
            leadId,
            conversationId: selectedConversation.id,
            conversationIds: selectedLeadItem?.conversationIds ?? [selectedConversation.id],
            channel: activeChannel,
            channelThreadId,
            type: "text",
            content: draftText
          })
        });
        return;
      }
      if (!selectedAttachmentFile || !selectedAttachment) return;

      if (!uploaded) {
        setBusyState("uploading");
        const form = new FormData();
        form.append("file", selectedAttachmentFile);
        const uploadPath = selectedAttachment.kind === "image" ? "/api/messages/upload-image" : "/api/messages/upload-pdf";
        const uploadRes = await fetch(`${session.baseUrl}${uploadPath}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "x-tenant-id": session.tenantId
          },
          body: form
        });
        const uploadText = await uploadRes.text();
        const uploadData = uploadText ? JSON.parse(uploadText) : null;
        if (!uploadRes.ok) throw new Error(uploadData?.error ?? uploadData?.detail ?? "attachment upload failed");

        if (selectedAttachment.kind === "image") {
          const mimeType = String(uploadData?.data?.mediaMimeType ?? "");
          uploaded = {
            kind: "image",
            mediaUrl: String(uploadData.data.mediaUrl),
            previewUrl: uploadData.data.previewUrl ? String(uploadData.data.previewUrl) : undefined,
            mimeType: mimeType as "image/jpeg" | "image/png" | "image/webp",
            fileName: selectedAttachment.name,
            fileSizeBytes: Number(uploadData.data.fileSizeBytes ?? selectedAttachment.size),
            width: uploadData.data.width ? Number(uploadData.data.width) : undefined,
            height: uploadData.data.height ? Number(uploadData.data.height) : undefined
          };
        } else {
          uploaded = {
            kind: "document_pdf",
            fileUrl: String(uploadData.data.fileUrl ?? uploadData.data.mediaUrl),
            mimeType: "application/pdf",
            fileName: String(uploadData.data.fileName ?? selectedAttachment.name),
            fileSizeBytes: Number(uploadData.data.fileSizeBytes ?? selectedAttachment.size)
          };
        }
      }

      setBusyState("sending");
      if (step.kind === "image" && uploaded?.kind === "image") {
        if (process.env.NODE_ENV !== "production") {
          console.debug("[composer/send] /api/messages/send", {
            channel: activeChannel,
            selectedConversationId: selectedConversation.id,
            messageType: "IMAGE",
            mediaMimeType: uploaded.mimeType,
            hasMediaUrl: Boolean(uploaded.mediaUrl),
            fileSizeBytes: uploaded.fileSizeBytes
          });
        }
        await apiFetch("/api/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId: session.tenantId,
            leadId,
            conversationId: selectedConversation.id,
            conversationIds: selectedLeadItem?.conversationIds ?? [selectedConversation.id],
            channel: activeChannel,
            channelThreadId,
            type: "image",
            content: draftText.trim() ? draftText : "[image]",
            mediaUrl: uploaded.mediaUrl,
            previewUrl: uploaded.previewUrl ?? uploaded.mediaUrl,
            mediaMimeType: uploaded.mimeType,
            fileSizeBytes: uploaded.fileSizeBytes,
            width: uploaded.width,
            height: uploaded.height
          })
        });
      }
      if (step.kind === "document_pdf" && uploaded?.kind === "document_pdf") {
        if (process.env.NODE_ENV !== "production") {
          console.debug("[composer/send] /api/messages/send", {
            channel: activeChannel,
            selectedConversationId: selectedConversation.id,
            messageType: "DOCUMENT_PDF",
            mediaMimeType: uploaded.mimeType,
            hasMediaUrl: Boolean(uploaded.fileUrl),
            fileSizeBytes: uploaded.fileSizeBytes
          });
        }
        await apiFetch("/api/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId: session.tenantId,
            leadId,
            conversationId: selectedConversation.id,
            conversationIds: selectedLeadItem?.conversationIds ?? [selectedConversation.id],
            channel: activeChannel,
            channelThreadId,
            type: "document_pdf",
            content: draftText.trim() ? draftText : "[document]",
            mediaUrl: uploaded.fileUrl,
            mediaMimeType: uploaded.mimeType,
            fileName: uploaded.fileName,
            fileSizeBytes: uploaded.fileSizeBytes
          })
        });
      }
    };

    try {
      const sequenceResult = await performSendSequence(steps, runStep);
      if (sequenceResult.status !== "success") {
        setErrorMessage(buildComposerErrorMessage(sequenceResult));
        return;
      }
      setDraftText("");
      removeAttachment();
      setResultMessage("Message queued successfully.");
      await loadMessages(
        selectedConversation.id,
        selectedLeadItem?.conversationIds ?? [selectedConversation.id],
        { forceScroll: true }
      );
      await loadConversations();
    } catch (error) {
      const errorText =
        error instanceof Error ? error.message : typeof error === "string" ? error : "unknown error";
      if (process.env.NODE_ENV !== "production") {
        const uploadedForDebug = uploaded as UploadedAttachment | null;
        const uploadedMediaUrl =
          uploadedForDebug?.kind === "image"
            ? uploadedForDebug.mediaUrl
            : uploadedForDebug?.kind === "document_pdf"
              ? uploadedForDebug.fileUrl
              : null;
        console.error("[composer/send] /api/messages/send failed", {
          channel: activeChannel,
          selectedConversationId: selectedConversation.id,
          messageType: selectedAttachment?.kind === "image" ? "IMAGE" : selectedAttachment?.kind === "document_pdf" ? "DOCUMENT_PDF" : "TEXT",
          mediaMimeType: selectedAttachment?.type ?? null,
          hasMediaUrl: Boolean(uploadedMediaUrl),
          fileSizeBytes: uploadedForDebug?.fileSizeBytes ?? selectedAttachment?.size ?? null,
          responseErrorMessage: errorText
        });
      }
      setErrorMessage(`Failed to send message: ${errorText}`);
    } finally {
      setBusyState("");
    }
  }

  function resolveAgentLabel(agentId: string | null): string {
    if (!agentId) return "Unassigned";
    const a = salesAgents.find((x) => x.id === agentId);
    if (a) return formatSalesAgentDisplayLabel(a);
    if (meContext?.salesAgentId === agentId) {
      const em = meContext.email?.trim();
      return em && em.length > 0 ? em : agentId;
    }
    return agentId;
  }

  function formatLeadAssignmentSummary(item: LeadListItem): string {
    const st = item.latestAssignmentStatus || "UNASSIGNED";
    const pr = item.latestPriority || "NORMAL";
    if (!item.latestAssignedAgentId) return `Unassigned · ${st} · ${pr}`;
    return `Assigned: ${resolveAgentLabel(item.latestAssignedAgentId)} · ${st} · ${pr}`;
  }

  async function applyConversationAssignment(targetSalesAgentId: string) {
    if (!selectedConversation || !meContext) return;
    if (!canManageConversationAssignments(meContext.role)) return;
    const cid = selectedConversation.id;
    setAssignmentBusy(true);
    setErrorMessage("");
    try {
      const res = await apiFetch(`/api/conversations/${encodeURIComponent(cid)}/assignment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesAgentId: targetSalesAgentId })
      });
      const payload = res?.data as Record<string, unknown> | undefined;
      if (payload && typeof payload === "object") {
        setConversations((prev) => prev.map((c) => (c.id === cid ? mergeConversationAssignmentFromPayload(c, payload) : c)));
      }
      setResultMessage("Assignment updated.");
      await loadConversations({ silent: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setErrorMessage(msg.trim() ? msg : "Failed to update assignment.");
    } finally {
      setAssignmentBusy(false);
    }
  }

  async function clearConversationAssignment() {
    if (!selectedConversation || !meContext) return;
    if (!canManageConversationAssignments(meContext.role)) return;
    const cid = selectedConversation.id;
    const currentAssigned = getField<string>(selectedConversation, ["assigned_agent_id", "assignedAgentId"], "")?.trim();
    if (!currentAssigned) return;
    setAssignmentBusy(true);
    setErrorMessage("");
    try {
      const res = await apiFetch(`/api/conversations/${encodeURIComponent(cid)}/assignment`, {
        method: "DELETE"
      });
      const payload = res?.data as Record<string, unknown> | undefined;
      if (payload && typeof payload === "object") {
        setConversations((prev) => prev.map((c) => (c.id === cid ? mergeConversationAssignmentFromPayload(c, payload) : c)));
      }
      setResultMessage("Conversation unassigned.");
      await loadConversations({ silent: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setErrorMessage(msg.trim() ? msg : "Failed to update assignment.");
    } finally {
      setAssignmentBusy(false);
    }
  }

  async function patchConversationLeadStatusBody(body: Record<string, unknown>, successMessage: string) {
    if (!selectedConversation || !meContext) return;
    const cid = selectedConversation.id;
    setLeadStatusUpdateBusy(true);
    setErrorMessage("");
    try {
      const res = await apiFetch(conversationLeadStatusPatchPath(cid), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = res?.data as Record<string, unknown> | undefined;
      if (payload && typeof payload === "object") {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === cid ? (mergeConversationLeadStatusFromPayload(c, payload) as ConversationRow) : c
          )
        );
      }
      setResultMessage(successMessage);
      await loadConversations({ silent: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setErrorMessage(mapLeadStatusSaveError(msg));
    } finally {
      setLeadStatusUpdateBusy(false);
    }
  }

  async function applyConversationLeadStatus(nextStatus: LeadManagementStatus) {
    await patchConversationLeadStatusBody(buildLeadStatusPatch(nextStatus), "Lead status updated.");
  }

  async function applyConversationQualifiedLead() {
    await patchConversationLeadStatusBody(buildQualifiedLeadStatusPatch(), "Lead marked as Qualified.");
  }

  async function applyConversationStatus(nextStatus: "OPEN" | "PENDING" | "RESOLVED" | "ARCHIVED") {
    if (!selectedConversation || !meContext) return;
    const cid = selectedConversation.id;
    setStatusUpdateBusy(true);
    setErrorMessage("");
    try {
      await apiFetch(`/api/conversations/${encodeURIComponent(cid)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      setResultMessage("Conversation status updated.");
      await loadConversations({ silent: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setErrorMessage(msg.trim() ? msg : "Failed to update conversation status.");
    } finally {
      setStatusUpdateBusy(false);
    }
  }

  async function applyConversationFollowUp(patch: ReturnType<typeof buildFollowUpSavePatch>) {
    if (!selectedConversation || !meContext) return;
    const cid = selectedConversation.id;
    setFollowUpUpdateBusy(true);
    setFollowUpPanelError("");
    setErrorMessage("");
    try {
      const res = await apiFetch(conversationFollowUpPatchPath(cid), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const payload = res?.data as Record<string, unknown> | undefined;
      if (payload && typeof payload === "object") {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === cid ? (mergeConversationFollowUpFromPayload(c, payload) as ConversationRow) : c
          )
        );
      }
      setResultMessage("Follow-up updated.");
      setFollowUpPanelOpen(false);
      await loadConversations({ silent: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      const friendly = msg.trim() ? msg : "Failed to update follow-up.";
      setFollowUpPanelError(friendly);
      setErrorMessage(friendly);
    } finally {
      setFollowUpUpdateBusy(false);
    }
  }

  function saveConversationFollowUp() {
    const draft = { atLocal: followUpDraftAt, note: followUpDraftNote };
    const validation = validateFollowUpSaveDraft(draft);
    if (validation) {
      setFollowUpPanelError(validation);
      return;
    }
    try {
      const patch = buildFollowUpSavePatch(draft);
      void applyConversationFollowUp(patch);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update follow-up.";
      setFollowUpPanelError(msg);
    }
  }

  function clearConversationFollowUp() {
    void applyConversationFollowUp(buildFollowUpClearPatch());
  }

  const selectedConversationStatus = selectedConversation
    ? getField<string>(selectedConversation, ["status"], "OPEN") ?? "OPEN"
    : "";
  const selectedLeadManagementStatus = selectedConversation
    ? resolveLeadManagementStatusFromRow(selectedConversation)
    : "";
  const selectedLeadStatusLabel = selectedLeadManagementStatus
    ? getLeadManagementStatusLabel(selectedLeadManagementStatus)
    : "";
  const allowedLeadManagementTransitions = selectedLeadManagementStatus
    ? listAllowedLeadManagementStatusTransitions(selectedLeadManagementStatus)
    : [];
  const writableConversationStatuses = new Set(["OPEN", "PENDING", "RESOLVED", "ARCHIVED"]);
  const selectedConversationStatusSelectValue = writableConversationStatuses.has(selectedConversationStatus)
    ? selectedConversationStatus
    : "";
  const canShowConversationStatusUpdate =
    Boolean(meContext && selectedConversation && !meError) &&
    (meContext!.role === "MANAGER" ||
      meContext!.role === "ADMIN" ||
      (meContext!.role === "SALES" &&
        Boolean(
          selectedAssignedId && meContext!.salesAgentId && selectedAssignedId === meContext!.salesAgentId
        )));
  const canShowFollowUpUpdate = canShowConversationStatusUpdate;
  const canShowLeadStatusUpdate =
    canShowConversationStatusUpdate &&
    Boolean(selectedConversation && selectedLeadManagementStatus && allowedLeadManagementTransitions.length > 0);
  const selectedLeadDisplayLabel = selectedConversation
    ? getConversationLeadDisplayLabel(selectedConversation)
    : "";
  const showMarkQualifiedLeadAction =
    selectedConversation &&
    canShowMarkQualifiedLeadAction({
      canUpdateLeadStatus: canShowLeadStatusUpdate,
      row: selectedConversation
    });
  const leadIsQualified =
    selectedConversation && isLeadFunnelQualified(selectedConversation);

  const selectedAssignmentStatus = selectedConversation
    ? getField<string>(selectedConversation, ["assignment_status", "assignmentStatus"], "") || "UNASSIGNED"
    : "";

  const inboxRoleHint =
    meContext?.role === "SALES"
      ? "Sales"
      : meContext?.role === "MANAGER"
        ? "Manager"
        : meContext?.role === "ADMIN"
          ? "Admin"
          : "";

  const showManagerInboxControls =
    Boolean(meContext && !meError && (meContext.role === "MANAGER" || meContext.role === "ADMIN"));

  return (
    <main className={`dashboard-root${contextPanelOpen ? " dashboard-root-context-open" : ""}`}>
      <DashboardAppRail
        activeId="inbox"
        role={meContext?.role}
        showInboxPlaceholders
        footer={
          <>
            <DashboardAppRailReloadButton
              onReload={() => void loadConversations()}
              disabled={busyState === "loading"}
              loading={busyState === "loading"}
            />
            <DashboardAppRailSignOutButton
              onSignOut={() => {
                clearSessionConfig(globalThis.localStorage);
                setSession(null);
                window.location.replace("/login");
              }}
            />
            <DashboardAppRailSetupLink />
          </>
        }
      />

      <aside className="dashboard-inbox-column" data-testid="dashboard-inbox-column" aria-label="Inbox queue">
        <div className="inbox-column-head">
          <div className="inbox-column-title-row">
            <h1 className="inbox-column-title">Inbox</h1>
            {inboxRoleHint ? <p className="inbox-column-role-hint">{inboxRoleHint}</p> : null}
          </div>
          {meError ? <div className="card error">{meError}</div> : null}
        </div>
        {meContext && !meError ? (
          <>
            {conversations.length > 0 ? (
              <div className="inbox-quick-chips" aria-label="Action filters">
                {showManagerInboxControls ? (
                  <button
                    type="button"
                    className="inbox-summary-chip"
                    onClick={() => patchInboxFilters({ scope: "unassigned" })}
                    disabled={filtersBusy}
                  >
                    Unassigned {inboxFirstPageSummary.unassigned}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="inbox-summary-chip"
                  onClick={() => patchInboxFilters({ scope: "mine" })}
                  disabled={filtersBusy}
                >
                  My inbox {inboxFirstPageSummary.myAssigned}
                </button>
                <button
                  type="button"
                  className="inbox-summary-chip"
                  data-testid="inbox-action-sla-overdue"
                  onClick={() => applyInboxActionPreset("sla_overdue")}
                  disabled={filtersBusy}
                >
                  SLA overdue {inboxFirstPageSummary.slaOverdue}
                </button>
                <button
                  type="button"
                  className="inbox-summary-chip"
                  data-testid="inbox-action-follow-up-overdue"
                  onClick={() => applyInboxActionPreset("follow_up_overdue")}
                  disabled={filtersBusy}
                >
                  Follow-up {inboxFirstPageSummary.followUpAction}
                </button>
              </div>
            ) : null}
            <div className="inbox-compact-filters dashboard-inbox-filter-panel" data-testid="dashboard-inbox-filter-panel">
              {showManagerInboxControls ? (
                <div className="inbox-compact-quick-row" role="tablist" aria-label="Inbox scope">
                  {(
                    [
                      ["mine", "My inbox"],
                      ["team", "Team inbox"],
                      ["unassigned", "Unassigned"]
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={
                        inboxFilters.scope === key ? "inbox-filter-btn inbox-filter-btn-active" : "inbox-filter-btn"
                      }
                      data-testid={`inbox-scope-${key}`}
                      onClick={() => patchInboxFilters({ scope: key })}
                      disabled={filtersBusy || Boolean(meError)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : meContext.role === "SALES" ? (
                <p className="hint inbox-filter-hint" data-testid="inbox-scope-sales-hint">
                  My inbox (scope=mine)
                </p>
              ) : null}
              <div
                className="inbox-compact-quick-row conversation-status-filter-bar"
                role="group"
                aria-label="Conversation status filter"
              >
                {(
                  [
                    ["all", "All"],
                    ["OPEN", "Open"],
                    ["PENDING", "Pending"],
                    ["RESOLVED", "Resolved"]
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={
                      inboxFilters.conversationStatus === key
                        ? "inbox-filter-btn inbox-filter-btn-active"
                        : "inbox-filter-btn"
                    }
                    data-testid={`inbox-status-${key.toLowerCase()}`}
                    onClick={() => patchInboxFilters({ conversationStatus: key as ConversationStatusFilter })}
                    disabled={filtersBusy}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="inbox-compact-toolbar">
                <button
                  type="button"
                  className="inbox-filters-drawer-open-btn inbox-filter-btn"
                  data-testid="inbox-filters-drawer-open"
                  onClick={openInboxFiltersDrawer}
                  disabled={filtersBusy}
                  aria-expanded={inboxFiltersDrawerOpen}
                >
                  Filters
                  {hasActiveInboxFilters(meContext?.role, inboxFilters) ? (
                    <span className="inbox-filters-drawer-open-badge" aria-hidden="true">
                      •
                    </span>
                  ) : null}
                </button>
                {hasActiveInboxFilters(meContext?.role, inboxFilters) ? (
                  <button
                    type="button"
                    className="inbox-filter-btn inbox-clear-filters-btn"
                    data-testid="inbox-clear-all-filters"
                    onClick={() => setInboxFilters(clearAllInboxFilters(meContext?.role))}
                    disabled={filtersBusy}
                  >
                    Clear all
                  </button>
                ) : null}
              </div>
              {hasActiveInboxFilters(meContext?.role, inboxFilters) ? (
                <div className="dashboard-inbox-active-filters" data-testid="dashboard-inbox-active-filters">
                  <span className="dashboard-inbox-active-filters-label">Active</span>
                  {inboxFilterBadges.map((badge) => (
                    <button
                      key={badge.key}
                      type="button"
                      className="inbox-active-filter-badge"
                      data-testid={`inbox-active-filter-${badge.key}`}
                      onClick={() => patchInboxFilters(badge.clearPatch)}
                      disabled={filtersBusy}
                      title="Remove filter"
                    >
                      {badge.label} ×
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {inboxFiltersDrawerOpen ? (
              <div className="inbox-filters-drawer-root" data-testid="inbox-filters-drawer-root">
                <button
                  type="button"
                  className="inbox-filters-drawer-scrim"
                  aria-label="Close filters"
                  data-testid="inbox-filters-drawer-scrim"
                  onClick={closeInboxFiltersDrawer}
                />
                <div
                  className="inbox-filters-drawer-panel"
                  data-testid="inbox-filters-drawer"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="inbox-filters-drawer-title"
                >
                  <div className="inbox-filters-drawer-head">
                    <h2 id="inbox-filters-drawer-title" className="inbox-filters-drawer-title">
                      Advanced filters
                    </h2>
                    <button
                      type="button"
                      className="inbox-filters-drawer-close secondary-link"
                      data-testid="inbox-filters-drawer-close"
                      onClick={closeInboxFiltersDrawer}
                    >
                      Close
                    </button>
                  </div>
                  <div className="inbox-filters-drawer-body manager-inbox-filters" data-testid="manager-inbox-filters">
                    {showManagerInboxControls ? (
                      <div className="dashboard-inbox-filter-section">
                        <p className="dashboard-inbox-filter-section-title">Scope</p>
                        <div className="inbox-filter-bar" role="group" aria-label="Inbox scope (advanced)">
                          <button
                            type="button"
                            className={
                              inboxFiltersDrawerDraft.scope === "all"
                                ? "inbox-filter-btn inbox-filter-btn-active"
                                : "inbox-filter-btn"
                            }
                            data-testid="inbox-scope-all"
                            onClick={() => patchInboxFiltersDrawer({ scope: "all" })}
                            disabled={filtersBusy}
                          >
                            All
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <div className="dashboard-inbox-filter-section">
                      <p className="dashboard-inbox-filter-section-title">Channel</p>
                      <div className="inbox-filter-bar" role="group" aria-label="Channel filter">
                        {(
                          [
                            ["all", "All"],
                            ["LINE", "LINE"],
                            ["FACEBOOK", "Facebook"],
                            ["INSTAGRAM", "Instagram"]
                          ] as const
                        ).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            className={
                              inboxFiltersDrawerDraft.channel === key
                                ? "inbox-filter-btn inbox-filter-btn-active"
                                : "inbox-filter-btn"
                            }
                            data-testid={`inbox-channel-${key.toLowerCase()}`}
                            onClick={() => patchInboxFiltersDrawer({ channel: key as ChannelFilter })}
                            disabled={filtersBusy}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="dashboard-inbox-filter-section">
                      <p className="dashboard-inbox-filter-section-title">Action filters</p>
                      <div className="inbox-filter-bar" role="group" aria-label="Action filters">
                        <button
                          type="button"
                          className={
                            inboxFiltersDrawerDraft.waiting === "needs_response"
                              ? "inbox-filter-btn inbox-filter-btn-active"
                              : "inbox-filter-btn"
                          }
                          data-testid="inbox-action-needs-response"
                          onClick={() => applyInboxActionPresetToDrawer("needs_response")}
                          disabled={filtersBusy}
                        >
                          Needs response
                        </button>
                        <button
                          type="button"
                          className={
                            inboxFiltersDrawerDraft.sla === "overdue"
                              ? "inbox-filter-btn inbox-filter-btn-active"
                              : "inbox-filter-btn"
                          }
                          onClick={() => applyInboxActionPresetToDrawer("sla_overdue")}
                          disabled={filtersBusy}
                        >
                          SLA overdue
                        </button>
                        <button
                          type="button"
                          className={
                            inboxFiltersDrawerDraft.sla === "due_soon"
                              ? "inbox-filter-btn inbox-filter-btn-active"
                              : "inbox-filter-btn"
                          }
                          onClick={() => applyInboxActionPresetToDrawer("sla_due_soon")}
                          disabled={filtersBusy}
                        >
                          SLA due soon
                        </button>
                        <button
                          type="button"
                          className={
                            inboxFiltersDrawerDraft.followUp === "today"
                              ? "inbox-filter-btn inbox-filter-btn-active"
                              : "inbox-filter-btn"
                          }
                          onClick={() => applyInboxActionPresetToDrawer("follow_up_today")}
                          disabled={filtersBusy}
                        >
                          Follow-up today
                        </button>
                        <button
                          type="button"
                          className={
                            inboxFiltersDrawerDraft.followUp === "overdue"
                              ? "inbox-filter-btn inbox-filter-btn-active"
                              : "inbox-filter-btn"
                          }
                          onClick={() => applyInboxActionPresetToDrawer("follow_up_overdue")}
                          disabled={filtersBusy}
                        >
                          Follow-up overdue
                        </button>
                      </div>
                    </div>
                    <div className="manager-inbox-filter-group" role="group" aria-label="Lead management status filter">
                      <span className="manager-inbox-filter-label">Lead status</span>
                      {(
                        [
                          ["all", "All"],
                          ["NEW", "New"],
                          ["IN_PROGRESS", "In progress"],
                          ["FOLLOW_UP", "Follow-up"],
                          ["WON", "Won"],
                          ["LOST", "Lost"],
                          ["CLOSED", "Closed"]
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          className={
                            inboxFiltersDrawerDraft.leadManagementStatus === key
                              ? "inbox-filter-btn inbox-filter-btn-active"
                              : "inbox-filter-btn"
                          }
                          data-testid={`inbox-lead-status-${key === "all" ? "all" : key.toLowerCase()}`}
                          onClick={() =>
                            patchInboxFiltersDrawer({ leadManagementStatus: key as LeadManagementStatusFilter })
                          }
                          disabled={filtersBusy}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="manager-inbox-filter-group" role="group" aria-label="Follow-up filter">
                      <span className="manager-inbox-filter-label">Follow-up</span>
                      {(
                        [
                          ["all", "All"],
                          ["scheduled", "Scheduled"],
                          ["today", "Today"],
                          ["overdue", "Overdue"],
                          ["none", "None"]
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          className={
                            inboxFiltersDrawerDraft.followUp === key
                              ? "inbox-filter-btn inbox-filter-btn-active"
                              : "inbox-filter-btn"
                          }
                          onClick={() => patchInboxFiltersDrawer({ followUp: key as FollowUpFilter })}
                          disabled={filtersBusy}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="manager-inbox-filter-group" role="group" aria-label="SLA filter">
                      <span className="manager-inbox-filter-label">SLA</span>
                      {(
                        [
                          ["all", "All"],
                          ["active", "Active"],
                          ["due_soon", "Due soon"],
                          ["overdue", "Overdue"],
                          ["none", "None"]
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          className={
                            inboxFiltersDrawerDraft.sla === key
                              ? "inbox-filter-btn inbox-filter-btn-active"
                              : "inbox-filter-btn"
                          }
                          onClick={() => patchInboxFiltersDrawer({ sla: key as SlaFilter })}
                          disabled={filtersBusy}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="manager-inbox-filter-group" role="group" aria-label="Waiting filter">
                      <span className="manager-inbox-filter-label">Waiting</span>
                      {(
                        [
                          ["all", "All"],
                          ["needs_response", "Needs response"],
                          ["waiting_customer", "Waiting on customer"]
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          className={
                            inboxFiltersDrawerDraft.waiting === key
                              ? "inbox-filter-btn inbox-filter-btn-active"
                              : "inbox-filter-btn"
                          }
                          onClick={() => patchInboxFiltersDrawer({ waiting: key as WaitingFilter })}
                          disabled={filtersBusy}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="inbox-filters-drawer-connection-scope">
                      <ChannelConnectionScopeToggle
                        role={meContext?.role}
                        checked={inboxFiltersDrawerDraft.includeDisconnectedConnections}
                        disabled={filtersBusy}
                        onChange={(next) =>
                          patchInboxFiltersDrawer({ includeDisconnectedConnections: next })
                        }
                      />
                    </div>
                  </div>
                  <div className="inbox-filters-drawer-footer">
                    <button
                      type="button"
                      className="inbox-filter-btn inbox-clear-filters-btn"
                      data-testid="inbox-filters-drawer-clear-all"
                      onClick={() =>
                        setInboxFiltersDrawerDraft(clearAllInboxFilters(meContext?.role))
                      }
                      disabled={filtersBusy}
                    >
                      Clear all
                    </button>
                    <button
                      type="button"
                      className="inbox-filters-drawer-apply-btn"
                      data-testid="inbox-filters-drawer-apply"
                      onClick={applyInboxFiltersDrawer}
                      disabled={filtersBusy}
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      className="inbox-filters-drawer-done-btn"
                      data-testid="inbox-filters-drawer-done"
                      onClick={applyInboxFiltersDrawer}
                      disabled={filtersBusy}
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
        <div className="conversation-list-scroll">
        <div className="conversation-list" role="list">
          {visibleLeadItems.some((item) => item.unreadCountTotal > 0) ? (
            <p className="hint" data-testid="inbox-unread-badge-help">
              Unread means the message is already received and processed, but not yet read by an agent.
            </p>
          ) : null}
          {!inboxSidebarPresentation.showList && inboxSidebarPresentation.emptyHint ? (
            <p className="hint" data-testid={inboxSidebarPresentation.testId}>
              {inboxSidebarPresentation.emptyHint}
            </p>
          ) : null}
          {inboxSidebarPresentation.showList
            ? visibleLeadItems.map((item) => (
            <LeadListItemRow
              key={item.leadKey}
              item={item}
              conversations={conversations}
              includeDisconnectedConnections={inboxFilters.includeDisconnectedConnections}
              active={
                item.leadKey === selectedLeadKey ||
                (!selectedLeadKey && item.latestConversationId === selectedConversationId)
              }
              onPick={() => {
                setSelectedConversationId(item.latestConversationId);
                void loadMessages(item.latestConversationId, item.conversationIds, { forceScroll: true });
                if (item.unreadCountTotal > 0) {
                  void markConversationRead(item.conversationIds);
                }
              }}
              onHide={() => confirmHideLead(item)}
              assignmentSummary={formatLeadAssignmentSummary(item)}
              conversationStatusLabel={item.latestConversationStatus}
              leadStatusLabel={
                getConversationLeadDisplayLabel({
                  lead_status: item.latestLeadStatus,
                  lead_management_status: item.latestLeadManagementStatus
                }) ||
                getLeadManagementStatusLabel(item.latestLeadManagementStatus) ||
                item.latestLeadManagementStatus
              }
              inboxBadges={resolveInboxBadgeDescriptors(inboxBadgeClock, {
                follow_up_at: item.follow_up_at,
                follow_up_note: item.follow_up_note,
                sla_due_at: item.sla_due_at,
                last_customer_message_at: item.last_customer_message_at,
                last_agent_message_at: item.last_agent_message_at
              }, inboxBadgeSlaOptions)}
            />
          ))
            : null}
        </div>
        {conversationsNextCursor ? (
          <div className="conversation-list-load-more">
            <button
              type="button"
              className="inbox-filter-btn"
              onClick={() => void loadMoreConversations()}
              disabled={loadingMoreConversations || busyState === "loading"}
            >
              {loadingMoreConversations ? "Loading…" : "Load more"}
            </button>
          </div>
        ) : null}
        </div>
      </aside>

      <section className="dashboard-chat">
        <header className="chat-header">
          <div className="chat-header-row chat-header-row-primary">
            {selectedConversation ? (
              <>
                <div className="conv-header-identity-row">
                  <ConversationAvatar row={selectedConversation} />
                  <div className="conv-header-identity-text">
                    <div className="conv-header-name-row">
                      <h2 className="conv-header-name">
                        {resolveConversationParticipantName(selectedConversation)}
                      </h2>
                      <div className="conv-header-badge-row" data-testid="chat-header-badges">
                        <span data-testid="chat-header-lead-source">
                          <LeadSourceBadge input={selectedConversation} />
                        </span>
                        <span className="status-pill status-pill-conversation" title="Conversation status">
                          {selectedConversationStatus}
                        </span>
                        {selectedLeadManagementStatus ? (
                          <span className="status-pill status-pill-lead" title="Lead status">
                            {selectedLeadDisplayLabel || selectedLeadStatusLabel || selectedLeadManagementStatus}
                          </span>
                        ) : null}
                        {selectedFollowUpState ? (
                          <span className={selectedFollowUpState.className}>{selectedFollowUpState.label}</span>
                        ) : null}
                      </div>
                      {selectedConnectionScopeInput ? (
                        <div className="conv-header-connection-row" data-testid="chat-header-connection">
                          <ChannelConnectionLabel
                            input={selectedConnectionScopeInput}
                            includeDisconnectedChannels={inboxFilters.includeDisconnectedConnections}
                            emphasizeScopeBucket
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="chat-header-controls">
                  <button
                    type="button"
                    className="dashboard-context-toggle inbox-filter-btn"
                    data-testid="dashboard-context-toggle"
                    onClick={() => setContextPanelOpen((open) => !open)}
                    aria-expanded={contextPanelOpen}
                    title={contextPanelOpen ? "Hide context panel" : "Show context panel"}
                  >
                    {contextPanelOpen ? "Hide panel" : "Panel"}
                  </button>
                  <div className="chat-header-actions-wrap">
                    <button
                      type="button"
                      className="chat-header-actions-open inbox-filter-btn"
                      data-testid="chat-header-actions-open"
                      aria-expanded={chatHeaderActionsOpen}
                      aria-haspopup="menu"
                      onClick={() => setChatHeaderActionsOpen((open) => !open)}
                    >
                      Actions
                    </button>
                    {chatHeaderActionsOpen ? (
                      <>
                        <button
                          type="button"
                          className="chat-header-actions-scrim"
                          aria-label="Close actions menu"
                          data-testid="chat-header-actions-scrim"
                          onClick={() => setChatHeaderActionsOpen(false)}
                        />
                        <div
                          className="chat-header-actions-menu"
                          data-testid="chat-header-actions-menu"
                          role="menu"
                          aria-label="Conversation actions"
                        >
                          {canShowConversationStatusUpdate ? (
                            <div className="chat-actions-section" role="none">
                              <span className="chat-actions-section-title" id="conversation-status-select-label">
                                Conversation status
                              </span>
                              <select
                                id="conversation-status-select"
                                className="conversation-status-select chat-actions-select"
                                aria-labelledby="conversation-status-select-label"
                                value={selectedConversationStatusSelectValue}
                                disabled={statusUpdateBusy}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === "OPEN" || v === "PENDING" || v === "RESOLVED" || v === "ARCHIVED") {
                                    void applyConversationStatus(v);
                                  }
                                }}
                              >
                                {!writableConversationStatuses.has(selectedConversationStatus) ? (
                                  <option value="" disabled>
                                    {selectedConversationStatus} (legacy)
                                  </option>
                                ) : null}
                                <option value="OPEN">OPEN</option>
                                <option value="PENDING">PENDING</option>
                                <option value="RESOLVED">RESOLVED</option>
                                <option value="ARCHIVED">ARCHIVED</option>
                              </select>
                            </div>
                          ) : null}
                          {canShowLeadStatusUpdate ? (
                            <div className="chat-actions-section" role="none">
                              <span className="chat-actions-section-title" id="lead-status-select-label">
                                Lead status
                              </span>
                              <select
                                id="lead-status-select"
                                className="conversation-status-select chat-actions-select"
                                aria-labelledby="lead-status-select-label"
                                value={selectedLeadManagementStatus}
                                disabled={leadStatusUpdateBusy}
                                onChange={(e) => {
                                  const v = e.target.value as LeadManagementStatus;
                                  if (v && v !== selectedLeadManagementStatus) {
                                    void applyConversationLeadStatus(v);
                                  }
                                }}
                              >
                                <option value={selectedLeadManagementStatus}>
                                  {selectedLeadStatusLabel || selectedLeadManagementStatus}
                                </option>
                                {allowedLeadManagementTransitions.map((s) => (
                                  <option key={s} value={s}>
                                    {getLeadManagementStatusLabel(s) || s}
                                  </option>
                                ))}
                              </select>
                              {leadStatusUpdateBusy ? (
                                <span className="hint chat-toolbar-saving" aria-live="polite">
                                  Saving…
                                </span>
                              ) : null}
                              {showMarkQualifiedLeadAction ? (
                                <button
                                  type="button"
                                  className="chat-actions-menu-btn chat-actions-menu-btn-block"
                                  data-testid="chat-action-mark-qualified"
                                  disabled={leadStatusUpdateBusy}
                                  onClick={() => void applyConversationQualifiedLead()}
                                >
                                  Mark as Qualified
                                </button>
                              ) : null}
                              {leadIsQualified && canShowLeadStatusUpdate ? (
                                <p className="hint" data-testid="chat-action-qualified-state">
                                  Lead is Qualified.
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                          {meContext && canManageConversationAssignments(meContext.role) && !meError ? (
                            <div className="chat-actions-section assignment-controls" role="none">
                              <span className="chat-actions-section-title">Assignment</span>
                              <select
                                className="assignment-agent-select chat-actions-select"
                                value={assignmentSelectedAgentId}
                                onChange={(e) => setAssignmentSelectedAgentId(e.target.value)}
                                disabled={assignmentBusy || Boolean(salesAgentsError) || salesAgents.length === 0}
                                aria-label="Sales agent"
                              >
                                <option value="">Select agent…</option>
                                {salesAgents.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {formatSalesAgentDisplayLabel(a)}
                                  </option>
                                ))}
                              </select>
                              <div className="chat-actions-button-row">
                                <button
                                  type="button"
                                  className="chat-actions-menu-btn"
                                  data-testid="chat-action-reassign"
                                  onClick={() => void applyConversationAssignment(assignmentSelectedAgentId)}
                                  disabled={
                                    assignmentBusy ||
                                    !assignmentSelectedAgentId ||
                                    assignmentSelectedAgentId === selectedAssignedId
                                  }
                                >
                                  {selectedAssignedId ? "Reassign" : "Assign"}
                                </button>
                                <button
                                  type="button"
                                  className="chat-actions-menu-btn"
                                  data-testid="chat-action-unassign"
                                  onClick={() => void clearConversationAssignment()}
                                  disabled={assignmentBusy || !selectedAssignedId}
                                >
                                  Unassign
                                </button>
                              </div>
                            </div>
                          ) : null}
                          {canShowFollowUpUpdate ? (
                            <div className="chat-actions-section" role="none">
                              <button
                                type="button"
                                className="chat-actions-menu-btn chat-actions-menu-btn-block"
                                data-testid="chat-action-follow-up"
                                onClick={() => {
                                  setFollowUpPanelError("");
                                  setChatHeaderActionsOpen(false);
                                  if (!followUpPanelOpen && selectedConversation) {
                                    const draft = followUpDraftFromConversationFields({
                                      follow_up_at: selectedFollowUpAtIso,
                                      follow_up_note: selectedFollowUpNote || null
                                    });
                                    setFollowUpDraftAt(draft.atLocal);
                                    setFollowUpDraftNote(draft.note);
                                  }
                                  setFollowUpPanelOpen((open) => !open);
                                }}
                                disabled={followUpUpdateBusy}
                              >
                                {followUpPanelOpen
                                  ? "Close follow-up editor"
                                  : selectedFollowUpAtIso || selectedFollowUpNote
                                    ? "Edit follow-up"
                                    : "Set follow-up"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <div className="hint">Select a conversation to start</div>
            )}
          </div>
          {selectedConversation ? (
            <>
              {selectedConnectionDetailBanner?.visible ? (
                <p
                  className="hint channel-connection-detail-banner"
                  data-testid={selectedConnectionDetailBanner.testId}
                >
                  {selectedConnectionDetailBanner.message}
                </p>
              ) : null}
              <div className="chat-header-row chat-header-row-meta">
                <p className="hint conv-header-assignment" data-testid="chat-header-assignment">
                  {selectedAssignedId
                    ? `Assigned: ${resolveAgentLabel(selectedAssignedId)} · ${selectedAssignmentStatus}`
                    : `Unassigned · ${selectedAssignmentStatus}`}
                </p>
                {selectedLeadItem && selectedLeadItem.conversationCount > 1 ? (
                  <p className="hint conv-header-meta-line">{selectedLeadItem.conversationCount} threads</p>
                ) : null}
                {selectedFollowUpHeaderLine && !followUpPanelOpen ? (
                  <p className="hint conv-header-followup-inline">{selectedFollowUpHeaderLine}</p>
                ) : null}
              </div>
              {salesAgentsError ? <div className="hint assignment-agents-error">{salesAgentsError}</div> : null}
              {followUpPanelOpen && canShowFollowUpUpdate ? (
                <div className="conv-header-followup-popover">
                  <div className="conv-header-followup-panel" data-testid="follow-up-editor-panel">
                    <label className="hint" htmlFor="follow-up-at-input">
                      Follow-up date &amp; time
                    </label>
                    <input
                      id="follow-up-at-input"
                      type="datetime-local"
                      className="followup-datetime-input"
                      value={followUpDraftAt}
                      disabled={followUpUpdateBusy}
                      onChange={(e) => setFollowUpDraftAt(e.target.value)}
                    />
                    <label className="hint" htmlFor="follow-up-note-input">
                      Note
                    </label>
                    <textarea
                      id="follow-up-note-input"
                      className="followup-note-input"
                      rows={3}
                      maxLength={FOLLOW_UP_NOTE_MAX_LENGTH}
                      value={followUpDraftNote}
                      disabled={followUpUpdateBusy}
                      placeholder="Optional reminder note"
                      onChange={(e) => setFollowUpDraftNote(e.target.value)}
                    />
                    {followUpPanelError ? (
                      <div className="followup-panel-error" role="alert">
                        {followUpPanelError}
                      </div>
                    ) : null}
                    <div className="followup-panel-actions">
                      <button
                        type="button"
                        onClick={() => saveConversationFollowUp()}
                        disabled={followUpUpdateBusy}
                      >
                        {followUpUpdateBusy ? "Saving…" : "Save follow-up"}
                      </button>
                      <button
                        type="button"
                        className="secondary-link"
                        onClick={() => clearConversationFollowUp()}
                        disabled={followUpUpdateBusy}
                      >
                        Clear follow-up
                      </button>
                      <button
                        type="button"
                        className="secondary-link"
                        onClick={() => {
                          if (selectedConversation) {
                            const draft = followUpDraftFromConversationFields({
                              follow_up_at: selectedFollowUpAtIso,
                              follow_up_note: selectedFollowUpNote || null
                            });
                            setFollowUpDraftAt(draft.atLocal);
                            setFollowUpDraftNote(draft.note);
                          }
                          setFollowUpPanelError("");
                          setFollowUpPanelOpen(false);
                        }}
                        disabled={followUpUpdateBusy}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </header>

        {errorMessage ? <div className="card error">{errorMessage}</div> : null}
        {resultMessage ? <div className="card success">{resultMessage}</div> : null}

        <div
          className="chat-scroll"
          ref={chatScrollRef}
          onScroll={() => {
            const container = chatScrollRef.current;
            if (!container) return;
            shouldStickToBottomRef.current = isNearBottom(container);
          }}
        >
          {olderMessagesCursor ? (
            <div className="chat-load-older">
              <button
                type="button"
                className="inbox-filter-btn"
                onClick={() => void loadOlderMessages()}
                disabled={loadingOlderMessages || busyState === "loading"}
              >
                {loadingOlderMessages ? "Loading…" : "Load older messages"}
              </button>
            </div>
          ) : null}
          {messages.length === 0 && chatMessagesEmptyHint ? (
            <p className="hint" data-testid="chat-messages-empty">
              {chatMessagesEmptyHint}
            </p>
          ) : null}
          <ul className="message-list">
            {timeline.map((entry) => {
              if (entry.kind === "date") {
                return (
                  <li key={entry.key} className="msg-day-separator-wrap">
                    <div className="msg-day-separator">{entry.label}</div>
                  </li>
                );
              }
              const m = entry.message;
              const msgType = (String(m.messageType ?? m.message_type ?? "TEXT").toUpperCase() || "TEXT");
              const metadata = (m.metadataJson ?? m.metadata_json ?? {}) as Record<string, unknown>;
              const imageUrl =
                m.previewUrl ||
                m.preview_url ||
                (metadata.thumbnailUrl as string | undefined) ||
                ((m.metadata_json as Record<string, unknown> | undefined)?.thumbnailUrl as string | undefined) ||
                (metadata.thumbnail_url as string | undefined) ||
                ((m.metadata_json as Record<string, unknown> | undefined)?.thumbnail_url as string | undefined) ||
                (metadata.imageUrl as string | undefined) ||
                ((m.metadata_json as Record<string, unknown> | undefined)?.imageUrl as string | undefined) ||
                (metadata.image_url as string | undefined) ||
                ((m.metadata_json as Record<string, unknown> | undefined)?.image_url as string | undefined) ||
                m.mediaUrl ||
                m.media_url ||
                (metadata.previewUrl as string | undefined) ||
                ((m.metadata_json as Record<string, unknown> | undefined)?.previewUrl as string | undefined) ||
                (metadata.mediaUrl as string | undefined) ||
                ((m.metadata_json as Record<string, unknown> | undefined)?.mediaUrl as string | undefined) ||
                null;
              const imageFullUrl =
                (metadata.fullImageUrl as string | undefined) ||
                ((m.metadata_json as Record<string, unknown> | undefined)?.fullImageUrl as string | undefined) ||
                (metadata.full_image_url as string | undefined) ||
                ((m.metadata_json as Record<string, unknown> | undefined)?.full_image_url as string | undefined) ||
                m.mediaUrl ||
                m.media_url ||
                (metadata.mediaUrl as string | undefined) ||
                ((m.metadata_json as Record<string, unknown> | undefined)?.mediaUrl as string | undefined) ||
                imageUrl;
              const hasLineMessageId =
                typeof metadata.lineMessageId === "string" && metadata.lineMessageId.trim().length > 0;
              const isLineImageError =
                metadata.source === "line" && metadata.error === true && (m.direction === "INBOUND" || !m.direction);
              const isImageMessage = msgType === "IMAGE" || Boolean(imageUrl) || hasLineMessageId || isLineImageError;
              const shouldShowImagePlaceholder = isImageMessage && !imageUrl;
              const pdfUrl = msgType === "DOCUMENT_PDF" ? mediaUrlFromAny(m) : null;
              const pdfName = fileNameFromMessage(m) ?? "document.pdf";
              const pdfSize = typeof metadata.fileSizeBytes === "number" ? Number(metadata.fileSizeBytes) : undefined;
              const textRaw = String(m.content ?? "").trim();
              const text =
                isImageMessage && (textRaw === "[image]" || textRaw === "[Image]")
                  ? ""
                  : textRaw;
              const isOutbound = m.direction === "OUTBOUND";
              const mediaDebugText = DEBUG_MEDIA
                ? JSON.stringify(
                    {
                      id: m.id,
                      messageType: m.messageType ?? m.message_type ?? null,
                      mediaUrl: m.mediaUrl ?? null,
                      media_url: m.media_url ?? null,
                      previewUrl: m.previewUrl ?? null,
                      preview_url: m.preview_url ?? null,
                      metadata: m.metadataJson ?? m.metadata_json ?? {}
                    },
                    null,
                    2
                  )
                : "";

              return (
                <li key={entry.key} className={`msg-row msg-row-${m.direction.toLowerCase()}`}>
                  <div className={`msg msg-${m.direction.toLowerCase()}`}>
                    {isImageMessage && imageUrl ? (
                      <a href={imageFullUrl ?? imageUrl} target="_blank" rel="noreferrer">
                        <img
                          src={imageUrl}
                          alt="message image"
                          loading="lazy"
                          className="msg-image"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </a>
                    ) : null}
                    {msgType === "DOCUMENT_PDF" && pdfUrl ? (
                      <div className="msg-doc">
                        <div className="doc-badge">PDF</div>
                        <a href={pdfUrl} target="_blank" rel="noreferrer" className="doc-link">
                          {pdfName}
                        </a>
                        <div className="hint">{formatFileSize(pdfSize)}</div>
                      </div>
                    ) : null}
                    {isImageMessage ? (
                      shouldShowImagePlaceholder ? (
                        <>
                          <p className="msg-text msg-text-muted">Image received - no preview available</p>
                          {DEBUG_MEDIA ? <pre className="hint">{mediaDebugText}</pre> : null}
                        </>
                      ) : text ? (
                        <p className="msg-text">{text}</p>
                      ) : null
                    ) : msgType === "DOCUMENT_PDF" ? (
                      <p className="msg-text msg-text-muted">[PDF]</p>
                    ) : text ? (
                      <p className="msg-text">{text}</p>
                    ) : (
                      <p className="msg-text msg-text-muted">[Empty]</p>
                    )}
                    <div className={`msg-meta ${isOutbound ? "msg-meta-outbound" : "msg-meta-inbound"}`}>
                      {entry.timeLabel}
                    </div>
                    {isOutbound ? (() => {
                      const deliveryFail = outboundDeliveryFailureFromMetadata(metadata);
                      if (!deliveryFail) return null;
                      return (
                        <div className="msg-outbound-delivery-fail" role="status">
                          <div className="msg-delivery-failed-title">{deliveryFail.title}</div>
                          <div className="msg-delivery-failed-detail">{deliveryFail.detail}</div>
                        </div>
                      );
                    })() : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <div ref={messageEndRef} aria-hidden="true" />
        </div>

        <footer className="chat-composer">
          <div className="composer-shell">
            <textarea
              className="composer-textarea"
              rows={3}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder="Type message text..."
              disabled={Boolean(busyState)}
              aria-label="Message text"
            />
            <div className="composer-side-actions">
              <div className="composer-attach-row">
                <label className="composer-attach-btn">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => onSelectAttachment(e.target.files?.[0] ?? null)}
                onClick={onAttachInputClick}
                disabled={Boolean(busyState)}
              />
              <span>Attach</span>
                </label>
                {selectedAttachmentFile ? (
                  <button type="button" className="composer-attach-btn" onClick={removeAttachment} disabled={Boolean(busyState)}>
                    Remove
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                className="composer-send-btn"
                disabled={!canSubmit || !selectedConversation || !composerOwnership.canReplyByOwnership}
                onClick={() => void sendCompose()}
              >
                {busyState === "uploading" ? "Uploading..." : busyState === "sending" ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
          {selectedAttachment?.kind === "image" && imagePreviewUrl ? (
            <div className="image-preview">
              <img src={imagePreviewUrl} alt="Local preview" />
            </div>
          ) : null}
          <div className="composer-hints">
            {isFirstFacebookCommentReply ? (
              <p className="hint">First reply will be sent privately via Messenger.</p>
            ) : null}
            {composerOwnership.reason ? (
              <p className="hint composer-ownership-hint" role="status">
                {composerOwnership.reason}
              </p>
            ) : null}
            {activeChannel === "INSTAGRAM" ? (
              <p className="hint">Instagram DM: text or JPEG/PNG/WEBP images. PDF is not supported yet.</p>
            ) : null}
          </div>
          {selectedAttachment?.kind === "document_pdf" ? (
            <div className="doc-preview">
              <div className="doc-badge">PDF</div>
              <div className="hint">{selectedAttachment.name}</div>
            </div>
          ) : null}
        </footer>
      </section>

      {contextPanelOpen ? (
        <aside
          className="dashboard-context-panel"
          data-testid="dashboard-context-panel"
          aria-label="Conversation context"
        >
          <div className="dashboard-context-head">
            <h2 className="dashboard-context-title">Context</h2>
            <button
              type="button"
              className="dashboard-context-collapse inbox-filter-btn"
              data-testid="dashboard-context-collapse"
              onClick={() => setContextPanelOpen(false)}
              title="Collapse context panel"
            >
              Hide
            </button>
          </div>
          <div className="dashboard-context-tabs" role="tablist" aria-label="Context panel tabs">
            {(
              [
                ["details", "Details"],
                ["marketing", "Marketing Signals"],
                ["activity", "Activity"]
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                className={`dashboard-context-tab${contextPanelTab === tab ? " dashboard-context-tab-active" : ""}`}
                data-testid={`dashboard-context-tab-${tab}`}
                aria-selected={contextPanelTab === tab}
                onClick={() => setContextPanelTab(tab)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="dashboard-context-body">
            {contextPanelTab === "details" ? (
              <div className="dashboard-context-details" data-testid="dashboard-context-details">
                {selectedConversation ? (
                  <dl className="dashboard-context-dl">
                    <div className="dashboard-context-dl-row">
                      <dt>Customer</dt>
                      <dd>{resolveConversationParticipantName(selectedConversation)}</dd>
                    </div>
                    <div className="dashboard-context-dl-row">
                      <dt>Channel</dt>
                      <dd>{resolveLeadPlatform(selectedConversation)}</dd>
                    </div>
                    <div className="dashboard-context-dl-row">
                      <dt>Lead source</dt>
                      <dd data-testid="dashboard-context-lead-source">
                        <LeadSourceBadge input={selectedConversation} />
                      </dd>
                    </div>
                    <div className="dashboard-context-dl-row">
                      <dt>Connection</dt>
                      <dd data-testid="dashboard-context-connection">
                        {selectedConnectionScopeInput ? (
                          <ChannelConnectionLabel
                            input={selectedConnectionScopeInput}
                            includeDisconnectedChannels={inboxFilters.includeDisconnectedConnections}
                            emphasizeScopeBucket
                          />
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                    <div className="dashboard-context-dl-row">
                      <dt>Assigned</dt>
                      <dd>
                        {selectedAssignedId
                          ? resolveAgentLabel(selectedAssignedId)
                          : "Unassigned"}
                      </dd>
                    </div>
                    <div className="dashboard-context-dl-row">
                      <dt>Conversation</dt>
                      <dd>{selectedConversationStatus}</dd>
                    </div>
                    {selectedLeadManagementStatus ? (
                      <div className="dashboard-context-dl-row">
                        <dt>Lead status</dt>
                        <dd>
                          {selectedLeadDisplayLabel || selectedLeadStatusLabel || selectedLeadManagementStatus}
                        </dd>
                      </div>
                    ) : null}
                    {selectedFollowUpHeaderLine ? (
                      <div className="dashboard-context-dl-row">
                        <dt>Follow-up</dt>
                        <dd>{selectedFollowUpHeaderLine}</dd>
                      </div>
                    ) : null}
                    {selectedContextInboxBadges.length > 0 ? (
                      <div className="dashboard-context-dl-row">
                        <dt>Indicators</dt>
                        <dd className="dashboard-context-badges">
                          {selectedContextInboxBadges.map((badge) => (
                            <span key={badge.label} className={badge.className}>
                              {badge.label}
                            </span>
                          ))}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                ) : (
                  <p className="hint">Select a conversation to view details.</p>
                )}
              </div>
            ) : null}
            {contextPanelTab === "marketing" ? (
              <div
                className="dashboard-context-marketing"
                data-testid="dashboard-context-marketing"
              >
                {selectedConversation ? (
                  <MarketingTimelinePanel
                    status={marketingTimelineStatus}
                    items={marketingTimelineItems}
                    errorMessage={marketingTimelineError}
                    onRefresh={() => void loadMarketingEvents()}
                    refreshBusy={marketingTimelineStatus === "loading"}
                    onLoadMore={
                      marketingTimelineNextCursor
                        ? () => void loadMarketingEvents({ append: true })
                        : undefined
                    }
                    loadMoreBusy={marketingTimelineLoadMoreBusy}
                    hasMore={Boolean(marketingTimelineNextCursor)}
                    className="marketing-timeline-panel-context"
                  />
                ) : (
                  <p className="hint">Select a conversation to load marketing signals.</p>
                )}
              </div>
            ) : null}
            {contextPanelTab === "activity" ? (
              <div className="dashboard-context-activity" data-testid="dashboard-context-activity">
                {selectedConversation ? (
                  <>
                    <p className="dashboard-context-activity-lead">
                      Loaded messages in thread: <strong>{messages.length}</strong>
                    </p>
                    {(getField<string>(
                      selectedConversation,
                      ["last_message_preview", "lastMessagePreview"],
                      ""
                    ) ?? ""
                    ).trim() ? (
                      <p className="hint dashboard-context-activity-preview">
                        Last preview:{" "}
                        {(
                          getField<string>(
                            selectedConversation,
                            ["last_message_preview", "lastMessagePreview"],
                            ""
                          ) ?? ""
                        ).slice(0, 120)}
                      </p>
                    ) : null}
                    <p className="hint">
                      Message timeline activity is shown in the chat column. Extended activity feeds will ship in a
                      later phase.
                    </p>
                  </>
                ) : (
                  <p className="hint">Select a conversation to see activity summary.</p>
                )}
              </div>
            ) : null}
          </div>
        </aside>
      ) : null}
    </main>
  );
}
