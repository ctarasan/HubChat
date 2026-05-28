import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createMeGetHandler } from "../../../app/api/me/route.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

function makeReq(): NextRequest {
  return new NextRequest("http://local/api/me", {
    headers: new Headers({
      Authorization: "Bearer test-token",
      "x-tenant-id": TENANT_ID
    })
  });
}

test("GET /api/me returns current user context for MANAGER", async () => {
  const handler = createMeGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "mgr-1",
        email: "mgr@example.com",
        role: "MANAGER",
        salesAgentId: "22222222-2222-4222-8222-222222222222"
      }) as any
  });
  const res = await handler(makeReq());
  assert.equal(res.status, 200);
  const body = JSON.parse(await res.text());
  assert.equal(body.data.role, "MANAGER");
  assert.equal(body.data.email, "mgr@example.com");
});

test("GET /api/me returns current user context for SALES", async () => {
  const handler = createMeGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "auth-user-1",
        email: "sales@example.com",
        role: "SALES",
        salesAgentId: "11111111-1111-4111-8111-111111111111"
      }) as any
  });
  const res = await handler(makeReq());
  assert.equal(res.status, 200);
  const body = JSON.parse(await res.text());
  assert.deepEqual(body.data, {
    tenantId: TENANT_ID,
    userId: "auth-user-1",
    email: "sales@example.com",
    role: "SALES",
    salesAgentId: "11111111-1111-4111-8111-111111111111"
  });
  assert.equal("accessToken" in body.data, false);
});

test("GET /api/me returns current user context for ADMIN", async () => {
  const handler = createMeGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "admin-user-1",
        email: "admin@example.com",
        role: "ADMIN",
        salesAgentId: null
      }) as any
  });
  const res = await handler(makeReq());
  assert.equal(res.status, 200);
  const body = JSON.parse(await res.text());
  assert.deepEqual(body.data, {
    tenantId: TENANT_ID,
    userId: "admin-user-1",
    email: "admin@example.com",
    role: "ADMIN",
    salesAgentId: null
  });
});

test("GET /api/me returns salesAgentId null when absent", async () => {
  const handler = createMeGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u2",
        email: "admin@example.com",
        role: "ADMIN",
        salesAgentId: null
      }) as any
  });
  const res = await handler(makeReq());
  assert.equal(res.status, 200);
  const body = JSON.parse(await res.text());
  assert.equal(body.data.salesAgentId, null);
});

test("GET /api/me returns 403 with safe message when requireAuth reports inactive sales agent", async () => {
  const handler = createMeGetHandler({
    requireAuth: async () => {
      throw new Error("Forbidden: inactive profile");
    }
  });
  const res = await handler(makeReq());
  assert.equal(res.status, 403);
  const body = JSON.parse(await res.text());
  assert.equal(body.error, "Your account is not active in this workspace. Please contact your administrator.");
});

test("GET /api/me returns 400 when tenant header missing at auth layer", async () => {
  const handler = createMeGetHandler({
    requireAuth: async () => {
      throw new Error("Missing x-tenant-id header");
    }
  });
  const res = await handler(makeReq());
  assert.equal(res.status, 400);
  const body = JSON.parse(await res.text());
  assert.equal(body.error, "Tenant id is required.");
});

test("GET /api/me returns 503 when sales agent lookup fails", async () => {
  const handler = createMeGetHandler({
    requireAuth: async () => {
      throw new Error("SalesAgentLookupFailed");
    }
  });
  const res = await handler(makeReq());
  assert.equal(res.status, 503);
  const body = JSON.parse(await res.text());
  assert.equal(body.error, "Service temporarily unavailable.");
});

test("GET /api/me returns 401 when requireAuth throws Unauthorized", async () => {
  const handler = createMeGetHandler({
    requireAuth: async () => {
      throw new Error("Unauthorized");
    }
  });
  const res = await handler(makeReq());
  assert.equal(res.status, 401);
});

test("GET /api/me returns 403 when requireAuth throws Forbidden", async () => {
  const handler = createMeGetHandler({
    requireAuth: async () => {
      throw new Error("Forbidden");
    }
  });
  const res = await handler(makeReq());
  assert.equal(res.status, 403);
});
