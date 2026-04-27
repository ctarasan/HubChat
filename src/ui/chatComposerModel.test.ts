import test from "node:test";
import assert from "node:assert/strict";
import {
  attachmentKindFromMime,
  buildLeadListItems,
  buildSendSequence,
  canSubmitComposer,
  performSendSequence,
  buildComposerErrorMessage,
  resolveLeadIdentityKey,
  resolveConversationParticipantAvatarUrl,
  resolveConversationUnreadCount,
  resolveConversationParticipantName,
  resolveConversationAvatarPlan,
  shouldShowUnreadBadge,
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
  assert.deepEqual(result.succeededActions, ["text"]);
  assert.equal(result.failedStep, "image");
  assert.equal(result.failedAction, "image");
  assert.equal(typeof result.errorMessage, "string");
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

test("unread badge hidden when unread is zero", () => {
  assert.equal(shouldShowUnreadBadge({ unreadCount: 0 }), false);
  assert.equal(shouldShowUnreadBadge({ unread_count: 0 }), false);
  assert.equal(resolveConversationUnreadCount({}), 0);
});

test("unread badge visible with count when unread is positive", () => {
  assert.equal(shouldShowUnreadBadge({ unreadCount: 3 }), true);
  assert.equal(resolveConversationUnreadCount({ unread_count: 2 }), 2);
});

test("partial success error message for image is user-friendly", () => {
  const msg = buildComposerErrorMessage({
    status: "partial_success",
    successfulSteps: ["text"],
    succeededActions: ["text"],
    failedStep: "image",
    failedAction: "image",
    failedKind: "image",
    errorMessage: "provider error",
    error: "provider error"
  });
  assert.equal(msg, "Text sent successfully, but image failed to send.");
});

test("partial success error message for pdf is user-friendly", () => {
  const msg = buildComposerErrorMessage({
    status: "partial_success",
    successfulSteps: ["text"],
    succeededActions: ["text"],
    failedStep: "document_pdf",
    failedAction: "document_pdf",
    failedKind: "pdf",
    errorMessage: "provider error",
    error: "provider error"
  });
  assert.equal(msg, "Text sent successfully, but PDF failed to send.");
});

test("complete failure message names failed action", () => {
  const msg = buildComposerErrorMessage({
    status: "failure",
    successfulSteps: [],
    succeededActions: [],
    failedStep: "image",
    failedAction: "image",
    failedKind: "image",
    errorMessage: "provider timeout",
    error: "provider timeout"
  });
  assert.equal(msg, "Failed to send image: provider timeout");
});

test("grouping: same facebook external user collapses to one lead item", () => {
  const items = buildLeadListItems([
    {
      id: "c1",
      tenant_id: "t1",
      channel_type: "FACEBOOK",
      external_user_id: "fb-user-1",
      last_message_at: "2026-04-26T10:00:00.000Z",
      last_message_preview: "Older",
      unread_count: 2
    },
    {
      id: "c2",
      tenant_id: "t1",
      channel_type: "FACEBOOK",
      external_user_id: "fb-user-1",
      last_message_at: "2026-04-26T11:00:00.000Z",
      last_message_preview: "Newest",
      unread_count: 1
    }
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.platform, "FACEBOOK");
  assert.equal(items[0]?.latestConversationId, "c2");
  assert.equal(items[0]?.latestMessagePreview, "Newest");
  assert.equal(items[0]?.unreadCountTotal, 3);
  assert.equal(items[0]?.conversationCount, 2);
});

test("grouping: same external id across line and facebook stays separate", () => {
  const items = buildLeadListItems([
    {
      id: "line1",
      tenant_id: "t1",
      channel_type: "LINE",
      external_user_id: "user-1",
      last_message_at: "2026-04-26T09:00:00.000Z"
    },
    {
      id: "fb1",
      tenant_id: "t1",
      channel_type: "FACEBOOK",
      external_user_id: "user-1",
      last_message_at: "2026-04-26T10:00:00.000Z"
    }
  ]);
  assert.equal(items.length, 2);
  assert.equal(items.some((item) => item.platform === "LINE"), true);
  assert.equal(items.some((item) => item.platform === "FACEBOOK"), true);
});

test("grouping key fallback uses contact id then thread id", () => {
  const byContact = resolveLeadIdentityKey({
    tenant_id: "t1",
    channel_type: "FACEBOOK",
    contact_id: "contact-1"
  });
  const byThread = resolveLeadIdentityKey({
    tenant_id: "t1",
    channel_type: "FACEBOOK",
    channel_thread_id: "thread-1"
  });
  assert.equal(byContact, "t1|FACEBOOK|contact:contact-1");
  assert.equal(byThread, "t1|FACEBOOK|thread:thread-1");
});
