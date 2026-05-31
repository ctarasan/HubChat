import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  createSlaPolicyGetHandler,
  createSlaPolicyPatchHandler
} from "../../../app/api/sla-policy/route.js";
import { buildDefaultTenantSlaPolicy } from "../../../src/domain/tenantSlaPolicy.js";

const TENANT_A = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const ADMIN_USER = "44444444-4444-4444-8444-444444444444";

function authHeaders(): Headers {
  return new Headers({
    Authorization: "Bearer test",
    "x-tenant-id": TENANT_A
  });
}

function adminAuth() {
  return {
    tenantId: TENANT_A,
    role: "ADMIN" as const,
    userId: ADMIN_USER,
    email: "admin@test.com",
    salesAgentId: null
  };
}

function managerAuth() {
  return {
    tenantId: TENANT_A,
    role: "MANAGER" as const,
    userId: "55555555-5555-4555-8555-555555555555",
    email: "mgr@test.com",
    salesAgentId: "66666666-6666-4666-8666-666666666666"
  };
}

function inMemoryRepo() {
  let row: Record<string, unknown> | null = null;
  const repo = {
    async findByTenantId(tenantId: string) {
      if (!row || row.tenantId !== tenantId) return null;
      return row;
    },
    async create(input: {
      tenantId: string;
      policy: ReturnType<typeof buildDefaultTenantSlaPolicy>;
      updatedByAuthUserId: string;
    }) {
      row = {
        tenantId: input.tenantId,
        ...input.policy,
        version: 1,
        updatedAt: "2026-06-01T00:00:00.000Z",
        updatedByAuthUserId: input.updatedByAuthUserId
      };
      return row;
    },
    async update(input: {
      tenantId: string;
      expectedVersion: number;
      policy: ReturnType<typeof buildDefaultTenantSlaPolicy>;
      updatedByAuthUserId: string;
    }) {
      if (!row || row.tenantId !== input.tenantId) {
        const { slaPolicyVersionConflict } = await import("../../../src/domain/slaPolicyApi.js");
        throw slaPolicyVersionConflict(0);
      }
      if (row.version !== input.expectedVersion) {
        const { slaPolicyVersionConflict } = await import("../../../src/domain/slaPolicyApi.js");
        throw slaPolicyVersionConflict(row.version as number);
      }
      row = {
        ...row,
        ...input.policy,
        version: (row.version as number) + 1,
        updatedAt: "2026-06-01T01:00:00.000Z",
        updatedByAuthUserId: input.updatedByAuthUserId
      };
      return row;
    }
  };
  return { repo, getRow: () => row };
}

function bootstrapWith(repo: unknown) {
  return () => ({ slaPolicyRepository: repo }) as any;
}

test("GET /api/sla-policy returns default policy when no tenant row", async () => {
  const { repo } = inMemoryRepo();
  const handler = createSlaPolicyGetHandler({
    requireAuth: async () => adminAuth(),
    apiBootstrap: bootstrapWith(repo)
  });
  const res = await handler(new NextRequest("http://local/api/sla-policy", { headers: authHeaders() }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: Record<string, unknown> };
  assert.equal(body.data.source, "default");
  assert.equal(body.data.persisted, false);
  assert.equal(body.data.version, 0);
  assert.equal(body.data.updatedAt, null);
  assert.equal(body.data.updatedBy, null);
});

test("GET /api/sla-policy allows MANAGER", async () => {
  const { repo } = inMemoryRepo();
  const handler = createSlaPolicyGetHandler({
    requireAuth: async (_req, roles) => {
      if (!roles.includes("MANAGER")) throw new Error("Forbidden");
      return managerAuth();
    },
    apiBootstrap: bootstrapWith(repo)
  });
  const res = await handler(new NextRequest("http://local/api/sla-policy", { headers: authHeaders() }));
  assert.equal(res.status, 200);
});

test("GET /api/sla-policy rejects SALES with 403", async () => {
  const handler = createSlaPolicyGetHandler({
    requireAuth: async () => {
      throw new Error("Forbidden");
    },
    apiBootstrap: bootstrapWith(inMemoryRepo().repo)
  });
  const res = await handler(new NextRequest("http://local/api/sla-policy", { headers: authHeaders() }));
  assert.equal(res.status, 403);
});

test("PATCH /api/sla-policy ADMIN create returns tenant policy", async () => {
  const { repo } = inMemoryRepo();
  const handler = createSlaPolicyPatchHandler({
    requireAuth: async () => adminAuth(),
    apiBootstrap: bootstrapWith(repo)
  });
  const patchBody = {
    ...buildDefaultTenantSlaPolicy(),
    excludeArchived: true
  };
  const res = await handler(
    new NextRequest("http://local/api/sla-policy", {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(patchBody)
    })
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: Record<string, unknown> };
  assert.equal(body.data.source, "tenant");
  assert.equal(body.data.persisted, true);
  assert.equal(body.data.version, 1);
  assert.equal(body.data.excludeArchived, true);
  assert.equal((body.data.updatedBy as { authUserId: string }).authUserId, ADMIN_USER);
});

test("PATCH /api/sla-policy rejects MANAGER with 403", async () => {
  const handler = createSlaPolicyPatchHandler({
    requireAuth: async () => {
      throw new Error("Forbidden");
    },
    apiBootstrap: bootstrapWith(inMemoryRepo().repo)
  });
  const res = await handler(
    new NextRequest("http://local/api/sla-policy", {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(buildDefaultTenantSlaPolicy())
    })
  );
  assert.equal(res.status, 403);
});

test("PATCH /api/sla-policy rejects SALES with 403", async () => {
  const handler = createSlaPolicyPatchHandler({
    requireAuth: async () => {
      throw new Error("Forbidden");
    },
    apiBootstrap: bootstrapWith(inMemoryRepo().repo)
  });
  const res = await handler(
    new NextRequest("http://local/api/sla-policy", {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(buildDefaultTenantSlaPolicy())
    })
  );
  assert.equal(res.status, 403);
});

test("PATCH /api/sla-policy rejects deferred businessHours with 400", async () => {
  const handler = createSlaPolicyPatchHandler({
    requireAuth: async () => adminAuth(),
    apiBootstrap: bootstrapWith(inMemoryRepo().repo)
  });
  const res = await handler(
    new NextRequest("http://local/api/sla-policy", {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ ...buildDefaultTenantSlaPolicy(), businessHours: {} })
    })
  );
  assert.equal(res.status, 400);
});

test("PATCH /api/sla-policy rejects unknown top-level fields with 400", async () => {
  const handler = createSlaPolicyPatchHandler({
    requireAuth: async () => adminAuth(),
    apiBootstrap: bootstrapWith(inMemoryRepo().repo)
  });
  const res = await handler(
    new NextRequest("http://local/api/sla-policy", {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ ...buildDefaultTenantSlaPolicy(), extra: true })
    })
  );
  assert.equal(res.status, 400);
});

test("PATCH /api/sla-policy returns 409 on stale version", async () => {
  const { repo } = inMemoryRepo();
  const handler = createSlaPolicyPatchHandler({
    requireAuth: async () => adminAuth(),
    apiBootstrap: bootstrapWith(repo)
  });

  const createRes = await handler(
    new NextRequest("http://local/api/sla-policy", {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(buildDefaultTenantSlaPolicy())
    })
  );
  assert.equal(createRes.status, 200);

  const staleRes = await handler(
    new NextRequest("http://local/api/sla-policy", {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(buildDefaultTenantSlaPolicy())
    })
  );
  assert.equal(staleRes.status, 409);
  const staleBody = (await staleRes.json()) as { error: string; currentVersion: number };
  assert.equal(staleBody.error, "Conflict");
  assert.equal(staleBody.currentVersion, 1);
});

test("PATCH /api/sla-policy rejects enabled rule without targetMinutes", async () => {
  const handler = createSlaPolicyPatchHandler({
    requireAuth: async () => adminAuth(),
    apiBootstrap: bootstrapWith(inMemoryRepo().repo)
  });
  const bad = buildDefaultTenantSlaPolicy();
  bad.rules.NEW_FIRST_RESPONSE = {
    ...bad.rules.NEW_FIRST_RESPONSE,
    enabled: true,
    targetMinutes: null
  };
  const res = await handler(
    new NextRequest("http://local/api/sla-policy", {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(bad)
    })
  );
  assert.equal(res.status, 400);
});
