import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMarketingEventsListPath,
  formatSafeMarketingMetadataSummary,
  mapMarketingEventToTimelineItem,
  mapMarketingEventsHttpError,
  mergeMarketingTimelineItems,
  normalizeMarketingEventApiRecord,
  parseMarketingEventsListResponse,
  readConversationLeadId
} from "./marketingTimelineApi.js";
import { timelineItemHasForbiddenPayloadFields } from "./marketingTimelineModel.js";

const SAMPLE_API_EVENT = {
  id: "ev-1",
  tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
  leadId: "6b241101-e2bb-4955-9933-fd6a836e82fb",
  conversationId: "3b241101-e2bb-4955-9933-fd6a836e82f8",
  channel: "LINE",
  eventType: "LEAD_STATUS_CHANGED",
  occurredAt: "2026-05-19T10:00:00.000Z",
  actorType: "AGENT",
  actorUserId: null,
  metadata: { from: "NEW", to: "CONTACTED" },
  createdAt: "2026-05-19T10:00:01.000Z"
};

test("buildMarketingEventsListPath scopes by conversationId and optional leadId", () => {
  const path = buildMarketingEventsListPath({
    conversationId: "3b241101-e2bb-4955-9933-fd6a836e82f8",
    leadId: "6b241101-e2bb-4955-9933-fd6a836e82fb",
    limit: 15
  });
  assert.match(path, /^\/api\/marketing-events\?/);
  assert.match(path, /conversationId=3b241101/);
  assert.match(path, /leadId=6b241101/);
  assert.match(path, /limit=15/);
  assert.equal(path.includes("cursor="), false);
});

test("normalizeMarketingEventApiRecord accepts snake_case rows", () => {
  const row = normalizeMarketingEventApiRecord({
    id: "ev-2",
    event_type: "AGENT_MESSAGE_SENT",
    occurred_at: "2026-05-20T10:00:00.000Z",
    actor_type: "AGENT",
    channel: "LINE",
    metadata_json: { type: "text" }
  });
  assert.equal(row?.eventType, "AGENT_MESSAGE_SENT");
  assert.equal(row?.metadata?.type, "text");
});

test("parseMarketingEventsListResponse reads data and pageInfo", () => {
  const parsed = parseMarketingEventsListResponse({
    data: [SAMPLE_API_EVENT],
    pageInfo: { nextCursor: "cursor-2", hasNextPage: true }
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.pageInfo.nextCursor, "cursor-2");
  assert.equal(parsed.pageInfo.hasNextPage, true);
});

test("mapMarketingEventToTimelineItem maps DTO to view model without sensitive fields", () => {
  const normalized = normalizeMarketingEventApiRecord(SAMPLE_API_EVENT);
  assert.ok(normalized);
  const vm = mapMarketingEventToTimelineItem(normalized);
  assert.equal(vm.group, "lead");
  assert.equal(vm.title, "Lead status changed");
  assert.match(vm.metadataSummary ?? "", /NEW/);
  assert.equal(timelineItemHasForbiddenPayloadFields(vm), false);
  assert.equal(JSON.stringify(vm).includes("http"), false);
});

test("message events omit body and skip URL metadata", () => {
  const vm = mapMarketingEventToTimelineItem({
    id: "ev-msg",
    eventType: "CUSTOMER_MESSAGE_RECEIVED",
    occurredAt: "2026-05-20T10:00:00.000Z",
    actorType: "CUSTOMER",
    channel: "LINE",
    metadata: {
      messageBody: "secret",
      mediaUrl: "https://example.com/x.jpg",
      type: "text"
    }
  });
  assert.match(vm.description ?? "", /content not shown/i);
  assert.equal(vm.metadataSummary, "type: text");
});

test("mapMarketingEventsHttpError maps 403 and 404", () => {
  assert.match(mapMarketingEventsHttpError(403, {}), /permission/i);
  assert.match(mapMarketingEventsHttpError(404, {}), /not found/i);
});

test("formatSafeMarketingMetadataSummary ignores URLs and long bodies", () => {
  const summary = formatSafeMarketingMetadataSummary({
    from: "OPEN",
    previewUrl: "https://cdn.example.com/x.png",
    note: "ok"
  });
  assert.equal(summary?.includes("https://"), false);
  assert.match(summary ?? "", /from: OPEN/);
  assert.match(summary ?? "", /note: ok/);
});

test("readConversationLeadId reads lead_id from conversation row", () => {
  assert.equal(readConversationLeadId({ lead_id: "6b241101-e2bb-4955-9933-fd6a836e82fb" }), "6b241101-e2bb-4955-9933-fd6a836e82fb");
  assert.equal(readConversationLeadId({ leadId: "not-uuid" }), null);
});

test("mergeMarketingTimelineItems dedupes by id", () => {
  const a = mapMarketingEventToTimelineItem(normalizeMarketingEventApiRecord(SAMPLE_API_EVENT)!);
  const merged = mergeMarketingTimelineItems([a], [a]);
  assert.equal(merged.length, 1);
});
