import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createRetentionPurgeRunExecutePostHandler } from "../../../app/api/retention/purge-runs/[id]/execute/route.js";
import { RetentionPurgeExecuteDisabledError } from "../../application/usecases/executeRetentionPurgeRunRawPayloads.js";
import { RETENTION_PURGE_EXECUTE_CONFIRM_TEXT } from "../../lib/retentionPurgeExecute.js";
import { retentionPurgeRunRecordToDto } from "./retentionPurgeRunDtos.js";
import type { RetentionPurgeRunRecord } from "../../infrastructure/adapters/repositories/supabaseRetentionPurgeRunRepository.js";
import type { AppRole } from "./auth.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const RUN_ID = "11111111-1111-4111-8111-111111111111";

function makeReq(body: unknown): NextRequest {
  return new NextRequest(`http://local/api/retention/purge-runs/${RUN_ID}/execute`, {
    method: "POST",
    headers: new Headers({
      Authorization: "Bearer test-token",
      "x-tenant-id": TENANT_ID,
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(body)
  });
}

function completedRecord(): RetentionPurgeRunRecord {
  return {
    id: RUN_ID,
    tenantId: TENANT_ID,
    requestedBy: "admin",
    status: "COMPLETED",
    policySnapshot: {
      archivedMediaRetentionDays: 90,
      archivedMessageRetentionDays: 365,
      rawPayloadRetentionDays: 90
    },
    summarySnapshot: {
      archivedConversationsEligibleForMediaPurge: 0,
      archivedConversationsEligibleForMessagePurge: 1,
      estimatedMessagesEligible: 0,
      estimatedMediaAttachmentsEligible: 0,
      estimatedRawPayloadRowsEligible: 2,
      generatedAt: "2026-05-30T10:00:00.000Z"
    },
    samplesSnapshot: { mediaPurgeCandidates: [], messagePurgeCandidates: [] },
    notes: null,
    createdAt: "2026-05-30T10:00:00.000Z",
    cancelledAt: null,
    cancelledBy: null,
    executionTarget: "RAW_PAYLOADS",
    executionStartedAt: "2026-05-30T11:00:00.000Z",
    executionFinishedAt: "2026-05-30T11:01:00.000Z",
    executedBy: "admin",
    executionResult: {
      target: "RAW_PAYLOADS",
      batchLimit: 100,
      affectedWebhookEvents: 1,
      affectedMessageRawPayloads: 1,
      generatedAt: "2026-05-30T11:01:00.000Z",
      policy: {
        archivedMediaRetentionDays: 90,
        archivedMessageRetentionDays: 365,
        rawPayloadRetentionDays: 90
      }
    },
    executionError: null
  };
}

function authDeps(role: AppRole) {
  return {
    requireAuth: async (_req: NextRequest, allowedRoles: AppRole[]) => {
      const auth = {
        tenantId: TENANT_ID,
        userId: "admin",
        email: "admin@x.com",
        role,
        salesAgentId: null
      };
      if (!allowedRoles.includes(auth.role)) throw new Error("Forbidden");
      return auth;
    }
  };
}

test("POST execute returns 503 when feature flag disabled", async () => {
  const ops: string[] = [];
  const handler = createRetentionPurgeRunExecutePostHandler({
    ...authDeps("ADMIN"),
    executeRetentionPurgeRun: async () => {
      ops.push("execute");
      throw new RetentionPurgeExecuteDisabledError();
    }
  });
  const res = await handler(makeReq({
    target: "RAW_PAYLOADS",
    confirmText: RETENTION_PURGE_EXECUTE_CONFIRM_TEXT
  }), { params: Promise.resolve({ id: RUN_ID }) });
  assert.equal(res.status, 503);
  assert.deepEqual(ops, ["execute"]);
});

test("POST execute ADMIN success when enabled", async () => {
  const handler = createRetentionPurgeRunExecutePostHandler({
    ...authDeps("ADMIN"),
    executeRetentionPurgeRun: async () => retentionPurgeRunRecordToDto(completedRecord())
  });
  const res = await handler(makeReq({
    target: "RAW_PAYLOADS",
    confirmText: RETENTION_PURGE_EXECUTE_CONFIRM_TEXT,
    batchLimit: 100
  }), { params: Promise.resolve({ id: RUN_ID }) });
  assert.equal(res.status, 200);
  const json = (await res.json()) as { data: { status: string; executionResult: { affectedWebhookEvents: number } } };
  assert.equal(json.data.status, "COMPLETED");
  assert.equal(json.data.executionResult.affectedWebhookEvents, 1);
});

test("POST execute MANAGER gets 403", async () => {
  const handler = createRetentionPurgeRunExecutePostHandler({
    ...authDeps("MANAGER"),
    executeRetentionPurgeRun: async () => {
      throw new Error("should not run");
    }
  });
  const res = await handler(makeReq({
    target: "RAW_PAYLOADS",
    confirmText: RETENTION_PURGE_EXECUTE_CONFIRM_TEXT
  }), { params: Promise.resolve({ id: RUN_ID }) });
  assert.equal(res.status, 403);
});

test("POST execute wrong confirmText returns 400", async () => {
  let called = false;
  const handler = createRetentionPurgeRunExecutePostHandler({
    ...authDeps("ADMIN"),
    executeRetentionPurgeRun: async () => {
      called = true;
      return retentionPurgeRunRecordToDto(completedRecord());
    }
  });
  const res = await handler(makeReq({
    target: "RAW_PAYLOADS",
    confirmText: "NOPE"
  }), { params: Promise.resolve({ id: RUN_ID }) });
  assert.equal(res.status, 400);
  assert.equal(called, false);
});

test("POST execute unsupported target returns 400", async () => {
  const handler = createRetentionPurgeRunExecutePostHandler({
    ...authDeps("ADMIN"),
    executeRetentionPurgeRun: async () => retentionPurgeRunRecordToDto(completedRecord())
  });
  const res = await handler(makeReq({
    target: "MEDIA",
    confirmText: RETENTION_PURGE_EXECUTE_CONFIRM_TEXT
  }), { params: Promise.resolve({ id: RUN_ID }) });
  assert.equal(res.status, 400);
});

test("POST execute response excludes secrets and raw payloads", async () => {
  const handler = createRetentionPurgeRunExecutePostHandler({
    ...authDeps("ADMIN"),
    executeRetentionPurgeRun: async () => retentionPurgeRunRecordToDto(completedRecord())
  });
  const text = await (
    await handler(makeReq({
      target: "RAW_PAYLOADS",
      confirmText: RETENTION_PURGE_EXECUTE_CONFIRM_TEXT
    }), { params: Promise.resolve({ id: RUN_ID }) })
  ).text();
  assert.equal(text.includes("access_token"), false);
  assert.equal(text.includes("payload_json"), false);
  assert.equal(text.includes("https://"), false);
});
