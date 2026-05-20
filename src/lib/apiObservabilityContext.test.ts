import test from "node:test";
import assert from "node:assert/strict";
import { buildApiListDiagnostic } from "./apiObservabilityContext.js";

test("buildApiListDiagnostic omits message content and secrets", () => {
  const diag = buildApiListDiagnostic({
    route: "hubchat.conversations.list",
    tenantId: "tenant-1",
    limit: 25,
    hasCursor: false,
    rawRowCount: 10,
    responseRowCount: 9,
    estimatedUtf8Bytes: 12000,
    payloadTier: "low",
    filters: { status: "OPEN", channel: null }
  });
  assert.equal(diag.diag, "hubchat.conversations.list");
  assert.equal(diag.tenantId, "tenant-1");
  assert.equal(diag.estimatedUtf8Bytes, 12000);
  assert.equal(diag.payloadTier, "low");
  assert.equal(JSON.stringify(diag).includes("content"), false);
  assert.equal(JSON.stringify(diag).includes("Bearer"), false);
});
