import test from "node:test";
import assert from "node:assert/strict";
import type { OAuthTransactionRecord } from "../../domain/oauthTransactions.js";
import { resolveOAuthPageSelectionTasks } from "./resolveOAuthPageSelectionTasks.js";

const baseTransaction = (): OAuthTransactionRecord => ({
  id: "tx-1",
  tenantId: "tenant-1",
  connectionId: "conn-1",
  provider: "FACEBOOK",
  stateHash: "state",
  resumeSessionHash: null,
  status: "COMPLETED",
  intent: "CONNECT",
  expectedPageId: null,
  initiatedByAuthUserId: "auth-1",
  initiatedBySalesAgentId: "agent-1",
  userTokenExpiresAt: null,
  pageCandidatesJson: [
    {
      pageId: "page-1",
      name: "SMARTKORP",
      tasks: ["MESSAGING"],
      selectable: true,
      reasonCode: null,
      alreadyConnected: false
    }
  ],
  selectedPageId: "page-1",
  errorCategory: null,
  callbackReceivedAt: new Date("2026-06-15T10:00:00.000Z"),
  consumedAt: new Date("2026-06-15T10:00:00.000Z"),
  expiresAt: new Date("2026-06-15T11:00:00.000Z"),
  createdAt: new Date("2026-06-15T10:00:00.000Z"),
  updatedAt: new Date("2026-06-15T10:00:00.000Z")
});

test("resolveOAuthPageSelectionTasks returns tasks from completed OAuth transaction", () => {
  const resolved = resolveOAuthPageSelectionTasks({
    transaction: baseTransaction(),
    providerPageId: "page-1"
  });
  assert.equal(resolved.ok, true);
  if (resolved.ok) {
    assert.deepEqual(resolved.tasks, ["MESSAGING"]);
  }
});

test("resolveOAuthPageSelectionTasks fails when transaction snapshot is missing", () => {
  const resolved = resolveOAuthPageSelectionTasks({
    transaction: null,
    providerPageId: "page-1"
  });
  assert.equal(resolved.ok, false);
  if (!resolved.ok) {
    assert.equal(resolved.reason, "missing_transaction");
  }
});

test("resolveOAuthPageSelectionTasks fails when selected page candidate is missing", () => {
  const resolved = resolveOAuthPageSelectionTasks({
    transaction: baseTransaction(),
    providerPageId: "other-page"
  });
  assert.equal(resolved.ok, false);
  if (!resolved.ok) {
    assert.equal(resolved.reason, "missing_candidate");
  }
});
