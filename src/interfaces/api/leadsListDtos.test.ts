import test from "node:test";
import assert from "node:assert/strict";
import {
  assertLeadsListItemDtoLean,
  LEADS_LIST_ITEM_DTO_KEYS,
  toLeadsListItemDto
} from "./leadsListDtos.js";

test("toLeadsListItemDto maps lean leads list fields", () => {
  const now = new Date("2026-05-29T12:00:00.000Z");
  const dto = toLeadsListItemDto(
    {
      id: "conv-1",
      lead_id: "lead-1",
      channel_type: "INSTAGRAM",
      status: "OPEN",
      participant_display_name: "Customer",
      last_message_at: "2026-05-29T10:00:00.000Z",
      last_message_preview: "hello",
      follow_up_at: "2026-05-28T10:00:00.000Z",
      sla_due_at: "2026-05-28T09:00:00.000Z",
      assigned_agent_id: "agent-1",
      leads: { status: "QUALIFIED", created_at: "2026-05-29T09:00:00.000Z" },
      sales_agents: { id: "agent-1", name: "Sales Name" }
    },
    now
  );
  assert.equal(dto.leadId, "lead-1");
  assert.equal(dto.conversationId, "conv-1");
  assert.equal(dto.leadStatus, "QUALIFIED");
  assert.equal(dto.ownerName, "Sales Name");
  assert.equal(dto.isFollowUpOverdue, true);
  assert.equal(dto.isSlaOverdue, true);
  assert.deepEqual(Object.keys(dto).sort(), [...LEADS_LIST_ITEM_DTO_KEYS].sort());
  assert.doesNotThrow(() => assertLeadsListItemDtoLean(dto as unknown as Record<string, unknown>));
});

test("toLeadsListItemDto returns displayName when participant name exists", () => {
  const dto = toLeadsListItemDto({
    id: "conv-1",
    lead_id: "lead-1",
    channel_type: "LINE",
    status: "OPEN",
    participant_display_name: "Named Customer",
    last_message_at: "2026-05-29T10:00:00.000Z",
    leads: { status: "NEW", created_at: "2026-05-29T09:00:00.000Z" }
  });
  assert.equal(dto.displayName, "Named Customer");
});

test("toLeadsListItemDto falls back to provider external user id like Inbox", () => {
  const dto = toLeadsListItemDto({
    id: "conv-2",
    lead_id: "lead-2",
    channel_type: "INSTAGRAM",
    status: "OPEN",
    provider_external_user_id: "17409356",
    last_message_at: "2026-05-29T10:00:00.000Z",
    leads: { status: "QUALIFIED", external_user_id: "111", created_at: "2026-05-29T09:00:00.000Z" }
  });
  assert.equal(dto.displayName, "17409356");
});

test("toLeadsListItemDto falls back to lead external user id when provider id missing", () => {
  const dto = toLeadsListItemDto({
    id: "conv-3",
    lead_id: "lead-3",
    channel_type: "LINE",
    status: "OPEN",
    last_message_at: "2026-05-29T10:00:00.000Z",
    leads: { status: "NEW", external_user_id: "111", created_at: "2026-05-29T09:00:00.000Z" }
  });
  assert.equal(dto.displayName, "111");
});

test("toLeadsListItemDto does not expose secrets in mapped fields", () => {
  const dto = toLeadsListItemDto({
    id: "conv-4",
    lead_id: "lead-4",
    channel_type: "LINE",
    status: "OPEN",
    last_message_at: "2026-05-29T10:00:00.000Z",
    leads: { status: "NEW", created_at: "2026-05-29T09:00:00.000Z" },
    secret_json: "must-not-appear",
    access_token: "must-not-appear"
  });
  const serialized = JSON.stringify(dto);
  assert.equal(serialized.includes("must-not-appear"), false);
  assert.equal(serialized.includes("access_token"), false);
});
