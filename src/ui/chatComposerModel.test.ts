import test from "node:test";
import assert from "node:assert/strict";
import { buildSendSequence, canSubmitComposer, validateComposer } from "./chatComposerModel.js";

test("channel selector switching context validation", () => {
  const errors = validateComposer({
    selectedChannel: "FACEBOOK",
    text: "hello",
    image: null,
    context: { id: "c1", channelType: "LINE" }
  });
  assert.equal(errors.some((x) => x.includes("not allowed")), true);
});

test("text-only send sequence", () => {
  const seq = buildSendSequence({ text: "hello", hasImage: false });
  assert.deepEqual(seq.map((x) => x.kind), ["text"]);
});

test("image-only send sequence", () => {
  const seq = buildSendSequence({ text: "", hasImage: true });
  assert.deepEqual(seq.map((x) => x.kind), ["image"]);
});

test("text + image send sequence preserves order", () => {
  const seq = buildSendSequence({ text: "hello", hasImage: true });
  assert.deepEqual(seq.map((x) => x.kind), ["text", "image"]);
});

test("upload/sending disables submit", () => {
  assert.equal(canSubmitComposer({ busy: true, text: "hello", hasImage: true }), false);
  assert.equal(canSubmitComposer({ busy: false, text: "", hasImage: false }), false);
  assert.equal(canSubmitComposer({ busy: false, text: "hello", hasImage: false }), true);
});

test("validation errors for file constraints", () => {
  const errors = validateComposer({
    selectedChannel: "FACEBOOK",
    text: "",
    image: { name: "x.png", size: 9 * 1024 * 1024, type: "image/png" },
    context: { id: "c1", channelType: "FACEBOOK" }
  });
  assert.equal(errors.some((x) => x.includes("<= 8MB")), true);
});

test("regression: text flow still valid", () => {
  const errors = validateComposer({
    selectedChannel: "LINE",
    text: "text only",
    image: null,
    context: { id: "c1", channelType: "LINE" }
  });
  assert.equal(errors.length, 0);
});
