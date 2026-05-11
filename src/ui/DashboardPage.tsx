"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  attachmentKindFromMime,
  buildLeadListItems,
  buildSendSequence,
  buildComposerErrorMessage,
  canSubmitComposer,
  initialsAvatarFromDisplayName,
  performSendSequence,
  resolveConversationAvatarPlan,
  resolveLeadIdentityKey,
  resolveLeadPlatform,
  resolveConversationParticipantName,
  resolveConversationUnreadCount,
  type LeadListItem,
  type OutboundChannel,
  type SelectedAttachment,
  validateComposer
} from "./chatComposerModel.js";
import { hasRequiredSessionConfig, loadSessionConfig, type SessionConfig } from "./sessionConfig.js";

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
  provider_thread_type?: "MESSENGER_DM" | "FACEBOOK_COMMENT" | "INSTAGRAM_DM" | null;
  private_reply_sent_at?: string | null;
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

function getField<T>(row: any, names: string[], fallback?: T): T | undefined {
  for (const key of names) {
    if (row && row[key] !== undefined && row[key] !== null) return row[key] as T;
  }
  return fallback;
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

/** Poll interval for /api/conversations (ms). Set NEXT_PUBLIC_CONVERSATIONS_POLL_INTERVAL_MS=0 to disable. Default 20000. */
function parseConversationsPollIntervalMs(): number {
  const raw = process.env.NEXT_PUBLIC_CONVERSATIONS_POLL_INTERVAL_MS;
  if (raw === undefined || raw === "") return 20000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 20000;
  return n;
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

/** Outbound messages only: show Dashboard copy when provider send failed (metadata from worker). */
function outboundDeliveryFailureFromMetadata(metadata: Record<string, unknown>): { title: string; detail: string } | null {
  if (metadata.delivery_status !== "FAILED") return null;
  const msg = typeof metadata.delivery_error_message === "string" ? metadata.delivery_error_message.trim() : "";
  const reason = typeof metadata.reason === "string" ? metadata.reason.trim() : "";
  const raw = msg || reason;
  if (!raw) return null;
  const title = "ส่งไม่ผ่าน";
  let detail = raw;
  if (raw.startsWith("ส่งไม่ผ่าน: ")) detail = raw.slice("ส่งไม่ผ่าน: ".length).trim();
  else if (raw.startsWith("ส่งไม่ผ่าน：")) detail = raw.slice("ส่งไม่ผ่าน：".length).trim();
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
  const [broken, setBroken] = useState(false);
  if (plan.kind === "image" && !broken) {
    return (
      <img
        className="conv-avatar conv-avatar-img"
        src={plan.url}
        alt=""
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

function LeadAvatar({ item }: { item: LeadListItem }) {
  const [broken, setBroken] = useState(false);
  if (item.avatarPlan.kind === "image" && !broken) {
    return (
      <img
        className="conv-avatar conv-avatar-img"
        src={item.avatarPlan.url}
        alt=""
        onError={() => setBroken(true)}
      />
    );
  }
  if (item.avatarPlan.kind === "initials") {
    return <span className="conv-avatar conv-avatar-initials">{item.avatarPlan.initials}</span>;
  }
  return <span className="conv-avatar conv-avatar-generic">◎</span>;
}

function LeadListItemRow(props: {
  item: LeadListItem;
  active: boolean;
  onPick: () => void;
  onHide: () => void;
}) {
  const { item, active, onPick, onHide } = props;
  const previewShort =
    item.latestMessagePreview && item.latestMessagePreview.length > 58
      ? `${item.latestMessagePreview.slice(0, 58)}…`
      : item.latestMessagePreview;

  return (
    <div className={`conversation-list-item${active ? " conversation-list-item-active" : ""}`}>
      <button type="button" className="conversation-list-main-hit" onClick={onPick} aria-label={`Open ${item.displayName}`}>
      <div className="conversation-avatar-wrap">
        <LeadAvatar item={item} />
        {item.unreadCountTotal > 0 ? <span className="unread-badge">{item.unreadCountTotal}</span> : null}
      </div>
      <div className="conversation-list-text">
        <div className="conversation-list-title">
          <strong>{item.displayName}</strong>
          <span className={`channel-badge channel-badge-${String(item.platform).toLowerCase()}`}>{item.platform}</span>
          {item.conversationCount > 1 ? (
            <span className="conversation-thread-count">{item.conversationCount} threads</span>
          ) : null}
        </div>
        {previewShort ? <div className="hint conversation-list-preview">{previewShort}</div> : null}
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
  const [resultMessage, setResultMessage] = useState("");
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const messageLoadSeqRef = useRef(0);
  const pendingForceScrollAfterMessagesRef = useRef(false);
  const pendingForceScrollConversationIdRef = useRef("");
  const loadedConversationIdRef = useRef("");
  const previousMessageCountRef = useRef(0);
  const scrollRafIdRef = useRef<number | null>(null);
  const loadConversationsRef = useRef<(options?: { silent?: boolean }) => Promise<void>>(async () => {});

  useEffect(() => {
    setSession(loadSessionConfig(globalThis.localStorage));
  }, []);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );
  const leadItems = useMemo(
    () => buildLeadListItems(conversations, { tenantId: session?.tenantId }),
    [conversations, session?.tenantId]
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
  const timeline = useMemo(() => buildTimeline(messages), [messages]);
  const isFirstFacebookCommentReply =
    activeChannel === "FACEBOOK" &&
    (selectedConversation?.provider_thread_type ?? null) === "FACEBOOK_COMMENT" &&
    !selectedConversation?.private_reply_sent_at;

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
    const res = await fetch(`${activeSession.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${activeSession.accessToken}`,
        "x-tenant-id": activeSession.tenantId,
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

  async function loadConversations(options?: { silent?: boolean }) {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setErrorMessage("");
      setBusyState("loading");
    }
    try {
      const res = await apiFetch("/api/conversations?limit=100");
      const rows = ((res?.data ?? []) as Array<Record<string, unknown>>).map((row) => {
        const lead = row.leads as Record<string, unknown> | undefined;
        return {
          ...(row as ConversationRow),
          tenant_id: (row.tenant_id as string | undefined) ?? activeSession.tenantId,
          contact_id: (row.contact_id as string | undefined) ?? null,
          provider_external_user_id:
            (row.provider_external_user_id as string | undefined) ?? ((row as any).providerExternalUserId as string | undefined),
          external_user_id: (lead?.external_user_id as string | undefined) ?? (row.external_user_id as string | undefined),
          contactIdentityDisplayName:
            (row.contactIdentityDisplayName as string | undefined) ?? ((row as any).contact_identity_display_name as string | undefined),
          contactIdentityProfileImageUrl:
            (row.contactIdentityProfileImageUrl as string | undefined) ??
            ((row as any).contact_identity_profile_image_url as string | undefined),
          unreadCount:
            typeof (row as any).unreadCount === "number"
              ? Number((row as any).unreadCount)
              : typeof (row as any).unread_count === "number"
                ? Number((row as any).unread_count)
                : 0,
          lastMessagePreview:
            typeof (row as any).lastMessagePreview === "string"
              ? String((row as any).lastMessagePreview)
              : typeof (row as any).last_message_preview === "string"
                ? String((row as any).last_message_preview)
                : "",
          lastMessageAt:
            typeof (row as any).lastMessageAt === "string"
              ? String((row as any).lastMessageAt)
              : typeof (row as any).last_message_at === "string"
                ? String((row as any).last_message_at)
                : ""
        } as ConversationRow;
      });
      setConversations(rows);
      if (!silent && rows.length > 0 && !selectedConversationId) {
        const initialLeadItems = buildLeadListItems(rows, { tenantId: activeSession.tenantId });
        const firstLead = initialLeadItems[0];
        if (firstLead) {
          setSelectedConversationId(firstLead.latestConversationId);
          await loadMessages(firstLead.latestConversationId, firstLead.conversationIds, { forceScroll: true });
          if (firstLead.unreadCountTotal > 0) {
            await markConversationRead(firstLead.conversationIds);
          }
        }
      }
      if (!silent) {
        setResultMessage(`Loaded ${rows.length} conversations`);
      }
    } catch (error) {
      if (!silent) {
        setErrorMessage(`Load conversations failed: ${String(error)}`);
      } else if (process.env.NODE_ENV !== "production") {
        console.warn("[dashboard] silent conversation refresh failed", error);
      }
    } finally {
      if (!silent) {
        setBusyState("");
      }
    }
  }

  loadConversationsRef.current = loadConversations;

  useEffect(() => {
    if (session && hasRequiredSessionConfig(session)) {
      void loadConversations();
    }
    // intentionally run once when session becomes available
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.baseUrl, session?.tenantId, session?.accessToken]);

  useEffect(() => {
    if (!session || !hasRequiredSessionConfig(session)) return;
    const pollMs = parseConversationsPollIntervalMs();
    if (pollMs <= 0) return;
    const id = globalThis.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void loadConversationsRef.current({ silent: true });
    }, pollMs);
    return () => globalThis.clearInterval(id);
  }, [session?.baseUrl, session?.tenantId, session?.accessToken]);

  useEffect(() => {
    if (!session || !hasRequiredSessionConfig(session)) return;
    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void loadConversationsRef.current({ silent: true });
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [session?.baseUrl, session?.tenantId, session?.accessToken]);

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
          <h1>Dashboard requires session setup</h1>
          <p className="hint">
            Base URL, Tenant ID, and Access Token are missing. Please configure them first.
          </p>
          <a href="/setup" className="primary-link">Go to Setup</a>
        </div>
      </main>
    );
  }
  const activeSession = session;

  async function loadMessages(
    conversationId: string,
    groupedConversationIds?: string[],
    options?: { forceScroll?: boolean }
  ) {
    const loadSeq = ++messageLoadSeqRef.current;
    if (options?.forceScroll) {
      pendingForceScrollAfterMessagesRef.current = true;
      pendingForceScrollConversationIdRef.current = conversationId;
    }
    setErrorMessage("");
    setBusyState("loading");
    try {
      const conversationIds = Array.from(new Set([conversationId, ...(groupedConversationIds ?? [])])).filter(Boolean);
      const results = await Promise.all(
        conversationIds.map(async (id) => {
          const res = await apiFetch(`/api/conversations/${encodeURIComponent(id)}/messages?limit=100`);
          return ((res?.data ?? []) as Array<Record<string, unknown>>).map((row) => normalizeMessageRow(row, id));
        })
      );
      const normalizedMessages = results
        .flat()
        .sort((a, b) => {
          const aTime = parseMessageCreatedAt(a)?.toISOString() ?? "";
          const bTime = parseMessageCreatedAt(b)?.toISOString() ?? "";
          if (aTime === bTime) return String(a.id).localeCompare(String(b.id));
          return aTime < bTime ? -1 : 1;
        });
      if (loadSeq !== messageLoadSeqRef.current) return;
      loadedConversationIdRef.current = conversationId;
      setMessages(normalizedMessages);
    } catch (error) {
      if (loadSeq !== messageLoadSeqRef.current) return;
      setErrorMessage(`Load messages failed: ${String(error)}`);
    } finally {
      if (loadSeq === messageLoadSeqRef.current) {
        setBusyState("");
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
      setErrorMessage("First Facebook comment reply must be text only.");
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

  function removeAttachment() {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setSelectedAttachmentFile(null);
    setSelectedAttachment(null);
    setImagePreviewUrl(null);
  }

  async function sendCompose() {
    setErrorMessage("");
    setResultMessage("");
    const validationErrors = validateComposer({
      selectedChannel: activeChannel,
      text: draftText,
      attachment: selectedAttachment,
      context: selectedConversation
        ? { id: selectedConversation.id, channelType: activeChannel }
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
            tenantId: activeSession.tenantId,
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
        const uploadRes = await fetch(`${activeSession.baseUrl}${uploadPath}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${activeSession.accessToken}`,
            "x-tenant-id": activeSession.tenantId
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
            tenantId: activeSession.tenantId,
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
            tenantId: activeSession.tenantId,
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

  return (
    <main className="dashboard-root">
      <aside className="dashboard-sidebar">
        <div className="sidebar-head">
          <h1>HubChat Dashboard</h1>
          <div className="sidebar-actions">
            <button type="button" onClick={() => void loadConversations()} disabled={busyState === "loading"}>
              {busyState === "loading" ? "Loading..." : "Reload"}
            </button>
            <a href="/setup" className="secondary-link">Setup</a>
          </div>
        </div>
        <div className="conversation-list" role="list">
          {visibleLeadItems.length === 0 && <p className="hint">No conversations loaded.</p>}
          {visibleLeadItems.map((item) => (
            <LeadListItemRow
              key={item.leadKey}
              item={item}
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
            />
          ))}
        </div>
      </aside>

      <section className="dashboard-chat">
        <header className="chat-header">
          {selectedConversation ? (
            <>
              <ConversationAvatar row={selectedConversation} />
              <div className="conv-header-text">
                <div className="conv-header-name">{resolveConversationParticipantName(selectedConversation)}</div>
                <div className="hint">
                  {resolveLeadPlatform(selectedConversation)}
                  {selectedLeadItem && selectedLeadItem.conversationCount > 1
                    ? ` · Latest thread · ${selectedLeadItem.conversationCount} threads grouped`
                    : ""}
                  {selectedConversation.provider_thread_type ? ` · ${selectedConversation.provider_thread_type}` : ""}
                </div>
              </div>
            </>
          ) : (
            <div className="hint">Select a conversation to start</div>
          )}
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
          {messages.length === 0 && <p className="hint">No messages loaded.</p>}
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
          <label>
            Text
            <textarea
              rows={3}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder="Type message text..."
              disabled={Boolean(busyState)}
            />
          </label>
          <div className="composer-upload-row">
            <label className="file-label">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => onSelectAttachment(e.target.files?.[0] ?? null)}
                disabled={Boolean(busyState) || isFirstFacebookCommentReply}
              />
              <span>Select Attachment</span>
            </label>
            {selectedAttachmentFile && (
              <button type="button" onClick={removeAttachment} disabled={Boolean(busyState)}>
                Remove
              </button>
            )}
          </div>
          {selectedAttachment?.kind === "image" && imagePreviewUrl ? (
            <div className="image-preview">
              <img src={imagePreviewUrl} alt="Local preview" />
            </div>
          ) : null}
          {isFirstFacebookCommentReply ? (
            <p className="hint">First reply will be sent privately via Messenger.</p>
          ) : null}
          {activeChannel === "INSTAGRAM" ? (
            <p className="hint">Instagram DM: text or JPEG/PNG/WEBP images. PDF is not supported yet.</p>
          ) : null}
          {selectedAttachment?.kind === "document_pdf" ? (
            <div className="doc-preview">
              <div className="doc-badge">PDF</div>
              <div className="hint">{selectedAttachment.name}</div>
            </div>
          ) : null}
          <button type="button" disabled={!canSubmit || !selectedConversation} onClick={() => void sendCompose()}>
            {busyState === "uploading" ? "Uploading..." : busyState === "sending" ? "Sending..." : "Send"}
          </button>
        </footer>
      </section>
    </main>
  );
}
