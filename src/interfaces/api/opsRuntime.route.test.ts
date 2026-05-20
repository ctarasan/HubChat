import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createOpsRuntimeGetHandler } from "../../../app/api/ops/runtime/route.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

function makeReq(): NextRequest {
  return new NextRequest("http://local/api/ops/runtime", {
    headers: new Headers({
      Authorization: "Bearer test-token",
      "x-tenant-id": TENANT_ID
    })
  });
}

test("GET /api/ops/runtime returns queue/outbox snapshot for ADMIN", async () => {
  const handler = createOpsRuntimeGetHandler({
    requireAuth: async () => ({ tenantId: TENANT_ID, role: "ADMIN" as const, userId: "u1", email: "a@b.com", salesAgentId: null }),
    apiBootstrap: () =>
      ({
        supabase: {
          rpc: async (name: string) => {
            if (name === "get_queue_runtime_stats") {
              return { data: [{ depth: 5, lag_ms: 1200 }], error: null };
            }
            if (name === "get_outbox_runtime_stats") {
              return { data: [{ depth: 2, lag_ms: 400 }], error: null };
            }
            return { data: null, error: new Error(`unexpected rpc ${name}`) };
          }
        }
      }) as any
  });

  const res = await handler(makeReq());
  assert.equal(res.status, 200);
  const json = (await res.json()) as { data: { queue: { depth: number }; outbox: { depth: number }; health: { level: string } } };
  assert.equal(json.data.queue.depth, 5);
  assert.equal(json.data.outbox.depth, 2);
  assert.equal(json.data.health.level, "ok");
});

test("GET /api/ops/runtime returns 403 for non-ADMIN", async () => {
  const handler = createOpsRuntimeGetHandler({
    requireAuth: async () => {
      throw new Error("Forbidden");
    },
    apiBootstrap: () => ({ supabase: { rpc: async () => ({ data: [], error: null }) } }) as any
  });
  const res = await handler(makeReq());
  assert.equal(res.status, 403);
});

test("GET /api/ops/runtime returns 401 when unauthorized", async () => {
  const handler = createOpsRuntimeGetHandler({
    requireAuth: async () => {
      throw new Error("Unauthorized");
    },
    apiBootstrap: () => ({ supabase: { rpc: async () => ({ data: [], error: null }) } }) as any
  });
  const res = await handler(makeReq());
  assert.equal(res.status, 401);
});
