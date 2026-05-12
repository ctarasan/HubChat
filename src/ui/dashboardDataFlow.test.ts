import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

test("dashboard conversation list builds grouped lead items from conversations", () => {
  assert.equal(source.includes("const leadItems = useMemo("), true);
  assert.equal(source.includes("buildLeadListItems(conversations"), true);
});

test("dashboard does not fetch per-conversation messages while loading conversation list", () => {
  const start = source.indexOf("async function loadConversations(");
  const end = source.indexOf("async function loadMessages(");
  assert.equal(start >= 0 && end > start, true);
  const loadConversationsBlock = source.slice(
    start,
    end
  );
  assert.equal(loadConversationsBlock.includes("/api/conversations?limit=100"), true);
  assert.equal(loadConversationsBlock.includes("/messages?limit=100"), false);
});

test("dashboard composer does not render outbound channel selector UI", () => {
  assert.equal(source.includes("Selected channel"), false);
  assert.equal(source.includes("Outbound Channel"), false);
});

test("dashboard includes team inbox filter bar and assignment controls", () => {
  assert.equal(source.includes("inbox-filter-bar"), true);
  assert.equal(source.includes("assignment-controls"), true);
  assert.equal(source.includes("assignment-agent-select"), true);
});

test("dashboard send flow uses conversation-derived active channel", () => {
  assert.equal(source.includes("const activeChannel: OutboundChannel = contextChannel ?? \"LINE\";"), true);
  assert.equal(source.includes("channel: activeChannel"), true);
});

test("dashboard refreshes conversation list on an interval (silent) for new inbound threads", () => {
  assert.equal(source.includes("NEXT_PUBLIC_CONVERSATIONS_POLL_INTERVAL_MS"), true);
  assert.equal(source.includes("parseConversationsPollIntervalMs"), true);
  assert.equal(source.includes("setInterval"), true);
  assert.equal(source.includes("{ silent: true }"), true);
  assert.equal(source.includes("loadConversationsRef"), true);
});

test("dashboard lead click opens latest grouped conversation", () => {
  assert.equal(source.includes("setSelectedConversationId(item.latestConversationId);"), true);
  assert.equal(
    source.includes("void loadMessages(item.latestConversationId, item.conversationIds, { forceScroll: true });"),
    true
  );
});

test("dashboard sidebar shows grouped thread count label", () => {
  assert.equal(source.includes("threads"), true);
  assert.equal(source.includes("conversation-thread-count"), true);
});

test("dashboard timeline includes date separators and time labels", () => {
  assert.equal(source.includes("function formatDateSeparator"), true);
  assert.equal(source.includes("function formatTimeLabel"), true);
  assert.equal(source.includes("msg-day-separator"), true);
  assert.equal(source.includes("entry.timeLabel"), true);
});

test("dashboard image rendering uses lazy loading and thumbnail fallback text", () => {
  assert.equal(source.includes("loading=\"lazy\""), true);
  assert.equal(source.includes("Image received - no preview available"), true);
});

test("dashboard image URL resolver includes snake_case and metadata fallbacks", () => {
  assert.equal(source.includes("m.preview_url"), true);
  assert.equal(source.includes("m.media_url"), true);
  assert.equal(source.includes("m.metadataJson ?? m.metadata_json"), true);
  assert.equal(source.includes("metadata.previewUrl"), true);
  assert.equal(source.includes("metadata.mediaUrl"), true);
  assert.equal(source.includes("metadata.thumbnailUrl"), true);
  assert.equal(source.includes("metadata.fullImageUrl"), true);
});

test("dashboard image messages do not fall back to [Empty]", () => {
  assert.equal(source.includes("{isImageMessage ? ("), true);
  assert.equal(source.includes("Image received - no preview available"), true);
});

test("dashboard image rendering supports metadata preview URL fallback", () => {
  assert.equal(source.includes("metadata.previewUrl"), true);
  assert.equal(source.includes("{isImageMessage && imageUrl ? ("), true);
});

test("dashboard media debug output is available behind env flag", () => {
  assert.equal(source.includes("NEXT_PUBLIC_DEBUG_MEDIA"), true);
  assert.equal(source.includes("JSON.stringify("), true);
  assert.equal(source.includes("metadata: m.metadataJson ?? m.metadata_json ?? {}"), true);
});

test("dashboard loadMessages normalizes camelCase and snake_case fields", () => {
  assert.equal(source.includes("function normalizeMessageRow"), true);
  assert.equal(source.includes("messageType:"), true);
  assert.equal(source.includes("mediaUrl:"), true);
  assert.equal(source.includes("previewUrl:"), true);
  assert.equal(source.includes("metadataJson:"), true);
});

test("grouped lead message loading fetches all grouped conversation ids", () => {
  assert.equal(source.includes("const conversationIds = Array.from(new Set([conversationId, ...(groupedConversationIds ?? [])]))"), true);
  assert.equal(source.includes("Promise.all("), true);
  assert.equal(source.includes("/messages?limit=100"), true);
});

test("grouped lead message sorting uses occurred_at/created_at timeline", () => {
  assert.equal(source.includes("parseMessageCreatedAt(a)?.toISOString()"), true);
  assert.equal(source.includes("return aTime < bTime ? -1 : 1;"), true);
});

test("grouped mark-read marks all conversation ids", () => {
  assert.equal(source.includes("async function markConversationRead(conversationIds: string[])"), true);
  assert.equal(source.includes("void markConversationRead(item.conversationIds);"), true);
});

test("outbound target remains latest selected conversation id", () => {
  assert.equal(source.includes("conversationId: selectedConversation.id"), true);
});

test("dashboard send payload includes grouped conversationIds", () => {
  assert.equal(source.includes("conversationIds: selectedLeadItem?.conversationIds ?? [selectedConversation.id]"), true);
});
