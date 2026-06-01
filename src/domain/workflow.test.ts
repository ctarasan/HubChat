import test from "node:test";
import assert from "node:assert/strict";
import { computeFollowUpBucket } from "./conversationInboxBuckets.js";
import {
  computeCustomerRepliedAfterFollowUp,
  followUpBucketToWorkflowStatus,
  mapWorkflowListRowToItem,
  priorityForWorkflowStatus,
  reasonForWorkflowItem,
  resolveWorkflowFollowUpStatus,
  stableFollowUpWorkItemId,
  WORKFLOW_FOLLOW_UP_ITEM_STATUSES,
  WORKFLOW_FOLLOW_UP_STATUSES
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

test("scheduled is a filter/count dimension only, not an item status", () => {
  assert.ok(WORKFLOW_FOLLOW_UP_STATUSES.includes("scheduled"));
  assert.equal(WORKFLOW_FOLLOW_UP_ITEM_STATUSES.includes("scheduled" as "overdue"), false);
  assert.deepEqual([...WORKFLOW_FOLLOW_UP_ITEM_STATUSES], ["overdue", "due_today", "upcoming"]);
});

test("overdue with customer reply keeps critical priority and customer-replied reason", () => {
  const status = "overdue" as const;
  assert.equal(priorityForWorkflowStatus(status, true), "critical");
  const reason = reasonForWorkflowItem({ status, customerRepliedAfterFollowUp: true });
  assert.equal(reason.reasonCode, "CUSTOMER_REPLIED_AFTER_FOLLOW_UP");
});

test("mapWorkflowListRowToItem maps customerProfileImageUrl for Instagram provider identity", () => {
  const item = mapWorkflowListRowToItem(
    {
      id: "c-ig",
      lead_id: "l1",
      channel_type: "INSTAGRAM",
      status: "OPEN",
      follow_up_at: "2026-05-14T10:00:00.000Z",
      assigned_agent_id: null,
      last_customer_message_at: null,
      last_agent_message_at: null,
      created_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-05-02T00:00:00.000Z",
      participant_display_name: null,
      provider_external_user_id: "17409356",
      leads: { status: "NEW", external_user_id: "111" },
      contacts: {
        contact_identities: [
          {
            channel_type: "INSTAGRAM",
            external_user_id: "17409356",
            profile_image_url: "https://cdn.example/ig.jpg"
          }
        ]
      }
    },
    NOW
  );
  assert.ok(item);
  assert.equal(item!.customerProfileImageUrl, "https://cdn.example/ig.jpg");
  assert.equal(JSON.stringify(item).includes("external_user_id"), false);
});

test("mapWorkflowListRowToItem customerProfileImageUrl null when no safe https URL", () => {
  const item = mapWorkflowListRowToItem(
    {
      id: "c2",
      lead_id: "l2",
      channel_type: "LINE",
      status: "OPEN",
      follow_up_at: "2026-05-14T10:00:00.000Z",
      assigned_agent_id: null,
      last_customer_message_at: null,
      last_agent_message_at: null,
      created_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-05-02T00:00:00.000Z",
      participant_display_name: "Pat",
      participant_profile_image_url: "http://insecure.example/x.jpg",
      leads: { status: "NEW" }
    },
    NOW
  );
  assert.ok(item);
  assert.equal(item!.customerProfileImageUrl, null);
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
      sales_agents: { name: "Sam" }
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
