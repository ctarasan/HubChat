import test from "node:test";
import assert from "node:assert/strict";
import { parseCreateRetentionPurgeRunBody } from "./retentionPurgeRunsContracts.js";

test("parseCreateRetentionPurgeRunBody accepts notes only", () => {
  const parsed = parseCreateRetentionPurgeRunBody({ notes: "audit note" });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.notes, "audit note");
});

test("parseCreateRetentionPurgeRunBody rejects client policy snapshot", () => {
  const parsed = parseCreateRetentionPurgeRunBody({
    policySnapshot: { archivedMediaRetentionDays: 1 }
  });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.match(parsed.message, /server-side/i);
});

test("parseCreateRetentionPurgeRunBody rejects empty object", () => {
  const parsed = parseCreateRetentionPurgeRunBody({});
  assert.equal(parsed.ok, true);
});
