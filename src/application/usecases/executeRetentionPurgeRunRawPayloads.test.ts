import test from "node:test";
import assert from "node:assert/strict";
import {
  ExecuteRetentionPurgeRunRawPayloadsUseCase,
  RetentionPurgeExecuteDisabledError
} from "./executeRetentionPurgeRunRawPayloads.js";
import type { RetentionPurgeRunRecord } from "../../infrastructure/adapters/repositories/supabaseRetentionPurgeRunRepository.js";

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

test("execute cross-tenant returns not found without redaction or run mutation", async () => {
  const ops: string[] = [];
  const useCase = new ExecuteRetentionPurgeRunRawPayloadsUseCase({
    isExecuteEnabled: () => true,
    retentionPurgeRunRepository: {
      findById: async (tenantId) => {
        ops.push(`find:${tenantId}`);
        return tenantId === TENANT ? { ...baseRecord } : null;
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
    retentionDryRunRepository: {
      fetchDryRunInput: async () => {
        ops.push("dry-run");
        return { archivedConversations: [], messages: [], webhookRawPayloadEligibleCount: 0 };
      }
    },
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
      auth: {
        tenantId: "c293e958-64de-4c71-0f5e-6ae49bbe9760",
        userId: "admin-b",
        email: "b@x.com",
        role: "ADMIN",
        salesAgentId: null
      },
      runId: RUN_ID,
      batchLimit: 100
    }),
    /Retention purge run not found/
  );
  assert.deepEqual(ops, ["find:c293e958-64de-4c71-0f5e-6ae49bbe9760"]);
});

test("execute double execute blocked after first completion", async () => {
  const ops: string[] = [];
  let record: RetentionPurgeRunRecord = { ...baseRecord, status: "DRY_RUN_SNAPSHOT" };
  const useCase = new ExecuteRetentionPurgeRunRawPayloadsUseCase({
    isExecuteEnabled: () => true,
    now: () => new Date("2026-05-30T12:00:00.000Z"),
    retentionPurgeRunRepository: {
      findById: async () => {
        ops.push(`find:${record.status}`);
        return { ...record };
      },
      claimForExecute: async () => {
        ops.push("claim");
        record = { ...record, status: "EXECUTING" };
        return { ...record };
      },
      markExecuteCompleted: async (input) => {
        ops.push("complete");
        record = {
          ...record,
          status: "COMPLETED",
          executionResult: input.executionResult
        };
        return { ...record };
      },
      markExecuteFailed: async () => {
        ops.push("fail");
        record = { ...record, status: "FAILED" };
        return { ...record };
      }
    },
    retentionDryRunRepository: {
      fetchDryRunInput: async () => ({
        archivedConversations: [],
        messages: [],
        webhookRawPayloadEligibleCount: 0
      })
    },
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

  const auth = {
    tenantId: TENANT,
    userId: "a",
    email: "a@x.com",
    role: "ADMIN" as const,
    salesAgentId: null
  };

  const first = await useCase.execute({ auth, runId: RUN_ID, batchLimit: 100 });
  assert.equal(first.status, "COMPLETED");

  await assert.rejects(
    useCase.execute({ auth, runId: RUN_ID, batchLimit: 100 }),
    /Retention purge run is not eligible for execute/
  );

  assert.deepEqual(ops, [
    "find:DRY_RUN_SNAPSHOT",
    "claim",
    "webhook",
    "message",
    "complete",
    "find:COMPLETED"
  ]);
  assert.equal(record.status, "COMPLETED");
  assert.equal(record.executionResult?.target, "RAW_PAYLOADS");
});

test("execute path invokes only raw payload redaction methods", async () => {
  const ops: string[] = [];
  const forbidden = ["delete", "remove", "storage", "provider", "truncate"];
  const track = (name: string) => {
    ops.push(name);
    if (forbidden.some((token) => name.toLowerCase().includes(token))) {
      throw new Error(`forbidden operation: ${name}`);
    }
  };

  const useCase = new ExecuteRetentionPurgeRunRawPayloadsUseCase({
    isExecuteEnabled: () => true,
    now: () => new Date("2026-05-30T12:00:00.000Z"),
    retentionPurgeRunRepository: {
      findById: async () => {
        track("findById");
        return { ...baseRecord };
      },
      claimForExecute: async () => {
        track("claimForExecute");
        return { ...baseRecord, status: "EXECUTING" };
      },
      markExecuteCompleted: async (input) => {
        track("markExecuteCompleted");
        return {
          ...baseRecord,
          status: "COMPLETED",
          executionResult: input.executionResult
        };
      },
      markExecuteFailed: async () => {
        track("markExecuteFailed");
        return { ...baseRecord, status: "FAILED" };
      }
    },
    retentionDryRunRepository: {
      fetchDryRunInput: async () => {
        track("fetchDryRunInput");
        return { archivedConversations: [], messages: [], webhookRawPayloadEligibleCount: 0 };
      }
    },
    rawPayloadPurgeRepository: {
      redactWebhookPayloads: async () => {
        track("redactWebhookPayloads");
        return 0;
      },
      redactMessageRawPayloads: async () => {
        track("redactMessageRawPayloads");
        return 0;
      }
    }
  });

  await useCase.execute({
    auth: { tenantId: TENANT, userId: "a", email: "a@x.com", role: "ADMIN", salesAgentId: null },
    runId: RUN_ID,
    batchLimit: 100
  });

  assert.deepEqual(ops, [
    "findById",
    "claimForExecute",
    "fetchDryRunInput",
    "fetchDryRunInput",
    "redactWebhookPayloads",
    "redactMessageRawPayloads",
    "markExecuteCompleted"
  ]);
  assert.equal(
    ops.some((op) => forbidden.some((token) => op.toLowerCase().includes(token))),
    false
  );
});
