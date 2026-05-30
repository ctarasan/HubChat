import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createRetentionPurgeRunExecutePostHandler } from "../../../app/api/retention/purge-runs/[id]/execute/route.js";
import { RetentionPurgeExecuteDisabledError } from "../../application/usecases/executeRetentionPurgeRunRawPayloads.js";
import { RETENTION_PURGE_EXECUTE_CONFIRM_TEXT } from "../../lib/retentionPurgeExecute.js";
import { retentionPurgeRunRecordToDto } from "./retentionPurgeRunDtos.js";
import type { RetentionPurgeRunRecord } from "../../infrastructure/adapters/repositories/supabaseRetentionPurgeRunRepository.js";
import type { AppRole } from "./auth.js";

const TENANT_A = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const TENANT_B = "c293e958-64de-4c71-0f5e-6ae49bbe9760";
const TENANT_ID = TENANT_A;
const RUN_ID = "11111111-1111-4111-8111-111111111111";

const VALID_EXECUTE_BODY = {
  target: "RAW_PAYLOADS" as const,
  confirmText: RETENTION_PURGE_EXECUTE_CONFIRM_TEXT
};

function makeReq(body: unknown, tenantId = TENANT_ID): NextRequest {
  return new NextRequest(`http://local/api/retention/purge-runs/${RUN_ID}/execute`, {
    method: "POST",
    headers: new Headers({
      Authorization: "Bearer test-token",
      "x-tenant-id": tenantId,
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

function authDeps(role: AppRole, tenantId = TENANT_ID) {
  return {
    requireAuth: async (_req: NextRequest, allowedRoles: AppRole[]) => {
      const auth = {
        tenantId,
        userId: role === "SALES" ? "sales-1" : "admin",
        email: `${role.toLowerCase()}@x.com`,
        role,
        salesAgentId: role === "SALES" ? "agent-1" : null
      };
      if (!allowedRoles.includes(auth.role)) throw new Error("Forbidden");
      return auth;
    }
  };
}

function handlerWithExecuteSpy(
  role: AppRole,
  tenantId: string,
  onExecute: (input: { tenantId: string; runId: string }) => Promise<unknown>
) {
  return createRetentionPurgeRunExecutePostHandler({
    ...authDeps(role, tenantId),
    executeRetentionPurgeRun: async (input) =>
      onExecute({ tenantId: input.auth.tenantId, runId: input.runId })
  });
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
  let called = false;
  const handler = createRetentionPurgeRunExecutePostHandler({
    ...authDeps("MANAGER"),
    executeRetentionPurgeRun: async () => {
      called = true;
      throw new Error("should not run");
    }
  });
  const res = await handler(makeReq(VALID_EXECUTE_BODY), { params: Promise.resolve({ id: RUN_ID }) });
  assert.equal(res.status, 403);
  assert.equal(called, false);
});

test("POST execute SALES gets 403 without calling use case", async () => {
  let called = false;
  const handler = createRetentionPurgeRunExecutePostHandler({
    ...authDeps("SALES"),
    executeRetentionPurgeRun: async () => {
      called = true;
      throw new Error("should not run");
    }
  });
  const res = await handler(makeReq(VALID_EXECUTE_BODY), { params: Promise.resolve({ id: RUN_ID }) });
  assert.equal(res.status, 403);
  assert.equal(called, false);
});

test("POST execute cross-tenant ADMIN returns 404 without mutation", async () => {
  const ops: string[] = [];
  const handler = handlerWithExecuteSpy("ADMIN", TENANT_B, async (input) => {
    ops.push(`execute:${input.tenantId}:${input.runId}`);
    throw new Error("Retention purge run not found");
  });
  const res = await handler(makeReq(VALID_EXECUTE_BODY, TENANT_B), { params: Promise.resolve({ id: RUN_ID }) });
  assert.equal(res.status, 404);
  assert.deepEqual(ops, [`execute:${TENANT_B}:${RUN_ID}`]);
  const json = (await res.json()) as { error: string };
  assert.equal(json.error, "Retention purge run not found");
});

test("POST execute double execute returns 400 not eligible", async () => {
  const handler = createRetentionPurgeRunExecutePostHandler({
    ...authDeps("ADMIN"),
    executeRetentionPurgeRun: async () => {
      throw new Error("Retention purge run is not eligible for execute");
    }
  });
  const res = await handler(makeReq(VALID_EXECUTE_BODY), { params: Promise.resolve({ id: RUN_ID }) });
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error: string };
  assert.match(json.error, /not eligible for execute/);
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
  let called = false;
  const handler = createRetentionPurgeRunExecutePostHandler({
    ...authDeps("ADMIN"),
    executeRetentionPurgeRun: async () => {
      called = true;
      return retentionPurgeRunRecordToDto(completedRecord());
    }
  });
  const res = await handler(makeReq({
    target: "MEDIA",
    confirmText: RETENTION_PURGE_EXECUTE_CONFIRM_TEXT
  }), { params: Promise.resolve({ id: RUN_ID }) });
  assert.equal(res.status, 400);
  assert.equal(called, false);
});

const CONFIRM_TEXT_EDGE_CASES = [
  ["trailing space", `${RETENTION_PURGE_EXECUTE_CONFIRM_TEXT} `],
  ["leading space", ` ${RETENTION_PURGE_EXECUTE_CONFIRM_TEXT}`],
  ["lowercase", "execute retention purge"],
  ["partial phrase", "EXECUTE RETENTION"]
] as const;

for (const [label, confirmText] of CONFIRM_TEXT_EDGE_CASES) {
  test(`POST execute reject confirmText ${label} with 400 and no mutation`, async () => {
    let called = false;
    const handler = createRetentionPurgeRunExecutePostHandler({
      ...authDeps("ADMIN"),
      executeRetentionPurgeRun: async () => {
        called = true;
        return retentionPurgeRunRecordToDto(completedRecord());
      }
    });
    const res = await handler(
      makeReq({ target: "RAW_PAYLOADS", confirmText }),
      { params: Promise.resolve({ id: RUN_ID }) }
    );
    assert.equal(res.status, 400, label);
    assert.equal(called, false, label);
  });
}

test("POST execute response excludes secrets and raw payloads", async () => {
  const handler = createRetentionPurgeRunExecutePostHandler({
    ...authDeps("ADMIN"),
    executeRetentionPurgeRun: async () => retentionPurgeRunRecordToDto(completedRecord())
  });
  const text = await (
    await handler(makeReq(VALID_EXECUTE_BODY), { params: Promise.resolve({ id: RUN_ID }) })
  ).text();
  const lower = text.toLowerCase();
  const blocked = [
    "access_token",
    "payload_json",
    '"raw_payload"',
    "secret_json",
    "bearer",
    "jwt",
    "signed_url",
    "signedurl",
    "https://",
    "http://",
    '"content":',
    '"body":',
    '"text":',
    '"media_url":',
    '"preview_url":'
  ];
  for (const token of blocked) {
    assert.equal(lower.includes(token), false, `response must not include ${token}`);
  }
  assert.equal(lower.includes("raw_payloads"), true, "safe target enum may appear");
});
