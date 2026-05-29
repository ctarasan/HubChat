import test from "node:test";
import assert from "node:assert/strict";
import { resolveLeadsInboxLifecycle } from "./leadsInboxLifecycle.js";

test("ACTIVE conversation allows Open inbox", () => {
  for (const status of ["OPEN", "PENDING", "RESOLVED"]) {
    const life = resolveLeadsInboxLifecycle({ status });
    assert.equal(life.inboxState, "ACTIVE", status);
    assert.equal(life.canOpenInbox, true, status);
    assert.equal(life.canReopenInbox, false, status);
  }
});

test("ARCHIVED conversation blocks Open inbox but allows reopen", () => {
  const life = resolveLeadsInboxLifecycle({
    status: "ARCHIVED",
    resolved_at: "2026-05-20T08:00:00.000Z"
  });
  assert.equal(life.inboxState, "ARCHIVED");
  assert.equal(life.canOpenInbox, false);
  assert.equal(life.canReopenInbox, true);
  assert.equal(life.conversationArchivedAt, "2026-05-20T08:00:00.000Z");
  assert.equal(life.retentionLabel, "Archived");
});

test("purge timestamps map to PURGED with Open inbox disabled", () => {
  const life = resolveLeadsInboxLifecycle({
    status: "OPEN",
    history_purged_at: "2026-06-01T00:00:00.000Z"
  });
  assert.equal(life.inboxState, "PURGED");
  assert.equal(life.canOpenInbox, false);
  assert.equal(life.canReopenInbox, false);
  assert.equal(life.historyPurgedAt, "2026-06-01T00:00:00.000Z");
});

test("legacy CLOSED is UNKNOWN and does not allow Open inbox", () => {
  const life = resolveLeadsInboxLifecycle({ status: "CLOSED", closed_at: "2020-01-01T00:00:00.000Z" });
  assert.equal(life.inboxState, "UNKNOWN");
  assert.equal(life.canOpenInbox, false);
  assert.equal(life.canReopenInbox, false);
});

test("missing status is UNKNOWN and safe", () => {
  const life = resolveLeadsInboxLifecycle({});
  assert.equal(life.inboxState, "UNKNOWN");
  assert.equal(life.canOpenInbox, false);
});
