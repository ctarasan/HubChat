import test from "node:test";
import assert from "node:assert/strict";
import {
  mapRetentionDryRunFetchError,
  parseRetentionDryRunResponse,
  retentionSampleColumnKeys,
  sanitizeRetentionDryRunSampleRow
} from "./retentionDryRunModel.js";

const validReport = {
  policy: {
    archivedMediaRetentionDays: 90,
    archivedMessageRetentionDays: 365,
    rawPayloadRetentionDays: 30
  },
  generatedAt: "2026-05-29T12:00:00.000Z",
  summary: {
    mediaPurgeCandidates: 3,
    messageHistoryPurgeCandidates: 5,
    estimatedMessagesEligible: 1200,
    estimatedMediaAttachmentsEligible: 45,
    rawPayloadCandidates: 2
  },
  samples: {
    mediaPurgeCandidates: [
      {
        leadId: "lead-1",
        conversationId: "conv-1",
        channel: "LINE",
        archivedAt: "2025-01-01T00:00:00.000Z",
        messageContent: "must not appear",
        mediaUrl: "https://cdn.example/secret.jpg",
        access_token: "tok"
      }
    ],
    messagePurgeCandidates: [
      {
        leadId: "lead-2",
        conversationId: "conv-2",
        messageCount: 42,
        lastMessagePreview: "hidden"
      }
    ]
  }
};

test("parseRetentionDryRunResponse accepts valid payload and sanitizes samples", () => {
  const parsed = parseRetentionDryRunResponse(validReport);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.report.policy.archivedMediaRetentionDays, 90);
  assert.equal(parsed.report.summary.mediaPurgeCandidates, 3);
  assert.equal(parsed.report.summary.estimatedMessagesEligible, 1200);
  assert.equal(parsed.report.samples.mediaPurgeCandidates.length, 1);
  assert.equal(parsed.report.samples.mediaPurgeCandidates[0]?.leadId, "lead-1");
  assert.equal(parsed.report.samples.mediaPurgeCandidates[0]?.messageContent, undefined);
  assert.equal(parsed.report.samples.mediaPurgeCandidates[0]?.mediaUrl, undefined);
  assert.equal(parsed.report.samples.messagePurgeCandidates[0]?.messageCount, 42);
  assert.equal(parsed.report.samples.messagePurgeCandidates[0]?.lastMessagePreview, undefined);
});

test("parseRetentionDryRunResponse accepts data wrapper", () => {
  const parsed = parseRetentionDryRunResponse({ data: validReport });
  assert.equal(parsed.ok, true);
});

test("parseRetentionDryRunResponse rejects invalid policy", () => {
  const parsed = parseRetentionDryRunResponse({ ...validReport, policy: {} });
  assert.equal(parsed.ok, false);
});

test("sanitizeRetentionDryRunSampleRow drops unsafe keys and URL-like values", () => {
  const row = sanitizeRetentionDryRunSampleRow({
    leadId: "l1",
    profileImageUrl: "https://cdn.example/a.jpg",
    payload_json: "{}",
    note: "ok"
  });
  assert.equal(row?.leadId, "l1");
  assert.equal(row?.profileImageUrl, undefined);
  assert.equal(row?.payload_json, undefined);
  assert.equal(row?.note, undefined);
});

test("mapRetentionDryRunFetchError maps 404 to unavailable copy", () => {
  assert.match(mapRetentionDryRunFetchError(404, null), /not available yet/i);
});

test("retentionSampleColumnKeys orders known safe keys only", () => {
  const keys = retentionSampleColumnKeys([
    { conversationId: "c1", leadId: "l1", channel: "LINE" }
  ]);
  assert.deepEqual(keys, ["leadId", "conversationId", "channel"]);
});
