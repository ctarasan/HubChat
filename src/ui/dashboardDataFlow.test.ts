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
