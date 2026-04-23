import test from "node:test";
import assert from "node:assert/strict";
import { decodeCursor, encodeCursor, parseLimit } from "./pagination.js";

test("parseLimit uses defaults and caps max", () => {
  assert.equal(parseLimit(undefined), 25);
  assert.equal(parseLimit("0"), 25);
  assert.equal(parseLimit("-2"), 25);
  assert.equal(parseLimit("10"), 10);
  assert.equal(parseLimit("999"), 100);
});

test("cursor roundtrip encode/decode", () => {
  const raw = { updatedAt: "2026-01-01T00:00:00.000Z", id: "abc" };
  const encoded = encodeCursor(raw);
  const decoded = decodeCursor<typeof raw>(encoded);
  assert.deepEqual(decoded, raw);
});

test("decode invalid cursor returns null", () => {
  assert.equal(decodeCursor("not-base64"), null);
});
