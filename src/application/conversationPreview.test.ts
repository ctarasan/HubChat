import test from "node:test";
import assert from "node:assert/strict";
import { buildLastMessagePreview } from "./conversationPreview.js";

test("text preview generated correctly", () => {
  const result = buildLastMessagePreview({ messageType: "TEXT", content: "hello world" });
  assert.equal(result.type, "TEXT");
  assert.equal(result.preview, "hello world");
});

test("image preview generated as [Image]", () => {
  const result = buildLastMessagePreview({ messageType: "IMAGE", content: "ignored" });
  assert.equal(result.type, "IMAGE");
  assert.equal(result.preview, "[Image]");
});

test("pdf preview generated as [PDF] <fileName>", () => {
  const result = buildLastMessagePreview({
    messageType: "DOCUMENT_PDF",
    content: "ignored",
    fileName: "proposal.pdf"
  });
  assert.equal(result.type, "DOCUMENT_PDF");
  assert.equal(result.preview, "[PDF] proposal.pdf");
});
