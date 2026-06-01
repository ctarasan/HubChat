import test from "node:test";
import assert from "node:assert/strict";
import { mapWorkflowListRowToItem } from "../../domain/workflow.js";
import { assertWorkflowListItemSafe } from "./workflowDtos.js";

const NOW = new Date("2026-05-15T12:00:00.000Z");

test("assertWorkflowListItemSafe rejects external_user_id in serialized item", () => {
  const item = mapWorkflowListRowToItem(
    {
      id: "c1",
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
  assertWorkflowListItemSafe(item!);
  assert.equal(Object.prototype.hasOwnProperty.call(item, "external_user_id"), false);
  assert.equal(item!.customerProfileImageUrl, "https://cdn.example/ig.jpg");
});
