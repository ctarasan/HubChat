import test from "node:test";
import assert from "node:assert/strict";
import { CreateRetentionPurgeRunSnapshotUseCase } from "./createRetentionPurgeRunSnapshot.js";
import { buildRetentionDryRunReport } from "../../lib/retentionDryRun.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

test("CreateRetentionPurgeRunSnapshotUseCase persists dry-run snapshots only", async () => {
  let inserted: Record<string, unknown> | null = null;
  const useCase = new CreateRetentionPurgeRunSnapshotUseCase({
    retentionDryRunRepository: {
      fetchDryRunInput: async () => ({
        archivedConversations: [
          {
            id: "conv-1",
            leadId: "lead-1",
            channelType: "LINE",
            status: "ARCHIVED",
            resolvedAt: "2025-01-01T00:00:00.000Z",
            closedAt: null,
            updatedAt: "2025-01-01T00:00:00.000Z",
            lastMessageAt: null
          }
        ],
        messages: [],
        webhookRawPayloadEligibleCount: 0
      })
    },
    retentionPurgeRunRepository: {
      create: async (input) => {
        inserted = input as Record<string, unknown>;
        return {
          id: "run-1",
          tenantId: input.tenantId,
          requestedBy: input.requestedBy,
          status: "DRY_RUN_SNAPSHOT",
          policySnapshot: input.policySnapshot,
          summarySnapshot: input.summarySnapshot,
          samplesSnapshot: input.samplesSnapshot,
          notes: input.notes,
          createdAt: "2026-05-30T12:00:00.000Z",
          cancelledAt: null,
          cancelledBy: null,
          executionTarget: null,
          executionStartedAt: null,
          executionFinishedAt: null,
          executedBy: null,
          executionResult: null,
          executionError: null
        };
      }
    },
    now: () => new Date("2026-05-30T12:00:00.000Z")
  });

  const dto = await useCase.execute({
    auth: {
      tenantId: TENANT,
      userId: "admin-1",
      email: "a@x.com",
      role: "ADMIN",
      salesAgentId: null
    },
    notes: "audit"
  });

  assert.equal(dto.status, "DRY_RUN_SNAPSHOT");
  assert.equal((inserted as { tenantId: string } | null)?.tenantId, TENANT);
  const expected = buildRetentionDryRunReport({
    tenantId: TENANT,
    now: new Date("2026-05-30T12:00:00.000Z"),
    archivedConversations: [
      {
        id: "conv-1",
        leadId: "lead-1",
        channelType: "LINE",
        status: "ARCHIVED",
        resolvedAt: "2025-01-01T00:00:00.000Z",
        closedAt: null,
        updatedAt: "2025-01-01T00:00:00.000Z",
        lastMessageAt: null
      }
    ],
    messages: [],
    webhookRawPayloadEligibleCount: 0
  });
  const insertedRow = inserted as { summarySnapshot: { generatedAt: string } } | null;
  assert.ok(insertedRow);
  assert.equal(insertedRow.summarySnapshot.generatedAt, expected.generatedAt);
});
