import test from "node:test";
import assert from "node:assert/strict";
import { parseMetaTimestamp } from "./dateUtils.js";

test("parseMetaTimestamp converts epoch seconds to modern ISO date", () => {
  const iso = parseMetaTimestamp(1777441627);
  const parsed = new Date(iso);
  assert.equal(Number.isNaN(parsed.getTime()), false);
  assert.equal(parsed.getUTCFullYear(), 2026);
});

test("parseMetaTimestamp keeps epoch milliseconds valid", () => {
  const iso = parseMetaTimestamp(1777441627000);
  assert.equal(iso, "2026-04-29T05:47:07.000Z");
});

test("parseMetaTimestamp keeps ISO input unchanged", () => {
  const iso = parseMetaTimestamp("2026-04-29T11:46:00.000Z");
  assert.equal(iso, "2026-04-29T11:46:00.000Z");
});

