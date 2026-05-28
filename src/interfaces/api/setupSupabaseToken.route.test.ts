import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createSetupSupabaseTokenPostHandler } from "../../../app/api/setup/supabase-token/route.js";
import { isSetupSupabaseTokenRouteEnabled } from "./setupSupabaseTokenGate.js";

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://local/api/setup/supabase-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

test("setup supabase-token route disabled by default in production-like env", async () => {
  const prev = process.env.HUBCHAT_ALLOW_SETUP_SUPABASE_TOKEN;
  delete process.env.HUBCHAT_ALLOW_SETUP_SUPABASE_TOKEN;
  try {
    assert.equal(isSetupSupabaseTokenRouteEnabled(), false);
    const handler = createSetupSupabaseTokenPostHandler({
      isRouteEnabled: () => false,
      fetchPasswordAccessToken: async () => "should-not-run"
    });
    const res = await handler(makeReq({ username: "a@b.com", password: "secret" }));
    assert.equal(res.status, 404);
    const body = JSON.parse(await res.text());
    assert.equal(body.error, "Not found");
  } finally {
    if (prev === undefined) delete process.env.HUBCHAT_ALLOW_SETUP_SUPABASE_TOKEN;
    else process.env.HUBCHAT_ALLOW_SETUP_SUPABASE_TOKEN = prev;
  }
});

test("setup supabase-token route works only when explicit allow flag is set", async () => {
  const handler = createSetupSupabaseTokenPostHandler({
    isRouteEnabled: () => true,
    fetchPasswordAccessToken: async () => "access-token-xyz"
  });
  const res = await handler(makeReq({ username: "a@b.com", password: "secret12" }));
  assert.equal(res.status, 200);
  const body = JSON.parse(await res.text());
  assert.equal(body.accessToken, "access-token-xyz");
});

test("isSetupSupabaseTokenRouteEnabled respects HUBCHAT_ALLOW_SETUP_SUPABASE_TOKEN", () => {
  const prev = process.env.HUBCHAT_ALLOW_SETUP_SUPABASE_TOKEN;
  process.env.HUBCHAT_ALLOW_SETUP_SUPABASE_TOKEN = "true";
  try {
    assert.equal(isSetupSupabaseTokenRouteEnabled(), true);
  } finally {
    if (prev === undefined) delete process.env.HUBCHAT_ALLOW_SETUP_SUPABASE_TOKEN;
    else process.env.HUBCHAT_ALLOW_SETUP_SUPABASE_TOKEN = prev;
  }
});

test("isSetupSupabaseTokenRouteEnabled requires explicit true-like values", () => {
  const prev = process.env.HUBCHAT_ALLOW_SETUP_SUPABASE_TOKEN;
  try {
    process.env.HUBCHAT_ALLOW_SETUP_SUPABASE_TOKEN = "false";
    assert.equal(isSetupSupabaseTokenRouteEnabled(), false);
    process.env.HUBCHAT_ALLOW_SETUP_SUPABASE_TOKEN = "0";
    assert.equal(isSetupSupabaseTokenRouteEnabled(), false);
    process.env.HUBCHAT_ALLOW_SETUP_SUPABASE_TOKEN = "prod";
    assert.equal(isSetupSupabaseTokenRouteEnabled(), false);
    process.env.HUBCHAT_ALLOW_SETUP_SUPABASE_TOKEN = "yes";
    assert.equal(isSetupSupabaseTokenRouteEnabled(), true);
    process.env.HUBCHAT_ALLOW_SETUP_SUPABASE_TOKEN = "1";
    assert.equal(isSetupSupabaseTokenRouteEnabled(), true);
  } finally {
    if (prev === undefined) delete process.env.HUBCHAT_ALLOW_SETUP_SUPABASE_TOKEN;
    else process.env.HUBCHAT_ALLOW_SETUP_SUPABASE_TOKEN = prev;
  }
});

test("disabled setup route response does not include setup token or service role hints", async () => {
  const handler = createSetupSupabaseTokenPostHandler({
    isRouteEnabled: () => false,
    fetchPasswordAccessToken: async () => "must-not-run"
  });
  const res = await handler(makeReq({ username: "u@test.com", password: "fake-password-123" }));
  assert.equal(res.status, 404);
  const body = JSON.parse(await res.text()) as Record<string, unknown>;
  const serialized = JSON.stringify(body);
  assert.equal("accessToken" in body, false);
  assert.equal(serialized.includes("service_role"), false);
  assert.equal(serialized.includes("SUPABASE_SERVICE_ROLE"), false);
  assert.equal(serialized.includes("fake-password-123"), false);
});
