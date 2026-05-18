import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFollowUpClearPatch,
  buildFollowUpSavePatch,
  conversationFollowUpPatchPath,
  datetimeLocalValueToIso,
  followUpDraftFromConversationFields,
  getFollowUpStateDescriptor,
  isoToDatetimeLocalValue,
  mergeConversationFollowUpFromPayload,
  validateFollowUpSaveDraft
} from "./followUpEditorModel.js";

test("isoToDatetimeLocalValue and datetimeLocalValueToIso round-trip local wall time", () => {
  const iso = "2026-05-15T14:30:00.000Z";
  const local = isoToDatetimeLocalValue(iso);
  assert.match(local, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  const back = datetimeLocalValueToIso(local);
  assert.ok(back);
  assert.equal(new Date(back!).getTime(), new Date(iso).getTime());
});

test("followUpDraftFromConversationFields reads snake_case and camelCase", () => {
  const draft = followUpDraftFromConversationFields({
    follow_up_at: "2026-05-16T09:00:00.000Z",
    follow_up_note: " Call back "
  });
  assert.equal(draft.note, " Call back ");
  assert.ok(draft.atLocal.length > 0);
});

test("buildFollowUpSavePatch sets date and note", () => {
  const local = isoToDatetimeLocalValue("2026-05-16T09:00:00.000Z");
  const patch = buildFollowUpSavePatch({ atLocal: local, note: "Reminder" });
  assert.equal(typeof patch.followUpAt, "string");
  assert.equal(patch.followUpNote, "Reminder");
});

test("buildFollowUpSavePatch allows note-only", () => {
  const patch = buildFollowUpSavePatch({ atLocal: "", note: "Note only" });
  assert.equal(patch.followUpAt, null);
  assert.equal(patch.followUpNote, "Note only");
});

test("buildFollowUpSavePatch rejects empty draft", () => {
  assert.throws(() => buildFollowUpSavePatch({ atLocal: "", note: "" }), /Add a follow-up/);
});

test("buildFollowUpClearPatch clears both fields", () => {
  assert.deepEqual(buildFollowUpClearPatch(), { followUpAt: null, followUpNote: null });
});

test("getFollowUpStateDescriptor covers none, today, overdue, upcoming", () => {
  const now = new Date("2026-05-15T12:00:00.000Z");
  assert.equal(getFollowUpStateDescriptor(now, null).label, "No follow-up");
  assert.equal(getFollowUpStateDescriptor(now, "2026-05-15T10:00:00.000Z").label, "Follow-up overdue");
  assert.equal(getFollowUpStateDescriptor(now, "2026-05-15T18:00:00.000Z").label, "Due today");
  assert.equal(getFollowUpStateDescriptor(now, "2026-05-20T09:00:00.000Z").label, "Follow-up scheduled");
});

test("mergeConversationFollowUpFromPayload updates row fields", () => {
  const row = { id: "c1", follow_up_at: "old", follow_up_note: "n" };
  const merged = mergeConversationFollowUpFromPayload(row, {
    followUpAt: "2026-05-16T09:00:00.000Z",
    followUpNote: null
  });
  const mergedRow = merged as Record<string, unknown>;
  assert.equal(mergedRow.follow_up_at, "2026-05-16T09:00:00.000Z");
  assert.equal(mergedRow.followUpAt, "2026-05-16T09:00:00.000Z");
  assert.equal(mergedRow.follow_up_note, null);
  assert.equal(mergedRow.followUpNote, null);
});

test("conversationFollowUpPatchPath encodes id", () => {
  assert.equal(conversationFollowUpPatchPath("abc/def"), "/api/conversations/abc%2Fdef/follow-up");
});

test("validateFollowUpSaveDraft rejects invalid datetime-local", () => {
  assert.equal(validateFollowUpSaveDraft({ atLocal: "not-valid", note: "" }), "Invalid follow-up date and time.");
});
