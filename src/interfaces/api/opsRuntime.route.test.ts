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

function makeCountClient(counts: Record<string, number>) {
  return {
    from(table: string) {
      return {
        select(_cols: string, _opts: { count: "exact"; head: true }) {
          const filters: string[] = [`table=${table}`];
          const query = {
            eq(column: string, value: string) {
              filters.push(`${column}=${value}`);
              return query;
            },
            lte(column: string, value: string) {
              filters.push(`${column}<=${value}`);
              return query;
            },
            lt(column: string, value: string) {
              filters.push(`${column}<${value}`);
              return query;
            },
            async then(resolve: (v: { count: number; error: null }) => void) {
              const key = filters.join("|");
              resolve({ count: counts[key] ?? 0, error: null });
            }
          };
          return query;
        }
      };
    }
  };
}

function makeAdminHandler(counts: Record<string, number> = {}) {
  return createOpsRuntimeGetHandler({
    requireAuth: async () => ({
      tenantId: TENANT_ID,
      role: "ADMIN" as const,
      userId: "u1",
      email: "a@b.com",
      salesAgentId: null
    }),
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
          },
          ...makeCountClient(counts)
        }
      }) as any
  });
}

test("GET /api/ops/runtime returns queue/outbox snapshot for ADMIN", async () => {
  const res = await makeAdminHandler()(makeReq());
  assert.equal(res.status, 200);
  const json = (await res.json()) as {
    data: {
      queue: { depth: number };
      outbox: { depth: number };
      health: { level: string };
      queueDetail: { inbound: { pending: number } };
      outboxDetail: { deadLetter: number };
      processingStaleAfterSeconds: { queueSeconds: number };
    };
  };
  assert.equal(json.data.queue.depth, 5);
  assert.equal(json.data.outbox.depth, 2);
  assert.equal(json.data.health.level, "ok");
  assert.ok(json.data.queueDetail.inbound);
  assert.ok(json.data.outboxDetail);
  assert.equal(json.data.processingStaleAfterSeconds.queueSeconds, 300);
});

test("GET /api/ops/runtime includes additive lifecycle fields", async () => {
  const handler = createOpsRuntimeGetHandler({
    requireAuth: async () => ({
      tenantId: TENANT_ID,
      role: "ADMIN" as const,
      userId: "u1",
      email: "a@b.com",
      salesAgentId: null
    }),
    apiBootstrap: () => {
      const supabase = {
        rpc: async (name: string) => {
          if (name === "get_queue_runtime_stats") return { data: [{ depth: 0, lag_ms: 0 }], error: null };
          if (name === "get_outbox_runtime_stats") return { data: [{ depth: 0, lag_ms: 0 }], error: null };
          return { data: null, error: new Error(name) };
        },
        from(table: string) {
          return {
            select(_c: string, _o: { count: "exact"; head: true }) {
              const filters: string[] = [`table=${table}`];
              const query = {
                eq(column: string, value: string) {
                  filters.push(`${column}=${value}`);
                  return query;
                },
                lte(column: string, value: string) {
                  filters.push(`${column}<=${value}`);
                  return query;
                },
                lt(column: string, value: string) {
                  filters.push(`${column}<${value}`);
                  return query;
                },
                async then(resolve: (v: { count: number; error: null }) => void) {
                  const key = filters.join("|");
                  const deadOutbound =
                    key.includes("DEAD_LETTER") && key.includes("message.outbound.requested");
                  resolve({ count: deadOutbound ? 1 : 0, error: null });
                }
              };
              return query;
            }
          };
        }
      };
      return { supabase } as any;
    }
  });

  const res = await handler(makeReq());
  assert.equal(res.status, 200);
  const json = (await res.json()) as {
    data: {
      queueDetail: { outbound: { deadLetter: number } };
      health: { reasons: string[] };
    };
  };
  assert.equal(json.data.queueDetail.outbound.deadLetter, 1);
});

test("GET /api/ops/runtime stale processing produces health reason", async () => {
  const handler = createOpsRuntimeGetHandler({
    requireAuth: async () => ({
      tenantId: TENANT_ID,
      role: "ADMIN" as const,
      userId: "u1",
      email: "a@b.com",
      salesAgentId: null
    }),
    apiBootstrap: () => {
      const base = makeCountClient({});
      const supabase = {
        rpc: async (name: string) => {
          if (name === "get_queue_runtime_stats") return { data: [{ depth: 0, lag_ms: 0 }], error: null };
          if (name === "get_outbox_runtime_stats") return { data: [{ depth: 0, lag_ms: 0 }], error: null };
          return { data: null, error: new Error(name) };
        },
        from(table: string) {
          return {
            select(_c: string, _o: { count: "exact"; head: true }) {
              const filters: string[] = [`table=${table}`];
              const query = {
                eq(column: string, value: string) {
                  filters.push(`${column}=${value}`);
                  return query;
                },
                lte(column: string, value: string) {
                  filters.push(`${column}<=${value}`);
                  return query;
                },
                lt(column: string, value: string) {
                  filters.push(`${column}<${value}`);
                  return query;
                },
                async then(resolve: (v: { count: number; error: null }) => void) {
                  const key = filters.join("|");
                  const stale =
                    key.includes("status=PROCESSING") &&
                    key.includes("updated_at<") &&
                    key.includes("message.inbound.normalized");
                  resolve({ count: stale ? 3 : 0, error: null });
                }
              };
              return query;
            }
          };
        }
      };
      return { supabase } as any;
    }
  });

  const res = await handler(makeReq());
  const json = (await res.json()) as { data: { health: { level: string; reasons: string[] } } };
  assert.equal(json.data.health.level, "critical");
  assert.ok(json.data.health.reasons.some((r) => r.startsWith("queue_inbound_processing_stale:")));
});

test("GET /api/ops/runtime dead letter produces warn health", async () => {
  const handler = createOpsRuntimeGetHandler({
    requireAuth: async () => ({
      tenantId: TENANT_ID,
      role: "ADMIN" as const,
      userId: "u1",
      email: "a@b.com",
      salesAgentId: null
    }),
    apiBootstrap: () => {
      const supabase = {
        rpc: async (name: string) => {
          if (name === "get_queue_runtime_stats") return { data: [{ depth: 0, lag_ms: 0 }], error: null };
          if (name === "get_outbox_runtime_stats") return { data: [{ depth: 0, lag_ms: 0 }], error: null };
          return { data: null, error: new Error(name) };
        },
        from(table: string) {
          return {
            select(_c: string, _o: { count: "exact"; head: true }) {
              const filters: string[] = [`table=${table}`];
              const query = {
                eq(column: string, value: string) {
                  filters.push(`${column}=${value}`);
                  return query;
                },
                lte(column: string, value: string) {
                  filters.push(`${column}<=${value}`);
                  return query;
                },
                lt(column: string, value: string) {
                  filters.push(`${column}<${value}`);
                  return query;
                },
                async then(resolve: (v: { count: number; error: null }) => void) {
                  const key = filters.join("|");
                  resolve({ count: key.includes("DEAD_LETTER") && key.includes("outbox_events") ? 2 : 0, error: null });
                }
              };
              return query;
            }
          };
        }
      };
      return { supabase } as any;
    }
  });

  const res = await handler(makeReq());
  const json = (await res.json()) as { data: { health: { level: string; reasons: string[] } } };
  assert.equal(json.data.health.level, "warn");
  assert.ok(json.data.health.reasons.some((r) => r.startsWith("outbox_dead_letter:")));
});

test("GET /api/ops/runtime response excludes secrets and raw payloads", async () => {
  const res = await makeAdminHandler()(makeReq());
  const text = await res.text();
  assert.equal(res.status, 200);
  const forbidden = [
    "payload_json",
    "last_error",
    "FACEBOOK_APP_SECRET",
    "LINE_CHANNEL_SECRET",
    "Bearer ",
    "SUPABASE_SERVICE_ROLE"
  ];
  for (const token of forbidden) {
    assert.equal(text.includes(token), false, `response must not include ${token}`);
  }
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
