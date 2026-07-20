import test from "node:test";
import assert from "node:assert/strict";
import { insertTemplateIntoComposer } from "./composerTemplateInsert.js";

const SAMPLE_BODY = `ราคาและโปรโมชั่นตอนนี้นะครับ

Package S ซื้อแบบรายปี 11,880.- (เดือนละ 990.-) ครับ
- รองรับสมาชิกไม่เกิน 1,000 คน
- ฟรี ออกแบบการ์ดและระบบสมาชิกให้เข้ากับแบรนด์ของคุณ

😊 https://example.com/path`;

test("insert into empty composer", () => {
  const result = insertTemplateIntoComposer({
    existingText: "",
    selectionStart: 0,
    selectionEnd: 0,
    templateBody: SAMPLE_BODY,
    hasReliableSelection: true
  });
  assert.equal(result.nextText, SAMPLE_BODY);
  assert.equal(result.nextCursor, SAMPLE_BODY.length);
});

test("insert at start, middle, and end with reliable selection", () => {
  const existing = "AAA BBB CCC";
  const start = insertTemplateIntoComposer({
    existingText: existing,
    selectionStart: 0,
    selectionEnd: 0,
    templateBody: "X",
    hasReliableSelection: true
  });
  assert.equal(start.nextText, "XAAA BBB CCC");
  assert.equal(start.nextCursor, 1);

  const mid = insertTemplateIntoComposer({
    existingText: existing,
    selectionStart: 4,
    selectionEnd: 4,
    templateBody: "X",
    hasReliableSelection: true
  });
  assert.equal(mid.nextText, "AAA XBBB CCC");
  assert.equal(mid.nextCursor, 5);

  const end = insertTemplateIntoComposer({
    existingText: existing,
    selectionStart: existing.length,
    selectionEnd: existing.length,
    templateBody: "X",
    hasReliableSelection: true
  });
  assert.equal(end.nextText, "AAA BBB CCCX");
  assert.equal(end.nextCursor, existing.length + 1);
});

test("replace selected text and preserve Thai line breaks", () => {
  const result = insertTemplateIntoComposer({
    existingText: "ก่อน [replace] หลัง",
    selectionStart: 5,
    selectionEnd: 14,
    templateBody: "สวัสดี\nครับ",
    hasReliableSelection: true
  });
  assert.equal(result.nextText, "ก่อน สวัสดี\nครับ หลัง");
  assert.equal(result.nextCursor, "ก่อน สวัสดี\nครับ".length);
});

test("append fallback when selection unavailable keeps existing text", () => {
  const result = insertTemplateIntoComposer({
    existingText: "มีข้อความอยู่แล้ว",
    selectionStart: null,
    selectionEnd: null,
    templateBody: SAMPLE_BODY,
    hasReliableSelection: false
  });
  assert.equal(result.nextText.startsWith("มีข้อความอยู่แล้ว\n\n"), true);
  assert.equal(result.nextText.endsWith(SAMPLE_BODY), true);
  assert.equal(result.nextCursor, result.nextText.length);
});

test("append fallback into blank-ish existing uses body only when trim empty", () => {
  const result = insertTemplateIntoComposer({
    existingText: "   \n",
    selectionStart: null,
    selectionEnd: null,
    templateBody: "ใหม่",
    hasReliableSelection: false
  });
  assert.equal(result.nextText, "ใหม่");
});
