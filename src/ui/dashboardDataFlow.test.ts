import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

test("dashboard conversation list uses API-provided preview field", () => {
  assert.equal(source.includes("preview={row.lastMessagePreview ?? row.last_message_preview ?? \"\"}"), true);
});

test("dashboard does not fetch per-conversation messages while loading conversation list", () => {
  const start = source.indexOf("async function loadConversations()");
  const end = source.indexOf("async function loadMessages(conversationId: string)");
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
  assert.equal(source.includes("<select"), false);
});

test("dashboard send flow uses conversation-derived active channel", () => {
  assert.equal(source.includes("const activeChannel: OutboundChannel = contextChannel ?? \"LINE\";"), true);
  assert.equal(source.includes("channel: activeChannel"), true);
});

test("dashboard timeline includes date separators and time labels", () => {
  assert.equal(source.includes("function formatDateSeparator"), true);
  assert.equal(source.includes("function formatTimeLabel"), true);
  assert.equal(source.includes("msg-day-separator"), true);
  assert.equal(source.includes("entry.timeLabel"), true);
});
