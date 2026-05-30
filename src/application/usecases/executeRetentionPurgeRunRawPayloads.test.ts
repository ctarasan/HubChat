import test from "node:test";
import assert from "node:assert/strict";
import {
  ExecuteRetentionPurgeRunRawPayloadsUseCase,
  RetentionPurgeExecuteDisabledError
} from "./executeRetentionPurgeRunRawPayloads.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const RUN_ID = "11111111-1111-4111-8111-111111111111";

const baseRecord = {
  id: RUN_ID,
  tenantId: TENANT,
  requestedBy: "admin",
  status: "DRY_RUN_SNAPSHOT" as const,
  policySnapshot: {
    archivedMediaRetentionDays: 90,
    archivedMessageRetentionDays: 365,
    rawPayloadRetentionDays: 90
  },
  summarySnapshot: {
    archivedConversationsEligibleForMediaPurge: 0,
    archivedConversationsEligibleForMessagePurge: 0,
    estimatedMessagesEligible: 0,
    estimatedMediaAttachmentsEligible: 0,
    estimatedRawPayloadRowsEligible: 0,
    generatedAt: "2026-05-30T10:00:00.000Z"
  },
  samplesSnapshot: { mediaPurgeCandidates: [], messagePurgeCandidates: [] },
  notes: null,
  cancelledAt: null,
  cancelledBy: null,
  executionTarget: null,
  executionStartedAt: null,
  executionFinishedAt: null,
  executedBy: null,
  executionResult: null,
  executionError: null,
  createdAt: "2026-05-30T10:00:00.000Z"
};

test("execute disabled throws without mutation", async () => {
  const ops: string[] = [];
  const useCase = new ExecuteRetentionPurgeRunRawPayloadsUseCase({
    isExecuteEnabled: () => false,
    retentionPurgeRunRepository: {
      findById: async () => {
        ops.push("find");
        return { ...baseRecord };
      },
      claimForExecute: async () => {
        ops.push("claim");
        return null;
      },
      markExecuteCompleted: async () => {
        ops.push("complete");
        return { ...baseRecord, status: "COMPLETED" };
      },
      markExecuteFailed: async () => {
        ops.push("fail");
        return { ...baseRecord, status: "FAILED" };
      }
    },
    retentionDryRunRepository: { fetchDryRunInput: async () => ({ archivedConversations: [], messages: [], webhookRawPayloadEligibleCount: 0 }) },
    rawPayloadPurgeRepository: {
      redactWebhookPayloads: async () => {
        ops.push("webhook");
        return 0;
      },
      redactMessageRawPayloads: async () => {
        ops.push("message");
        return 0;
      }
    }
  });

  await assert.rejects(
    useCase.execute({
      auth: { tenantId: TENANT, userId: "a", email: "a@x.com", role: "ADMIN", salesAgentId: null },
      runId: RUN_ID,
      batchLimit: 100
    }),
    RetentionPurgeExecuteDisabledError
  );
  assert.deepEqual(ops, []);
});

test("execute redacts webhooks and archived-conversation messages only", async () => {
  const ops: string[] = [];
  const useCase = new ExecuteRetentionPurgeRunRawPayloadsUseCase({
    isExecuteEnabled: () => true,
    now: () => new Date("2026-05-30T12:00:00.000Z"),
    retentionPurgeRunRepository: {
      findById: async () => ({ ...baseRecord }),
      claimForExecute: async () => {
        ops.push("claim");
        return { ...baseRecord, status: "EXECUTING" };
      },
      markExecuteCompleted: async (input) => {
        ops.push("complete");
        return {
          ...baseRecord,
          status: "COMPLETED",
          executionResult: input.executionResult
        };
      },
      markExecuteFailed: async () => {
        ops.push("fail");
        return { ...baseRecord, status: "FAILED" };
      }
    },
    retentionDryRunRepository: {
      fetchDryRunInput: async () => ({
        archivedConversations: [
          {
            id: "conv-arch",
            leadId: "lead-1",
            channelType: "LINE",
            status: "ARCHIVED",
            resolvedAt: "2025-01-01T00:00:00.000Z",
            closedAt: null,
            updatedAt: "2025-01-01T00:00:00.000Z",
            lastMessageAt: null
          },
          {
            id: "conv-open",
            leadId: "lead-2",
            channelType: "LINE",
            status: "OPEN",
            resolvedAt: null,
            closedAt: null,
            updatedAt: "2026-05-29T00:00:00.000Z",
            lastMessageAt: null
          }
        ],
        messages: [],
        webhookRawPayloadEligibleCount: 1
      })
    },
    rawPayloadPurgeRepository: {
      redactWebhookPayloads: async (input) => {
        ops.push(`webhook:${input.limit}`);
        return 1;
      },
      redactMessageRawPayloads: async (input) => {
        ops.push(`message:${input.archivedConversationIds.join(",")}`);
        assert.equal(input.archivedConversationIds.includes("conv-open"), false);
        assert.equal(input.archivedConversationIds.includes("conv-arch"), true);
        return 1;
      }
    }
  });

  const dto = await useCase.execute({
    auth: { tenantId: TENANT, userId: "a", email: "a@x.com", role: "ADMIN", salesAgentId: null },
    runId: RUN_ID,
    batchLimit: 100
  });

  assert.equal(dto.status, "COMPLETED");
  assert.deepEqual(ops, ["claim", "webhook:100", "message:conv-arch", "complete"]);
  assert.equal(dto.executionResult?.affectedWebhookEvents, 1);
  assert.equal(dto.executionResult?.affectedMessageRawPayloads, 1);
});
