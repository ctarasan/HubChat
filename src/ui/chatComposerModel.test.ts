import test from "node:test";
import assert from "node:assert/strict";
import {
  attachmentKindFromMime,
  buildSendSequence,
  canSubmitComposer,
  performSendSequence,
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
