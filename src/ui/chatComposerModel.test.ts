import test from "node:test";
import assert from "node:assert/strict";
import {
  attachmentKindFromMime,
  buildSendSequence,
  canSubmitComposer,
  performSendSequence,
  resolveConversationParticipantAvatarUrl,
  resolveConversationParticipantName,
  resolveConversationAvatarPlan,
  validateComposer
} from "./chatComposerModel.js";

test("channel selector switching context validation", () => {
  const errors = validateComposer({
    selectedChannel: "FACEBOOK",
    text: "hello",
    attachment: null,
    context: { id: "c1", channelType: "LINE" }
  });
  assert.equal(errors.some((x) => x.includes("not allowed")), true);
});

test("text-only send sequence", () => {
  const seq = buildSendSequence({ text: "hello", attachmentKind: null });
  assert.deepEqual(seq.map((x) => x.kind), ["text"]);
});

test("image-only send sequence", () => {
  const seq = buildSendSequence({ text: "", attachmentKind: "image" });
  assert.deepEqual(seq.map((x) => x.kind), ["image"]);
});

test("text + image send sequence preserves order", () => {
  const seq = buildSendSequence({ text: "hello", attachmentKind: "image" });
  assert.deepEqual(seq.map((x) => x.kind), ["text", "image"]);
});

test("pdf-only send sequence", () => {
  const seq = buildSendSequence({ text: "", attachmentKind: "document_pdf" });
  assert.deepEqual(seq.map((x) => x.kind), ["document_pdf"]);
});

test("text + pdf send sequence preserves order", () => {
  const seq = buildSendSequence({ text: "hello", attachmentKind: "document_pdf" });
  assert.deepEqual(seq.map((x) => x.kind), ["text", "document_pdf"]);
});

test("upload/sending disables submit and no-content state", () => {
  assert.equal(canSubmitComposer({ busy: true, text: "hello", hasAttachment: true }), false);
  assert.equal(canSubmitComposer({ busy: false, text: "", hasAttachment: false }), false);
  assert.equal(canSubmitComposer({ busy: false, text: "hello", hasAttachment: false }), true);
  assert.equal(canSubmitComposer({ busy: false, text: "", hasAttachment: true }), true);
});

test("validation errors for file constraints", () => {
  const errors = validateComposer({
    selectedChannel: "FACEBOOK",
    text: "",
    attachment: { kind: "image", name: "x.png", size: 9 * 1024 * 1024, type: "image/png" },
    context: { id: "c1", channelType: "FACEBOOK" }
  });
  assert.equal(errors.some((x) => x.includes("<= 8MB")), true);
});

test("validation rejects unsupported file type", () => {
  const errors = validateComposer({
    selectedChannel: "LINE",
    text: "",
    attachment: { kind: "document_pdf", name: "x.docx", size: 1000, type: "application/msword" },
    context: { id: "c1", channelType: "LINE" }
  });
  assert.equal(errors.some((x) => x.includes("Unsupported file type")), true);
});

test("attachment mime mapping supports image/pdf only", () => {
  assert.equal(attachmentKindFromMime("image/png"), "image");
  assert.equal(attachmentKindFromMime("application/pdf"), "document_pdf");
  assert.equal(attachmentKindFromMime("video/mp4"), null);
});

test("partial success result from send sequence", async () => {
  const seq = buildSendSequence({ text: "hello", attachmentKind: "image" });
  const result = await performSendSequence(seq, async (step) => {
    if (step.kind === "image") throw new Error("upload failed");
  });
  assert.equal(result.status, "partial_success");
  assert.deepEqual(result.successfulSteps, ["text"]);
  assert.equal(result.failedStep, "image");
});

test("regression: text flow still valid", () => {
  const errors = validateComposer({
    selectedChannel: "LINE",
    text: "text only",
    attachment: null,
    context: { id: "c1", channelType: "LINE" }
  });
  assert.equal(errors.length, 0);
});

test("participant display name fallback order", () => {
  assert.equal(
    resolveConversationParticipantName({
      participant_display_name: "Primary",
      contacts: { display_name: "Contact Name" },
      external_user_id: "ext-1",
      channel_thread_id: "thread-1"
    }),
    "Primary"
  );
  assert.equal(
    resolveConversationParticipantName({
      contacts: { display_name: "Contact Name" },
      contactIdentityDisplayName: "Identity Name",
      external_user_id: "ext-1",
      channel_thread_id: "thread-1"
    }),
    "Contact Name"
  );
  assert.equal(
    resolveConversationParticipantName({
      contactIdentityDisplayName: "Identity Name",
      external_user_id: "ext-1",
      channel_thread_id: "thread-1"
    }),
    "Identity Name"
  );
  assert.equal(
    resolveConversationParticipantName({
      external_user_id: "ext-1",
      channel_thread_id: "thread-1"
    }),
    "ext-1"
  );
  assert.equal(
    resolveConversationParticipantName({
      channel_thread_id: "thread-1"
    }),
    "thread-1"
  );
  assert.equal(resolveConversationParticipantName({}), "Unknown User");
});

test("participant avatar URL fallback prefers conversation snapshot", () => {
  assert.equal(
    resolveConversationParticipantAvatarUrl({
      participant_profile_image_url: "https://a.example/1.jpg",
      contactIdentityProfileImageUrl: "https://b.example/2.jpg",
      contacts: { profile_image_url: "https://c.example/3.jpg" }
    }),
    "https://a.example/1.jpg"
  );
});

test("participant avatar URL falls back through identity and contact", () => {
  assert.equal(
    resolveConversationParticipantAvatarUrl({
      contactIdentityProfileImageUrl: "https://b.example/2.jpg",
      contacts: { profile_image_url: "https://c.example/3.jpg" }
    }),
    "https://b.example/2.jpg"
  );
  assert.equal(
    resolveConversationParticipantAvatarUrl({
      contacts: { profile_image_url: "https://c.example/3.jpg" }
    }),
    "https://c.example/3.jpg"
  );
});

test("non-https image URLs are ignored for avatar resolution", () => {
  assert.equal(
    resolveConversationParticipantAvatarUrl({
      participant_profile_image_url: "http://insecure.example/x.jpg"
    }),
    null
  );
});

test("avatar plan uses initials when no usable image URL", () => {
  const initialsPlan = resolveConversationAvatarPlan({
    participant_display_name: "Ada Lovelace"
  });
  assert.equal(initialsPlan.kind, "initials");
  if (initialsPlan.kind === "initials") assert.equal(initialsPlan.initials, "AL");
});
