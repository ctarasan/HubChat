import test from "node:test";
import assert from "node:assert/strict";
import { computeFollowUpBucket } from "./conversationInboxBuckets.js";
import {
  computeCustomerRepliedAfterFollowUp,
  followUpBucketToWorkflowStatus,
  mapWorkflowListRowToItem,
  priorityForWorkflowStatus,
  resolveWorkflowFollowUpStatus,
  stableFollowUpWorkItemId
} from "./workflow.js";

const NOW = new Date("2026-05-15T12:00:00.000Z");

test("followUpBucketToWorkflowStatus matches computeFollowUpBucket", () => {
  const due = new Date("2026-05-16T09:00:00.000Z");
  const bucket = computeFollowUpBucket(NOW, due);
  assert.equal(followUpBucketToWorkflowStatus(bucket), "upcoming");
  assert.equal(resolveWorkflowFollowUpStatus(NOW, due), "upcoming");
});

test("computeCustomerRepliedAfterFollowUp uses timestamps only", () => {
  const followUpAt = new Date("2026-05-15T10:00:00.000Z");
  assert.equal(
    computeCustomerRepliedAfterFollowUp({
      followUpAt,
      lastCustomerMessageAt: new Date("2026-05-15T11:00:00.000Z")
    }),
    true
  );
  assert.equal(
    computeCustomerRepliedAfterFollowUp({
      followUpAt,
      lastCustomerMessageAt: new Date("2026-05-15T09:00:00.000Z")
    }),
    false
  );
});

test("priorityForWorkflowStatus mapping", () => {
  assert.equal(priorityForWorkflowStatus("overdue", false), "critical");
  assert.equal(priorityForWorkflowStatus("due_today", false), "warn");
  assert.equal(priorityForWorkflowStatus("upcoming", true), "warn");
  assert.equal(priorityForWorkflowStatus("upcoming", false), "info");
});

test("mapWorkflowListRowToItem excludes RESOLVED conversations", () => {
  const item = mapWorkflowListRowToItem(
    {
      id: "c1",
      lead_id: "l1",
      channel_type: "LINE",
      status: "RESOLVED",
      follow_up_at: "2026-05-14T10:00:00.000Z",
      assigned_agent_id: null,
      last_customer_message_at: null,
      last_agent_message_at: null,
      created_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-05-01T00:00:00.000Z",
      participant_display_name: null
    },
    NOW
  );
  assert.equal(item, null);
});

test("mapWorkflowListRowToItem stable id and no follow_up_note field", () => {
  const item = mapWorkflowListRowToItem(
    {
      id: "c1",
      lead_id: "l1",
      channel_type: "LINE",
      status: "OPEN",
      follow_up_at: "2026-05-14T10:00:00.000Z",
      assigned_agent_id: "a1",
      last_customer_message_at: "2026-05-15T11:00:00.000Z",
      last_agent_message_at: null,
      created_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-05-02T00:00:00.000Z",
      participant_display_name: "Pat",
      leads: { status: "CONTACTED" },
      sales_agents: { id: "a1", name: "Sam" }
    },
    NOW
  );
  assert.ok(item);
  assert.equal(item!.id, stableFollowUpWorkItemId("c1"));
  assert.equal(item!.status, "overdue");
  assert.equal(item!.flags.customerRepliedAfterFollowUp, true);
  assert.equal(Object.prototype.hasOwnProperty.call(item, "follow_up_note"), false);
  assert.equal(JSON.stringify(item).includes("follow_up_note"), false);
});
