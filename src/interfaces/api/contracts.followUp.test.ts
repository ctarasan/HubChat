import test from "node:test";
import assert from "node:assert/strict";
import { PatchConversationFollowUpSchema } from "./contracts.js";

test("PatchConversationFollowUpSchema accepts followUpAt ISO string", () => {
  const r = PatchConversationFollowUpSchema.safeParse({
    followUpAt: "2026-05-15T09:00:00.000Z"
  });
  assert.equal(r.success, true);
});

test("PatchConversationFollowUpSchema accepts followUpNote", () => {
  const r = PatchConversationFollowUpSchema.safeParse({ followUpNote: "Call back" });
  assert.equal(r.success, true);
});

test("PatchConversationFollowUpSchema accepts clear followUpAt with null", () => {
  const r = PatchConversationFollowUpSchema.safeParse({
    followUpAt: null,
    followUpNote: "keep"
  });
  assert.equal(r.success, true);
});

test("PatchConversationFollowUpSchema accepts clear followUpNote with null", () => {
  const r = PatchConversationFollowUpSchema.safeParse({
    followUpAt: "2026-05-15T09:00:00.000Z",
    followUpNote: null
  });
  assert.equal(r.success, true);
});

test("PatchConversationFollowUpSchema rejects empty body", () => {
  const r = PatchConversationFollowUpSchema.safeParse({});
  assert.equal(r.success, false);
});

test("PatchConversationFollowUpSchema rejects invalid datetime", () => {
  const r = PatchConversationFollowUpSchema.safeParse({ followUpAt: "not-a-date" });
  assert.equal(r.success, false);
});

test("PatchConversationFollowUpSchema rejects extra keys", () => {
  const r = PatchConversationFollowUpSchema.safeParse({
    followUpAt: "2026-05-15T09:00:00.000Z",
    extra: 1
  });
  assert.equal(r.success, false);
});

test("PatchConversationFollowUpSchema rejects note too long", () => {
  const r = PatchConversationFollowUpSchema.safeParse({ followUpNote: "x".repeat(5001) });
  assert.equal(r.success, false);
});
