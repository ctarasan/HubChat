"use client";

import { useMemo, useState } from "react";
import { buildSendSequence, canSubmitComposer, type OutboundChannel, validateComposer } from "../src/ui/chatComposerModel.js";

type ConversationRow = {
  id: string;
  lead_id?: string;
  leadId?: string;
  channel_type?: OutboundChannel;
  channelType?: OutboundChannel;
  channel_thread_id?: string;
  channelThreadId?: string;
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
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [busyState, setBusyState] = useState<"" | "loading" | "uploading" | "sending">("");
  const [errorMessage, setErrorMessage] = useState("");
  const [resultMessage, setResultMessage] = useState("");

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );
  const contextChannel = getField<OutboundChannel>(selectedConversation, ["channel_type", "channelType"], "LINE");
  const canSubmit = canSubmitComposer({ busy: Boolean(busyState), text: draftText, hasImage: Boolean(selectedImageFile) });

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
      const rows = (res?.data ?? []) as ConversationRow[];
      setConversations(rows);
      const previewPairs = await Promise.all(
        rows.map(async (row) => {
          try {
            const msgRes = await apiFetch(`/api/conversations/${encodeURIComponent(row.id)}/messages?limit=20`);
            const items = (msgRes?.data ?? []) as MessageRow[];
            return [row.id, toConversationPreview(items)] as const;
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

  function onSelectImage(file: File | null) {
    setErrorMessage("");
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setSelectedImageFile(file);
    setImagePreviewUrl(preview);
  }

  function removeImage() {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setSelectedImageFile(null);
    setImagePreviewUrl(null);
  }

  async function sendCompose() {
    setErrorMessage("");
    setResultMessage("");
    const validationErrors = validateComposer({
      selectedChannel,
      text: draftText,
      image: selectedImageFile
        ? { name: selectedImageFile.name, size: selectedImageFile.size, type: selectedImageFile.type }
        : null,
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

    const steps = buildSendSequence({ text: draftText, hasImage: Boolean(selectedImageFile) });
    let uploadData: any = null;
    let textSent = false;

    try {
      for (const step of steps) {
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
          textSent = true;
        } else {
          if (!selectedImageFile) continue;
          setBusyState("uploading");
          const form = new FormData();
          form.append("file", selectedImageFile);
          const uploadRes = await fetch(`${baseUrl}/api/messages/upload-image`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "x-tenant-id": tenantId
            },
            body: form
          });
          const uploadText = await uploadRes.text();
          uploadData = uploadText ? JSON.parse(uploadText) : null;
          if (!uploadRes.ok) {
            throw new Error(uploadData?.error ?? uploadData?.detail ?? "image upload failed");
          }
          if (!uploadData?.data?.mediaUrl || !uploadData?.data?.mediaMimeType) {
            throw new Error("Invalid image upload response");
          }

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
              type: "image",
              content: draftText.trim() ? "[image]" : "",
              mediaUrl: uploadData.data.mediaUrl,
              previewUrl: uploadData.data.previewUrl ?? uploadData.data.mediaUrl,
              mediaMimeType: uploadData.data.mediaMimeType,
              fileSizeBytes: uploadData.data.fileSizeBytes ?? uploadData.data.fileSize ?? selectedImageFile.size,
              width: uploadData.data.width ?? undefined,
              height: uploadData.data.height ?? undefined
            })
          });
        }
      }

      setDraftText("");
      removeImage();
      setResultMessage("Message queued successfully.");
      await loadMessages(selectedConversation.id);
    } catch (error) {
      const err = String(error);
      if (textSent && selectedImageFile) {
        setErrorMessage(`Text sent successfully, but image send failed: ${err}`);
      } else {
        setErrorMessage(`Send failed: ${err}`);
      }
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
        <label>
          Select Conversation
          <select
            value={selectedConversationId}
            onChange={(e) => {
              setSelectedConversationId(e.target.value);
              const picked = conversations.find((c) => c.id === e.target.value);
              const ch = getField<OutboundChannel>(picked, ["channel_type", "channelType"], "LINE");
              if (ch) setSelectedChannel(ch);
              if (e.target.value) {
                void loadMessages(e.target.value);
              }
            }}
          >
            <option value="">-- choose --</option>
            {conversations.map((c) => {
              const channel = getField<OutboundChannel>(c, ["channel_type", "channelType"], "LINE");
              const lead = getField<string>(c, ["lead_id", "leadId"], "-");
              const preview = conversationPreviewById[c.id];
              const previewShort = preview && preview.length > 70 ? `${preview.slice(0, 70)}...` : preview;
              return (
                <option key={c.id} value={c.id}>
                  {previewShort ? `${previewShort} | ${channel}` : `${c.id} | ${channel} | lead ${lead}`}
                </option>
              );
            })}
          </select>
        </label>
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
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => onSelectImage(e.target.files?.[0] ?? null)}
              disabled={Boolean(busyState)}
            />
            <span>Select Image</span>
          </label>
          {selectedImageFile && (
            <button type="button" onClick={removeImage} disabled={Boolean(busyState)}>
              Remove Image
            </button>
          )}
        </div>

        {imagePreviewUrl && (
          <div className="image-preview">
            <img src={imagePreviewUrl} alt="Local preview" />
            <div className="hint">
              {selectedImageFile?.name} ({selectedImageFile ? Math.round(selectedImageFile.size / 1024) : 0} KB)
            </div>
          </div>
        )}

        <button disabled={!canSubmit} onClick={sendCompose}>
          {busyState === "uploading" ? "Uploading image..." : busyState === "sending" ? "Sending..." : "Send"}
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
