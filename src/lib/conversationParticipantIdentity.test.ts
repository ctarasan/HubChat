import test from "node:test";
import assert from "node:assert/strict";
import {
  previewExternalUserId,
  resolveConversationParticipantDisplayLabel
} from "./conversationParticipantIdentity.js";

test("resolveConversationParticipantDisplayLabel prefers participant name", () => {
  assert.equal(
    resolveConversationParticipantDisplayLabel({
      participant_display_name: "Primary",
      provider_external_user_id: "17409356"
    }),
    "Primary"
  );
});

test("resolveConversationParticipantDisplayLabel falls back to provider external user id", () => {
  assert.equal(
    resolveConversationParticipantDisplayLabel({
      leads: { external_user_id: "111" },
      provider_external_user_id: "17409356"
    }),
    "17409356"
  );
});

test("resolveConversationParticipantDisplayLabel falls back to lead external user id", () => {
  assert.equal(
    resolveConversationParticipantDisplayLabel({
      leads: { external_user_id: "111" }
    }),
    "111"
  );
});

test("resolveConversationParticipantDisplayLabel falls back to channel thread id", () => {
  assert.equal(
    resolveConversationParticipantDisplayLabel({
      channel_thread_id: "thread-abc"
    }),
    "thread-abc"
  );
});

test("resolveConversationParticipantDisplayLabel unknown label matches Inbox", () => {
  assert.equal(resolveConversationParticipantDisplayLabel({}), "Unknown User");
});

test("previewExternalUserId shortens very long ids only", () => {
  assert.equal(previewExternalUserId("111"), "111");
  const long = "a".repeat(40);
  const preview = previewExternalUserId(long);
  assert.ok(preview && preview.includes("…"));
  assert.ok(preview!.length < long.length);
});
