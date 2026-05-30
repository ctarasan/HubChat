import test from "node:test";
import assert from "node:assert/strict";
import {
  isRetentionPurgeExecuteEnabled,
  parseRetentionPurgeExecuteBatchLimit,
  RETENTION_PURGE_EXECUTE_CONFIRM_TEXT
} from "./retentionPurgeExecute.js";
import { parseExecuteRetentionPurgeRunBody } from "../interfaces/api/retentionPurgeExecuteContracts.js";

test("isRetentionPurgeExecuteEnabled is false by default", () => {
  assert.equal(isRetentionPurgeExecuteEnabled({}), false);
  assert.equal(isRetentionPurgeExecuteEnabled({ HUBCHAT_RETENTION_PURGE_EXECUTE_ENABLED: "false" }), false);
});

test("isRetentionPurgeExecuteEnabled when explicitly true", () => {
  assert.equal(isRetentionPurgeExecuteEnabled({ HUBCHAT_RETENTION_PURGE_EXECUTE_ENABLED: "true" }), true);
});

test("parseRetentionPurgeExecuteBatchLimit caps at 500", () => {
  assert.equal(parseRetentionPurgeExecuteBatchLimit(), 100);
  assert.equal(parseRetentionPurgeExecuteBatchLimit(999), 500);
});

test("parseExecuteRetentionPurgeRunBody requires exact confirmText", () => {
  const bad = parseExecuteRetentionPurgeRunBody({
    target: "RAW_PAYLOADS",
    confirmText: "wrong"
  });
  assert.equal(bad.ok, false);
  const good = parseExecuteRetentionPurgeRunBody({
    target: "RAW_PAYLOADS",
    confirmText: RETENTION_PURGE_EXECUTE_CONFIRM_TEXT
  });
  assert.equal(good.ok, true);
});

const CONFIRM_TEXT_EDGE_CASES = [
  ["trailing space", `${RETENTION_PURGE_EXECUTE_CONFIRM_TEXT} `],
  ["leading space", ` ${RETENTION_PURGE_EXECUTE_CONFIRM_TEXT}`],
  ["lowercase", "execute retention purge"],
  ["partial phrase", "EXECUTE RETENTION"]
] as const;

for (const [label, confirmText] of CONFIRM_TEXT_EDGE_CASES) {
  test(`parseExecuteRetentionPurgeRunBody rejects confirmText ${label}`, () => {
    const parsed = parseExecuteRetentionPurgeRunBody({
      target: "RAW_PAYLOADS",
      confirmText
    });
    assert.equal(parsed.ok, false, label);
  });
}
