import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  createRetentionPurgeRunCancelPostHandler
} from "../../../app/api/retention/purge-runs/[id]/cancel/route.js";
import {
  createRetentionPurgeRunsGetHandler,
  createRetentionPurgeRunsPostHandler
} from "../../../app/api/retention/purge-runs/route.js";
import { buildRetentionDryRunReport } from "../../lib/retentionDryRun.js";
import { buildRetentionPurgeRunSnapshots } from "../../lib/retentionPurgeRunSnapshots.js";
import {
  RETENTION_PURGE_RUN_LIST_ITEM_DTO_KEYS,
  toRetentionPurgeRunListItemDto
} from "./retentionPurgeRunDtos.js";
import type { AppRole } from "./auth.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const OTHER_TENANT = "ca92d847-53cd-4b60-9e4d-5fd3f8ad8650";
const RUN_ID = "11111111-1111-4111-8111-111111111111";

function makeReq(path: string, init?: RequestInit): NextRequest {
  return new NextRequest(`http://local${path}`, {
    headers: new Headers({
      Authorization: "Bearer test-token",
      "x-tenant-id": TENANT_ID,
      ...(init?.headers ?? {})
    }),
    ...init
  });
}

function sampleDryRunReport(tenantId: string = TENANT_ID) {
  return buildRetentionDryRunReport({
    tenantId,
    now: new Date("2026-05-30T12:00:00.000Z"),
    archivedConversations: [
      {
        id: "conv-arch",
        leadId: "lead-1",
        channelType: "LINE",
        status: "ARCHIVED",
        resolvedAt: "2025-01-01T00:00:00.000Z",
        closedAt: null,
        updatedAt: "2025-01-01T00:00:00.000Z",
        lastMessageAt: "2025-06-01T00:00:00.000Z"
      }
    ],
    messages: []
  });
}

function sampleRunRow(tenantId: string, overrides: Record<string, unknown> = {}) {
  const report = sampleDryRunReport(tenantId);
  const snapshots = buildRetentionPurgeRunSnapshots(report);
  return {
    id: RUN_ID,
    tenant_id: tenantId,
    requested_by: "admin-user",
    status: "DRY_RUN_SNAPSHOT",
    policy_snapshot: snapshots.policySnapshot,
    summary_snapshot: snapshots.summarySnapshot,
    samples_snapshot: snapshots.samplesSnapshot,
    notes: null,
    created_at: "2026-05-30T10:00:00.000Z",
    cancelled_at: null,
    cancelled_by: null,
    ...overrides
  };
}

function authHandlerDeps(role: AppRole) {
  return {
    requireAuth: async (_req: NextRequest, allowedRoles: AppRole[]) => {
      const auth = {
        tenantId: TENANT_ID,
        userId: "admin-user",
        email: "admin@x.com",
        role,
        salesAgentId: null
      };
      if (!allowedRoles.includes(auth.role)) throw new Error("Forbidden");
      return auth;
    }
  };
}

test("POST /api/retention/purge-runs ADMIN creates DRY_RUN_SNAPSHOT", async () => {
  let createInput: Record<string, unknown> | null = null;
  const handler = createRetentionPurgeRunsPostHandler({
    ...authHandlerDeps("ADMIN"),
    createRetentionPurgeRunSnapshot: async ({ auth, notes }) => {
      const report = sampleDryRunReport(auth.tenantId);
      const snapshots = buildRetentionPurgeRunSnapshots(report);
      createInput = { tenantId: auth.tenantId, notes, snapshots };
      return toRetentionPurgeRunListItemDto(sampleRunRow(auth.tenantId, { notes: notes ?? null }));
    }
  });
  const res = await handler(
    makeReq("/api/retention/purge-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Q2 archive review" })
    })
  );
  assert.equal(res.status, 201);
  const json = (await res.json()) as { data: Record<string, unknown> };
  assert.equal(json.data.status, "DRY_RUN_SNAPSHOT");
  assert.equal(json.data.notes, "Q2 archive review");
  assert.equal((createInput as { tenantId: string } | null)?.tenantId, TENANT_ID);
  assert.deepEqual(Object.keys(json.data).sort(), [...RETENTION_PURGE_RUN_LIST_ITEM_DTO_KEYS].sort());
});

test("POST /api/retention/purge-runs MANAGER and SALES get 403", async () => {
  for (const role of ["MANAGER", "SALES"] as const) {
    const handler = createRetentionPurgeRunsPostHandler({
      ...authHandlerDeps(role),
      createRetentionPurgeRunSnapshot: async () => {
        throw new Error("should not run");
      }
    });
    const res = await handler(
      makeReq("/api/retention/purge-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      })
    );
    assert.equal(res.status, 403, role);
  }
});

test("GET /api/retention/purge-runs returns tenant-scoped runs only", async () => {
  const handler = createRetentionPurgeRunsGetHandler({
    ...authHandlerDeps("ADMIN"),
    listRetentionPurgeRuns: async ({ auth }) => {
      if (auth.tenantId !== TENANT_ID) return [];
      return [
        toRetentionPurgeRunListItemDto(sampleRunRow(TENANT_ID)),
        toRetentionPurgeRunListItemDto(
          sampleRunRow(OTHER_TENANT, { id: "other-run", tenant_id: OTHER_TENANT })
        )
      ].filter((row) => row.id !== "other-run");
    }
  });
  const res = await handler(makeReq("/api/retention/purge-runs"));
  assert.equal(res.status, 200);
  const json = (await res.json()) as { data: { id: string }[] };
  assert.equal(json.data.length, 1);
  assert.equal(json.data[0]?.id, RUN_ID);
});

test("GET /api/retention/purge-runs empty tenant returns []", async () => {
  const handler = createRetentionPurgeRunsGetHandler({
    ...authHandlerDeps("ADMIN"),
    listRetentionPurgeRuns: async () => []
  });
  const res = await handler(makeReq("/api/retention/purge-runs"));
  assert.equal(res.status, 200);
  const json = (await res.json()) as { data: unknown[] };
  assert.deepEqual(json.data, []);
});

test("GET /api/retention/purge-runs response excludes secrets and message content", async () => {
  const handler = createRetentionPurgeRunsGetHandler({
    ...authHandlerDeps("ADMIN"),
    listRetentionPurgeRuns: async () => [toRetentionPurgeRunListItemDto(sampleRunRow(TENANT_ID))]
  });
  const text = await (await handler(makeReq("/api/retention/purge-runs"))).text();
  assert.equal(text.includes("access_token"), false);
  assert.equal(text.includes("secret_json"), false);
  assert.equal(text.includes("Bearer"), false);
  assert.equal(text.includes('"content"'), false);
  assert.equal(text.includes("https://"), false);
});

test("POST /api/retention/purge-runs does not invoke destructive operations", async () => {
  const ops: string[] = [];
  const handler = createRetentionPurgeRunsPostHandler({
    ...authHandlerDeps("ADMIN"),
    createRetentionPurgeRunSnapshot: async ({ auth }) => {
      ops.push("create");
      return toRetentionPurgeRunListItemDto(sampleRunRow(auth.tenantId));
    }
  });
  await handler(
    makeReq("/api/retention/purge-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    })
  );
  assert.deepEqual(ops, ["create"]);
  assert.equal(ops.includes("delete"), false);
  assert.equal(ops.includes("remove"), false);
});

test("POST /api/retention/purge-runs/[id]/cancel sets CANCELLED for snapshot run", async () => {
  const handler = createRetentionPurgeRunCancelPostHandler({
    ...authHandlerDeps("ADMIN"),
    cancelRetentionPurgeRun: async () =>
      toRetentionPurgeRunListItemDto(
        sampleRunRow(TENANT_ID, {
          status: "CANCELLED",
          cancelled_at: "2026-05-30T11:00:00.000Z",
          cancelled_by: "admin-user"
        })
      )
  });
  const res = await handler(makeReq(`/api/retention/purge-runs/${RUN_ID}/cancel`, { method: "POST" }), {
    params: Promise.resolve({ id: RUN_ID })
  });
  assert.equal(res.status, 200);
  const json = (await res.json()) as { data: { status: string } };
  assert.equal(json.data.status, "CANCELLED");
});

test("created run stores policy and summary snapshots", async () => {
  const handler = createRetentionPurgeRunsPostHandler({
    ...authHandlerDeps("ADMIN"),
    createRetentionPurgeRunSnapshot: async ({ auth }) => {
      const report = sampleDryRunReport(auth.tenantId);
      const snapshots = buildRetentionPurgeRunSnapshots(report);
      return toRetentionPurgeRunListItemDto(
        sampleRunRow(auth.tenantId, {
          policy_snapshot: snapshots.policySnapshot,
          summary_snapshot: snapshots.summarySnapshot
        })
      );
    }
  });
  const res = await handler(
    makeReq("/api/retention/purge-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    })
  );
  const json = (await res.json()) as {
    data: {
      policySnapshot: { archivedMediaRetentionDays: number };
      summarySnapshot: { estimatedMessagesEligible: number; generatedAt: string };
    };
  };
  assert.equal(json.data.policySnapshot.archivedMediaRetentionDays, 90);
  assert.equal(json.data.summarySnapshot.estimatedMessagesEligible, 0);
  assert.ok(json.data.summarySnapshot.generatedAt);
});
