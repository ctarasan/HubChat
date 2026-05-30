import test from "node:test";
import assert from "node:assert/strict";
import {
  assertRetentionDryRunReportLean,
  buildRetentionDryRunReport,
  isArchivedEligibleForCutoff,
  messageHasMediaReference,
  resolveConversationArchivedAt
} from "./retentionDryRun.js";
import { DEFAULT_RETENTION_POLICY } from "./retentionPolicy.js";

const NOW = new Date("2026-05-30T12:00:00.000Z");
const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

function archivedConv(
  id: string,
  archivedAtIso: string,
  overrides: Partial<{ status: string; leadId: string | null }> = {}
) {
  return {
    id,
    leadId: overrides.leadId ?? `lead-${id}`,
    channelType: "INSTAGRAM",
    status: overrides.status ?? "ARCHIVED",
    resolvedAt: archivedAtIso,
    closedAt: null,
    updatedAt: archivedAtIso,
    lastMessageAt: "2026-05-01T10:00:00.000Z"
  };
}

test("active conversations are excluded from purge candidates", () => {
  const report = buildRetentionDryRunReport({
    tenantId: TENANT,
    now: NOW,
    archivedConversations: [
      archivedConv("open-old", "2020-01-01T00:00:00.000Z", { status: "OPEN" }),
      archivedConv("arch-recent", "2026-05-20T00:00:00.000Z")
    ],
    messages: []
  });
  assert.equal(report.summary.archivedConversationsEligibleForMediaPurge, 0);
  assert.equal(report.summary.archivedConversationsEligibleForMessagePurge, 0);
});

test("ARCHIVED older than media retention appears in media candidates", () => {
  const report = buildRetentionDryRunReport({
    tenantId: TENANT,
    now: NOW,
    archivedConversations: [archivedConv("arch-media", "2026-01-01T00:00:00.000Z")],
    messages: [
      {
        conversationId: "arch-media",
        messageType: "IMAGE",
        mediaUrl: "https://cdn.example/media.jpg",
        previewUrl: null,
        metadataJson: null,
        rawPayload: {},
        createdAt: "2026-01-15T00:00:00.000Z"
      }
    ]
  });
  assert.equal(report.summary.archivedConversationsEligibleForMediaPurge, 1);
  assert.equal(report.summary.estimatedMediaAttachmentsEligible, 1);
  assert.equal(report.samples.mediaPurgeCandidates[0]?.conversationId, "arch-media");
});

test("ARCHIVED older than message retention appears in message candidates", () => {
  const report = buildRetentionDryRunReport({
    tenantId: TENANT,
    now: NOW,
    archivedConversations: [archivedConv("arch-msg", "2025-01-01T00:00:00.000Z")],
    messages: [
      {
        conversationId: "arch-msg",
        messageType: "TEXT",
        mediaUrl: null,
        previewUrl: null,
        metadataJson: null,
        rawPayload: { provider: "line" },
        createdAt: "2025-02-01T00:00:00.000Z"
      },
      {
        conversationId: "arch-msg",
        messageType: "TEXT",
        mediaUrl: null,
        previewUrl: null,
        metadataJson: null,
        rawPayload: {},
        createdAt: "2025-03-01T00:00:00.000Z"
      }
    ],
    webhookRawPayloadEligibleCount: 3
  });
  assert.equal(report.summary.archivedConversationsEligibleForMessagePurge, 1);
  assert.equal(report.summary.estimatedMessagesEligible, 2);
  assert.equal(report.summary.estimatedRawPayloadRowsEligible, 4);
  assert.equal(report.samples.messagePurgeCandidates[0]?.messageCount, 2);
});

test("recent archived conversations are excluded from media eligibility", () => {
  const report = buildRetentionDryRunReport({
    tenantId: TENANT,
    now: NOW,
    archivedConversations: [archivedConv("arch-recent", "2026-05-20T00:00:00.000Z")],
    messages: []
  });
  assert.equal(report.summary.archivedConversationsEligibleForMediaPurge, 0);
});

test("empty tenant returns zero counts safely", () => {
  const report = buildRetentionDryRunReport({
    tenantId: TENANT,
    now: NOW,
    archivedConversations: [],
    messages: [],
    webhookRawPayloadEligibleCount: 0
  });
  assert.deepEqual(report.summary, {
    archivedConversationsEligibleForMediaPurge: 0,
    archivedConversationsEligibleForMessagePurge: 0,
    estimatedMessagesEligible: 0,
    estimatedMediaAttachmentsEligible: 0,
    estimatedRawPayloadRowsEligible: 0
  });
  assert.deepEqual(report.samples.mediaPurgeCandidates, []);
  assert.deepEqual(report.samples.messagePurgeCandidates, []);
});

test("resolveConversationArchivedAt prefers resolved_at", () => {
  const at = resolveConversationArchivedAt({
    id: "c1",
    leadId: null,
    channelType: "LINE",
    status: "ARCHIVED",
    resolvedAt: "2026-01-01T00:00:00.000Z",
    closedAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    lastMessageAt: null
  });
  assert.equal(at?.toISOString(), "2026-01-01T00:00:00.000Z");
});

test("messageHasMediaReference detects image rows without exposing URLs in report builder", () => {
  assert.equal(
    messageHasMediaReference({
      conversationId: "c1",
      messageType: "IMAGE",
      mediaUrl: "https://secret.example/x",
      previewUrl: null,
      metadataJson: null,
      rawPayload: null,
      createdAt: NOW.toISOString()
    }),
    true
  );
});

test("assertRetentionDryRunReportLean rejects secret-like keys", () => {
  const report = buildRetentionDryRunReport({
    tenantId: TENANT,
    now: NOW,
    archivedConversations: [],
    messages: []
  });
  assert.doesNotThrow(() => assertRetentionDryRunReportLean(report));
  const tampered = JSON.parse(JSON.stringify(report)) as typeof report & { access_token?: string };
  tampered.access_token = "secret";
  assert.throws(() => assertRetentionDryRunReportLean(tampered));
});

test("isArchivedEligibleForCutoff respects cutoff boundary", () => {
  const archivedAt = new Date("2026-01-01T00:00:00.000Z");
  const cutoff = new Date("2026-01-01T12:00:00.000Z");
  assert.equal(isArchivedEligibleForCutoff(archivedAt, cutoff), true);
  assert.equal(
    isArchivedEligibleForCutoff(archivedAt, new Date("2025-12-31T00:00:00.000Z")),
    false
  );
});

test("dry-run policy defaults match retention module", () => {
  const report = buildRetentionDryRunReport({
    tenantId: TENANT,
    now: NOW,
    policy: DEFAULT_RETENTION_POLICY,
    archivedConversations: [],
    messages: []
  });
  assert.equal(report.policy.archivedMediaRetentionDays, 90);
  assert.equal(report.policy.archivedMessageRetentionDays, 365);
  assert.equal(report.policy.rawPayloadRetentionDays, 90);
});
