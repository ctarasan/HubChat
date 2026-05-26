import test from "node:test";
import assert from "node:assert/strict";
import { recordMarketingEventSafe } from "./recordMarketingEvent.js";

test("recordMarketingEventSafe swallows insert errors", async () => {
  let called = false;
  await recordMarketingEventSafe(
    {
      insert: async () => {
        called = true;
        throw new Error("db down");
      },
      list: async () => ({ items: [], nextCursor: null })
    },
    {
      tenantId: "tenant-1",
      eventType: "LEAD_CREATED",
      occurredAt: new Date(),
      actorType: "SYSTEM",
      metadata: {}
    }
  );
  assert.equal(called, true);
});

test("recordMarketingEventSafe no-ops when repository undefined", async () => {
  await recordMarketingEventSafe(undefined, {
    tenantId: "tenant-1",
    eventType: "LEAD_CREATED",
    occurredAt: new Date(),
    actorType: "SYSTEM"
  });
});
