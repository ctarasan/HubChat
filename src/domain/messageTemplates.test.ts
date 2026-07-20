import test from "node:test";
import assert from "node:assert/strict";
import {
  MESSAGE_TEMPLATE_BODY_MAX,
  MESSAGE_TEMPLATE_TITLE_MAX,
  filterMessageTemplatesClientSide,
  formatMessageTemplateValidationError,
  normalizeTemplateBody,
  toMessageTemplateDto,
  validateMessageTemplateWrite
} from "../domain/messageTemplates.js";

test("validateMessageTemplateWrite accepts valid title and body with line breaks", () => {
  const body = "สวัสดีครับ\n\nPackage S\n- item";
  const result = validateMessageTemplateWrite({ title: "  ราคา Package S  ", body });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.title, "ราคา Package S");
  assert.equal(result.body, body);
});

test("validateMessageTemplateWrite rejects blank title/body and length boundaries", () => {
  assert.equal(validateMessageTemplateWrite({ title: "   ", body: "hi" }).ok, false);
  assert.equal(validateMessageTemplateWrite({ title: "t", body: "   \n  " }).ok, false);
  assert.equal(
    validateMessageTemplateWrite({ title: "x".repeat(MESSAGE_TEMPLATE_TITLE_MAX + 1), body: "ok" }).ok,
    false
  );
  assert.equal(
    validateMessageTemplateWrite({ title: "ok", body: "y".repeat(MESSAGE_TEMPLATE_BODY_MAX + 1) }).ok,
    false
  );
  const boundary = validateMessageTemplateWrite({
    title: "x".repeat(MESSAGE_TEMPLATE_TITLE_MAX),
    body: "y".repeat(MESSAGE_TEMPLATE_BODY_MAX)
  });
  assert.equal(boundary.ok, true);
});

test("normalizeTemplateBody preserves intentional trailing newlines", () => {
  assert.equal(normalizeTemplateBody("a\r\nb\r\n\r\n"), "a\nb\n\n");
});

test("toMessageTemplateDto omits tenant and owner", () => {
  const dto = toMessageTemplateDto({
    id: "1",
    tenantId: "t",
    ownerUserId: "u",
    title: "T",
    body: "B",
    createdAt: "c",
    updatedAt: "u2"
  });
  assert.deepEqual(dto, {
    id: "1",
    title: "T",
    body: "B",
    createdAt: "c",
    updatedAt: "u2"
  });
  assert.equal("tenantId" in dto, false);
});

test("filterMessageTemplatesClientSide matches title and body case-insensitively", () => {
  const items = [
    {
      id: "1",
      title: "Package S",
      body: "ราคาและโปรโมชั่น",
      createdAt: "a",
      updatedAt: "b"
    },
    {
      id: "2",
      title: "Greeting",
      body: "Hello there",
      createdAt: "a",
      updatedAt: "b"
    }
  ];
  assert.equal(filterMessageTemplatesClientSide(items, "  package ").length, 1);
  assert.equal(filterMessageTemplatesClientSide(items, "hello").length, 1);
  assert.equal(filterMessageTemplatesClientSide(items, "nope").length, 0);
});

test("formatMessageTemplateValidationError joins messages", () => {
  const invalid = validateMessageTemplateWrite({ title: "", body: "" });
  assert.equal(invalid.ok, false);
  if (invalid.ok) return;
  assert.match(formatMessageTemplateValidationError(invalid.errors), /required/i);
});
