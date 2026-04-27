"use client";

import { useEffect, useMemo, useState } from "react";
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
  provider_thread_type?: "MESSENGER_DM" | "FACEBOOK_COMMENT" | null;
  private_reply_sent_at?: string | null;
};

type MessageRow = {
  id: string;
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

function mediaUrlFromMessage(msg: MessageRow): string | null {
  const metadataCamel = (msg.metadataJson ?? {}) as Record<string, unknown>;
  const metadataSnake = (msg.metadata_json ?? {}) as Record<string, unknown>;
  const candidates = [
    msg.previewUrl,
    msg.preview_url,
    msg.mediaUrl,
    msg.media_url,
    metadataCamel.previewUrl,
    metadataSnake.previewUrl,
    metadataCamel.mediaUrl,
    metadataSnake.mediaUrl
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function fullMediaUrlFromMessage(msg: MessageRow): string | null {
  const metadataCamel = (msg.metadataJson ?? {}) as Record<string, unknown>;
  const metadataSnake = (msg.metadata_json ?? {}) as Record<string, unknown>;
  const candidates = [
    msg.mediaUrl,
    msg.media_url,
    msg.previewUrl,
    msg.preview_url,
    metadataCamel.mediaUrl,
    metadataSnake.mediaUrl,
    metadataCamel.previewUrl,
    metadataSnake.previewUrl
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
  const raw = String(msg.createdAt ?? msg.created_at ?? "").trim();
  if (!raw) return null;
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
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
}) {
  const { item, active, onPick } = props;
  const previewShort =
    item.latestMessagePreview && item.latestMessagePreview.length > 58
      ? `${item.latestMessagePreview.slice(0, 58)}…`
      : item.latestMessagePreview;

  return (
    <button
      type="button"
      className={`conversation-list-item${active ? " conversation-list-item-active" : ""}`}
      onClick={onPick}
    >
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
  );
}

export default function DashboardPage() {
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
  const selectedLeadKey = useMemo(
    () => (selectedConversation ? resolveLeadIdentityKey(selectedConversation, { tenantId: session?.tenantId }) : ""),
    [selectedConversation, session?.tenantId]
  );
  const selectedLeadItem = useMemo(
    () =>
      (selectedLeadKey ? leadItems.find((item) => item.leadKey === selectedLeadKey) : null)
      ?? (selectedConversation ? leadItems.find((item) => item.latestConversationId === selectedConversation.id) : null)
      ?? null,
    [leadItems, selectedLeadKey, selectedConversation]
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

  async function loadConversations() {
    setErrorMessage("");
    setBusyState("loading");
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
      if (rows.length > 0 && !selectedConversationId) {
        setSelectedConversationId(rows[0].id);
        await loadMessages(rows[0].id);
        if (resolveConversationUnreadCount(rows[0]) > 0) {
          await markConversationRead(rows[0].id);
        }
      }
      setResultMessage(`Loaded ${rows.length} conversations`);
    } catch (error) {
      setErrorMessage(`Load conversations failed: ${String(error)}`);
    } finally {
      setBusyState("");
    }
  }

  useEffect(() => {
    if (session && hasRequiredSessionConfig(session)) {
      void loadConversations();
    }
    // intentionally run once when session becomes available
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.baseUrl, session?.tenantId, session?.accessToken]);

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

  async function loadMessages(conversationId: string) {
    setErrorMessage("");
    setBusyState("loading");
    try {
      const res = await apiFetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`);
      setMessages((res?.data ?? []) as MessageRow[]);
    } catch (error) {
      setErrorMessage(`Load messages failed: ${String(error)}`);
    } finally {
      setBusyState("");
    }
  }

  async function markConversationRead(conversationId: string) {
    await apiFetch(`/api/conversations/${encodeURIComponent(conversationId)}/mark-read`, {
      method: "POST"
    });
    setConversations((prev) =>
      prev.map((item) => (item.id === conversationId ? { ...item, unreadCount: 0, unread_count: 0 } : item))
    );
  }

  function onSelectAttachment(file: File | null) {
    setErrorMessage("");
    if (isFirstFacebookCommentReply) {
      setErrorMessage("First Facebook comment reply must be text only.");
      return;
    }
    if (!file) return;
    const kind = attachmentKindFromMime(file.type);
    if (!kind) {
      setErrorMessage("Unsupported file type. Allowed: JPEG, PNG, WEBP, PDF.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("Attachment file is too large (max 10MB).");
      return;
    }
    const nextAttachment: SelectedAttachment = { kind, name: file.name, size: file.size, type: file.type };
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

    const steps = buildSendSequence({ text: draftText, attachmentKind: selectedAttachment?.kind ?? null });
    let uploaded: UploadedAttachment | null = null;

    const runStep = async (step: { kind: "text" | "image" | "document_pdf" }) => {
      if (step.kind === "text") {
        setBusyState("sending");
        await apiFetch("/api/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId: activeSession.tenantId,
            leadId,
            conversationId: selectedConversation.id,
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
        await apiFetch("/api/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId: activeSession.tenantId,
            leadId,
            conversationId: selectedConversation.id,
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
        await apiFetch("/api/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId: activeSession.tenantId,
            leadId,
            conversationId: selectedConversation.id,
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
      await loadMessages(selectedConversation.id);
      await loadConversations();
    } catch (error) {
      setErrorMessage(`Failed to send message: ${String(error)}`);
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
          {leadItems.length === 0 && <p className="hint">No conversations loaded.</p>}
          {leadItems.map((item) => (
            <LeadListItemRow
              key={item.leadKey}
              item={item}
              active={
                item.leadKey === selectedLeadKey ||
                (!selectedLeadKey && item.latestConversationId === selectedConversationId)
              }
              onPick={() => {
                setSelectedConversationId(item.latestConversationId);
                void loadMessages(item.latestConversationId);
                if (resolveConversationUnreadCount(conversations.find((row) => row.id === item.latestConversationId) ?? {}) > 0) {
                  void markConversationRead(item.latestConversationId);
                }
              }}
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

        <div className="chat-scroll">
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
              const msgType = (getField<string>(m, ["messageType", "message_type"], "TEXT") ?? "TEXT").toUpperCase();
              const metadata = (m.metadataJson ?? m.metadata_json ?? {}) as Record<string, unknown>;
              const imageUrl = mediaUrlFromMessage(m);
              const imageFullUrl = fullMediaUrlFromMessage(m) ?? imageUrl;
              const shouldShowImagePlaceholder = msgType === "IMAGE" && !imageUrl;
              const pdfUrl = msgType === "DOCUMENT_PDF" ? mediaUrlFromMessage(m) : null;
              const pdfName = fileNameFromMessage(m) ?? "document.pdf";
              const pdfSize = typeof metadata.fileSizeBytes === "number" ? Number(metadata.fileSizeBytes) : undefined;
              const text = String(m.content ?? "").trim();
              const isOutbound = m.direction === "OUTBOUND";

              return (
                <li key={entry.key} className={`msg-row msg-row-${m.direction.toLowerCase()}`}>
                  <div className={`msg msg-${m.direction.toLowerCase()}`}>
                    {msgType === "IMAGE" && imageUrl ? (
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
                    {text ? (
                      <p className="msg-text">{text}</p>
                    ) : shouldShowImagePlaceholder ? (
                      <p className="msg-text msg-text-muted">Image received - no preview available</p>
                    ) : msgType === "DOCUMENT_PDF" ? (
                      <p className="msg-text msg-text-muted">[PDF]</p>
                    ) : (
                      <p className="msg-text msg-text-muted">[Empty]</p>
                    )}
                    <div className={`msg-meta ${isOutbound ? "msg-meta-outbound" : "msg-meta-inbound"}`}>
                      {entry.timeLabel}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
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
