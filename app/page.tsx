"use client";

import { useMemo, useState } from "react";
import {
  attachmentKindFromMime,
  buildSendSequence,
  canSubmitComposer,
  initialsAvatarFromDisplayName,
  performSendSequence,
  type OutboundChannel,
  resolveConversationAvatarPlan,
  resolveConversationParticipantName,
  type SelectedAttachment,
  validateComposer
} from "../src/ui/chatComposerModel.js";

type ConversationRow = {
  id: string;
  lead_id?: string;
  leadId?: string;
  channel_type?: OutboundChannel;
  channelType?: OutboundChannel;
  channel_thread_id?: string;
  channelThreadId?: string;
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
};

type MessageRow = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  content: string;
  messageType?: string;
  message_type?: string;
  channelType?: string;
  channel_type?: string;
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

function getField<T>(row: any, names: string[], fallback?: T): T | undefined {
  for (const key of names) {
    if (row && row[key] !== undefined && row[key] !== null) return row[key] as T;
  }
  return fallback;
}

function mediaUrlFromMessage(msg: MessageRow): string | null {
  const metadata = (msg.metadataJson ?? msg.metadata_json ?? {}) as Record<string, unknown>;
  const url = (metadata.previewUrl ?? metadata.mediaUrl) as string | undefined;
  return url && typeof url === "string" ? url : null;
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
    return (
      <span className="conv-avatar conv-avatar-initials" aria-hidden>
        {initials}
      </span>
    );
  }
  return (
    <span className="conv-avatar conv-avatar-generic" aria-hidden title="Unknown user">
      ◎
    </span>
  );
}

function toConversationPreview(messages: MessageRow[]): string {
  const inbound = messages.find((m) => m.direction === "INBOUND");
  const picked = inbound ?? messages[0];
  if (!picked) return "";
  const msgType = (getField<string>(picked, ["messageType", "message_type"], "TEXT") ?? "TEXT").toUpperCase();
  const text = (picked.content ?? "").trim();
  if (msgType === "IMAGE") return "[IMAGE]";
  if (!text) return "[EMPTY]";
  return text;
}

export default function HomePage() {
  const defaultBaseUrl =
    process.env.NEXT_PUBLIC_APP_BASE_URL ??
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl);
  const [token, setToken] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [conversationPreviewById, setConversationPreviewById] = useState<Record<string, string>>({});
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<OutboundChannel>("LINE");
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draftText, setDraftText] = useState("");
  const [selectedAttachmentFile, setSelectedAttachmentFile] = useState<File | null>(null);
  const [selectedAttachment, setSelectedAttachment] = useState<SelectedAttachment | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [busyState, setBusyState] = useState<"" | "loading" | "uploading" | "sending">("");
  const [errorMessage, setErrorMessage] = useState("");
  const [resultMessage, setResultMessage] = useState("");

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );
  const contextChannel = getField<OutboundChannel>(selectedConversation, ["channel_type", "channelType"], "LINE");
  const canSubmit = canSubmitComposer({
    busy: Boolean(busyState),
    text: draftText,
    hasAttachment: Boolean(selectedAttachmentFile)
  });

  async function apiFetch(path: string, init?: RequestInit): Promise<any> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "x-tenant-id": tenantId,
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
    if (!res.ok) {
      throw new Error(body?.error ?? body?.detail ?? text ?? `HTTP ${res.status}`);
    }
    return body;
  }

  async function loadConversations() {
    setErrorMessage("");
    setResultMessage("");
    setBusyState("loading");
    try {
      const res = await apiFetch("/api/conversations?limit=100");
      const rows = ((res?.data ?? []) as Array<Record<string, unknown>>).map((row) => {
        const lead = row.leads as Record<string, unknown> | undefined;
        return {
          ...(row as ConversationRow),
          external_user_id: (lead?.external_user_id as string | undefined) ?? (row.external_user_id as string | undefined),
          contactIdentityDisplayName:
            (row.contactIdentityDisplayName as string | undefined) ?? ((row as any).contact_identity_display_name as string | undefined),
          contactIdentityProfileImageUrl:
            (row.contactIdentityProfileImageUrl as string | undefined) ??
            ((row as any).contact_identity_profile_image_url as string | undefined)
        } as ConversationRow;
      });
      setConversations(rows);
      const previewPairs = await Promise.all(
        rows.map(async (row) => {
          try {
            const pageSize = 50;
            const maxPages = 5;
            let cursor: string | null = null;
            let page = 0;
            let fallback: string = "";
            while (page < maxPages) {
              const query = cursor
                ? `?limit=${pageSize}&cursor=${encodeURIComponent(cursor)}`
                : `?limit=${pageSize}`;
              const msgRes = await apiFetch(`/api/conversations/${encodeURIComponent(row.id)}/messages${query}`);
              const items = (msgRes?.data ?? []) as MessageRow[];
              if (items.length === 0) break;
              if (!fallback) fallback = toConversationPreview(items);
              const inbound = items.find((m) => m.direction === "INBOUND");
              if (inbound) {
                return [row.id, toConversationPreview([inbound])] as const;
              }
              cursor = msgRes?.pageInfo?.nextCursor ?? null;
              if (!cursor) break;
              page += 1;
            }
            return [row.id, fallback] as const;
          } catch {
            return [row.id, ""] as const;
          }
        })
      );
      const previewMap: Record<string, string> = {};
      for (const [id, preview] of previewPairs) {
        if (preview) previewMap[id] = preview;
      }
      setConversationPreviewById(previewMap);
      if (rows.length > 0 && !selectedConversationId) {
        setSelectedConversationId(rows[0].id);
        const ch = getField<OutboundChannel>(rows[0], ["channel_type", "channelType"], "LINE");
        setSelectedChannel(ch ?? "LINE");
      }
      setResultMessage(`Loaded ${rows.length} conversations`);
    } catch (error) {
      setErrorMessage(`Load conversations failed: ${String(error)}`);
    } finally {
      setBusyState("");
    }
  }

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

  function onSelectAttachment(file: File | null) {
    setErrorMessage("");
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
      selectedChannel,
      text: draftText,
      attachment: selectedAttachment,
      context: selectedConversation
        ? {
            id: selectedConversation.id,
            channelType: contextChannel ?? "LINE"
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
            tenantId,
            leadId,
            conversationId: selectedConversation.id,
            channel: selectedChannel,
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
        const uploadRes = await fetch(`${baseUrl}${uploadPath}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "x-tenant-id": tenantId
          },
          body: form
        });
        const uploadText = await uploadRes.text();
        const uploadData = uploadText ? JSON.parse(uploadText) : null;
        if (!uploadRes.ok) throw new Error(uploadData?.error ?? uploadData?.detail ?? "attachment upload failed");
        if (selectedAttachment.kind === "image") {
          if (!uploadData?.data?.mediaUrl || !uploadData?.data?.mediaMimeType) throw new Error("Invalid image upload response");
          const mimeType = String(uploadData.data.mediaMimeType);
          if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
            throw new Error(`Unsupported uploaded image mime type: ${mimeType}`);
          }
          uploaded = {
            kind: "image",
            mediaUrl: String(uploadData.data.mediaUrl),
            previewUrl: uploadData.data.previewUrl ? String(uploadData.data.previewUrl) : undefined,
            mimeType: mimeType as "image/jpeg" | "image/png" | "image/webp",
            fileName: selectedAttachment.name,
            fileSizeBytes: Number(uploadData.data.fileSizeBytes ?? uploadData.data.fileSize ?? selectedAttachment.size),
            width: uploadData.data.width ? Number(uploadData.data.width) : undefined,
            height: uploadData.data.height ? Number(uploadData.data.height) : undefined
          };
        } else {
          if (!uploadData?.data?.fileUrl && !uploadData?.data?.mediaUrl) throw new Error("Invalid PDF upload response");
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
            tenantId,
            leadId,
            conversationId: selectedConversation.id,
            channel: selectedChannel,
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
            tenantId,
            leadId,
            conversationId: selectedConversation.id,
            channel: selectedChannel,
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
        const failedLabel = sequenceResult.failedStep === "document_pdf" ? "PDF" : sequenceResult.failedStep;
        if (sequenceResult.status === "partial_success") {
          setErrorMessage(
            `${sequenceResult.successfulSteps.join(", ")} sent successfully, but ${failedLabel} send failed: ${sequenceResult.error ?? "unknown error"}`
          );
        } else {
          setErrorMessage(`Send failed: ${sequenceResult.error ?? "unknown error"}`);
        }
        return;
      }
      setDraftText("");
      removeAttachment();
      setResultMessage("Message queued successfully.");
      await loadMessages(selectedConversation.id);
    } catch (error) {
      setErrorMessage(`Send failed: ${String(error)}`);
    } finally {
      setBusyState("");
    }
  }

  async function sendBulkTest50() {
    setErrorMessage("");
    setResultMessage("");
    if (!selectedConversation) {
      setErrorMessage("Please select a conversation.");
      return;
    }
    if (selectedAttachmentFile) {
      setErrorMessage("Please remove attachment before bulk text test.");
      return;
    }
    const leadId = getField<string>(selectedConversation, ["lead_id", "leadId"]);
    const channelThreadId = getField<string>(selectedConversation, ["channel_thread_id", "channelThreadId"]);
    if (!leadId || !channelThreadId) {
      setErrorMessage("Selected conversation is missing leadId or channelThreadId.");
      return;
    }

    setBusyState("sending");
    try {
      for (let i = 1; i <= 50; i += 1) {
        await apiFetch("/api/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId,
            leadId,
            conversationId: selectedConversation.id,
            channel: selectedChannel,
            channelThreadId,
            type: "text",
            content: `ทดสอบการส่งข้อความที่ ${i}`
          })
        });
      }
      setResultMessage("Bulk test queued successfully: 50 messages.");
      await loadMessages(selectedConversation.id);
    } catch (error) {
      setErrorMessage(`Bulk send failed: ${String(error)}`);
    } finally {
      setBusyState("");
    }
  }

  return (
    <main>
      <h1>HubChat Agent Composer</h1>
      <div className="card">
        <h2>Session</h2>
        <div className="grid2">
          <label>
            Base URL
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          </label>
          <label>
            Tenant ID
            <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="tenant uuid" />
          </label>
        </div>
        <label>
          Access Token
          <textarea value={token} onChange={(e) => setToken(e.target.value)} rows={3} placeholder="Bearer token value only" />
        </label>
        <button disabled={busyState === "loading"} onClick={loadConversations}>
          {busyState === "loading" ? "Loading..." : "Load Conversations"}
        </button>
      </div>

      <div className="card">
        <h2>Conversation</h2>
        {selectedConversation && (
          <div className="conv-header">
            <ConversationAvatar row={selectedConversation} />
            <div className="conv-header-text">
              <div className="conv-header-name">{resolveConversationParticipantName(selectedConversation)}</div>
              <div className="hint">{contextChannel}</div>
            </div>
          </div>
        )}
        <div className="conversation-list" role="list" aria-label="Conversations">
          {conversations.length === 0 && <p className="hint">Load conversations to see threads here.</p>}
          {conversations.map((c) => {
            const channel = getField<OutboundChannel>(c, ["channel_type", "channelType"], "LINE");
            const participant = resolveConversationParticipantName(c);
            const preview = conversationPreviewById[c.id];
            const previewShort = preview && preview.length > 56 ? `${preview.slice(0, 56)}…` : preview;
            const active = c.id === selectedConversationId;
            return (
              <button
                key={c.id}
                type="button"
                role="listitem"
                className={`conversation-list-item${active ? " conversation-list-item-active" : ""}`}
                onClick={() => {
                  setSelectedConversationId(c.id);
                  const ch = getField<OutboundChannel>(c, ["channel_type", "channelType"], "LINE");
                  if (ch) setSelectedChannel(ch);
                  void loadMessages(c.id);
                }}
              >
                <ConversationAvatar row={c} />
                <div className="conversation-list-text">
                  <div className="conversation-list-title">
                    <strong>{participant}</strong>
                    <span className="hint conversation-list-channel">{channel}</span>
                  </div>
                  {previewShort ? <div className="hint conversation-list-preview">{previewShort}</div> : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2>Composer</h2>
        <p className="hint">Selected channel for this send: <strong>{selectedChannel}</strong></p>
        <label>
          Outbound Channel
          <select value={selectedChannel} onChange={(e) => setSelectedChannel(e.target.value as OutboundChannel)}>
            <option value="LINE">LINE</option>
            <option value="FACEBOOK">Facebook Messenger</option>
          </select>
        </label>

        <label>
          Text
          <textarea
            rows={4}
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
              disabled={Boolean(busyState)}
            />
            <span>Select Attachment (Image or PDF)</span>
          </label>
          {selectedAttachmentFile && (
            <button type="button" onClick={removeAttachment} disabled={Boolean(busyState)}>
              Remove Attachment
            </button>
          )}
        </div>

        {selectedAttachment?.kind === "image" && imagePreviewUrl && (
          <div className="image-preview">
            <img src={imagePreviewUrl} alt="Local preview" />
            <div className="hint">
              {selectedAttachment.name} ({Math.round(selectedAttachment.size / 1024)} KB)
            </div>
          </div>
        )}
        {selectedAttachment?.kind === "document_pdf" && (
          <div className="doc-preview">
            <div className="doc-badge">PDF</div>
            <div className="hint">
              {selectedAttachment.name} ({formatFileSize(selectedAttachment.size)})
            </div>
          </div>
        )}

        <button disabled={!canSubmit} onClick={sendCompose}>
          {busyState === "uploading" ? "Uploading attachment..." : busyState === "sending" ? "Sending..." : "Send"}
        </button>
        <button
          type="button"
          disabled={Boolean(busyState) || !selectedConversationId}
          onClick={sendBulkTest50}
        >
          {busyState === "sending" ? "Sending bulk test..." : "Send Test 50 Messages"}
        </button>
      </div>

      {errorMessage && <div className="card error">{errorMessage}</div>}
      {resultMessage && <div className="card success">{resultMessage}</div>}

      <div className="card">
        <h2>Messages</h2>
        {messages.length === 0 && <p className="hint">No messages loaded.</p>}
        <ul className="message-list">
          {messages.map((m) => {
            const msgType = (getField<string>(m, ["messageType", "message_type"], "TEXT") ?? "TEXT").toUpperCase();
            const channel = getField<string>(m, ["channelType", "channel_type"], "-");
            const metadata = (m.metadataJson ?? m.metadata_json ?? {}) as Record<string, unknown>;
            const status = typeof metadata.delivery_status === "string" ? metadata.delivery_status : "PENDING";
            const imageUrl = mediaUrlFromMessage(m);
            const pdfUrl = msgType === "DOCUMENT_PDF" ? mediaUrlFromMessage(m) : null;
            const pdfName = fileNameFromMessage(m) ?? "document.pdf";
            const pdfSize = typeof metadata.fileSizeBytes === "number" ? Number(metadata.fileSizeBytes) : undefined;
            return (
              <li key={m.id} className={`msg msg-${m.direction.toLowerCase()}`}>
                <div className="meta">
                  <strong>{m.direction}</strong> | {channel} | {msgType} | {status}
                </div>
                {msgType === "IMAGE" && imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="message image"
                    className="msg-image"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : msgType === "DOCUMENT_PDF" && pdfUrl ? (
                  <div className="msg-doc">
                    <div className="doc-badge">PDF</div>
                    <a href={pdfUrl} target="_blank" rel="noreferrer" className="doc-link">
                      {pdfName}
                    </a>
                    <div className="hint">{formatFileSize(pdfSize)}</div>
                  </div>
                ) : (
                  <p>{m.content}</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
