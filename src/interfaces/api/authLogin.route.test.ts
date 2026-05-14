import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createAuthLoginPostHandler } from "../../../app/api/auth/login/route.js";

function makeReq(body: unknown, origin = "https://app.example.com"): NextRequest {
  return new NextRequest(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

test("POST /api/auth/login invalid credentials returns 401", async () => {
  const handler = createAuthLoginPostHandler({
    fetchPasswordAccessToken: async () => {
      throw new Error("bad");
    },
    listActiveTenantIdsForEmail: async () => []
  });
  const res = await handler(makeReq({ email: "a@b.com", password: "x" }));
  assert.equal(res.status, 401);
  const j = JSON.parse(await res.text());
  assert.equal(j.error, "Invalid email or password.");
});

test("POST /api/auth/login no active sales_agents row returns 403", async () => {
  const handler = createAuthLoginPostHandler({
    fetchPasswordAccessToken: async () => "tok",
    listActiveTenantIdsForEmail: async () => []
  });
  const res = await handler(makeReq({ email: "a@b.com", password: "secret12" }));
  assert.equal(res.status, 403);
});

test("POST /api/auth/login multiple active rows returns 409", async () => {
  const handler = createAuthLoginPostHandler({
    fetchPasswordAccessToken: async () => "tok",
    listActiveTenantIdsForEmail: async () => ["t1", "t2"]
  });
  const res = await handler(makeReq({ email: "a@b.com", password: "secret12" }));
  assert.equal(res.status, 409);
  const j = JSON.parse(await res.text());
  assert.equal(j.code, "MULTIPLE_TENANTS");
});

test("POST /api/auth/login one active row returns accessToken tenantId baseUrl", async () => {
  const handler = createAuthLoginPostHandler({
    fetchPasswordAccessToken: async () => "tok-abc",
    listActiveTenantIdsForEmail: async () => ["tenant-uuid-1"]
  });
  const res = await handler(makeReq({ email: "a@b.com", password: "secret12" }));
  assert.equal(res.status, 200);
  const j = JSON.parse(await res.text());
  assert.equal(j.accessToken, "tok-abc");
  assert.equal(j.tenantId, "tenant-uuid-1");
  assert.equal(j.baseUrl, "https://app.example.com");
  assert.equal("password" in j, false);
});

test("POST /api/auth/login invalid body returns 401", async () => {
  const handler = createAuthLoginPostHandler({
    fetchPasswordAccessToken: async () => "x",
    listActiveTenantIdsForEmail: async () => ["t"]
  });
  const res = await handler(makeReq({ email: "not-email", password: "" }));
  assert.equal(res.status, 401);
});
