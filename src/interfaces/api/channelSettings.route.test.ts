import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { createChannelSettingsGetHandler } from "../../../app/api/channel-settings/route.js";
import { createChannelSettingPatchHandler } from "../../../app/api/channel-settings/[channel]/route.js";
import type { ChannelSettingSafeDto } from "../../domain/channelSettings.js";

const TENANT_A = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const TENANT_B = "11111111-1111-4111-8111-111111111111";

const sampleSafe: ChannelSettingSafeDto = {
  id: "cs-1",
  tenantId: TENANT_A,
  channel: "LINE",
  enabled: true,
  displayName: "LINE Main",
  configJson: { channelId: "U123" },
  secretsConfigured: [
    { key: "channel_secret", configured: true, fingerprint: "abc123def456".slice(0, 12) },
    { key: "channel_access_token", configured: false, fingerprint: null }
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z"
};

function adminAuth(tenantId: string) {
  return async () => ({
    tenantId,
    role: "ADMIN" as const,
    userId: "u1",
    email: "admin@test.com",
    salesAgentId: null
  });
}

function makeGetReq(tenantId: string) {
  return new NextRequest("http://local/api/channel-settings", {
    headers: new Headers({
      Authorization: "Bearer test",
      "x-tenant-id": tenantId
    })
  });
}

function makePatchReq(tenantId: string, channel: string, body: unknown) {
  return new NextRequest(`http://local/api/channel-settings/${channel}`, {
    method: "PATCH",
    headers: new Headers({
      Authorization: "Bearer test",
      "x-tenant-id": tenantId,
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(body)
  });
}

test("GET /api/channel-settings returns safe masked data for ADMIN", async () => {
  const handler = createChannelSettingsGetHandler({
    requireAuth: adminAuth(TENANT_A),
    apiBootstrap: () =>
      ({
        channelSettingRepository: {
          listByTenant: async (tenantId: string) => {
            assert.equal(tenantId, TENANT_A);
            return [sampleSafe];
          }
        }
      }) as any
  });
  const res = await handler(makeGetReq(TENANT_A));
  assert.equal(res.status, 200);
  const json = (await res.json()) as { data: ChannelSettingSafeDto[] };
  assert.equal(json.data.length, 1);
  assert.equal(json.data[0]!.channel, "LINE");
  const serialized = JSON.stringify(json);
  assert.equal(serialized.includes("secret_json"), false);
  assert.equal(serialized.includes("line-secret"), false);
  assert.equal(json.data[0]!.secretsConfigured[0]!.fingerprint?.length, 12);
});

test("GET /api/channel-settings returns safe PostgREST detail on repository failure", async () => {
  const handler = createChannelSettingsGetHandler({
    requireAuth: adminAuth(TENANT_A),
    apiBootstrap: () =>
      ({
        channelSettingRepository: {
          listByTenant: async () => {
            throw {
              message: "Could not find the table 'public.channel_settings' in the schema cache",
              code: "PGRST205",
              hint: "Perhaps refresh the schema cache"
            };
          }
        }
      }) as any
  });
  const res = await handler(makeGetReq(TENANT_A));
  assert.equal(res.status, 500);
  const body = (await res.json()) as {
    error: string;
    detail: { message: string; code?: string; hint?: string };
  };
  assert.equal(body.error, "Internal server error");
  assert.match(body.detail.message, /channel_settings/);
  assert.equal(body.detail.code, "PGRST205");
  assert.equal(body.detail.hint, "Perhaps refresh the schema cache");
  assert.equal(JSON.stringify(body).includes("secret_json"), false);
});

test("GET /api/channel-settings rejects non-ADMIN", async () => {
  const handler = createChannelSettingsGetHandler({
    requireAuth: async () => {
      throw new Error("Forbidden");
    },
    apiBootstrap: () => ({ channelSettingRepository: {} }) as any
  });
  const res = await handler(makeGetReq(TENANT_A));
  assert.equal(res.status, 403);
});

test("PATCH /api/channel-settings/[channel] upserts tenant-scoped setting", async () => {
  let capturedTenant: string | null = null;
  const handler = createChannelSettingPatchHandler({
    requireAuth: adminAuth(TENANT_A),
    apiBootstrap: () =>
      ({
        channelSettingRepository: {
          upsertForTenant: async (input: { tenantId: string; channel: string; enabled?: boolean }) => {
            capturedTenant = input.tenantId;
            return { ...sampleSafe, enabled: input.enabled ?? true };
          }
        }
      }) as any
  });
  const res = await handler(makePatchReq(TENANT_A, "line", { enabled: true, displayName: "LINE" }), {
    params: Promise.resolve({ channel: "line" })
  });
  assert.equal(res.status, 200);
  assert.equal(capturedTenant, TENANT_A);
  const json = (await res.json()) as { data: ChannelSettingSafeDto };
  assert.equal(json.data.enabled, true);
  const body = JSON.stringify(json);
  assert.equal(body.includes("secret_json"), false);
  assert.equal(body.includes("line-secret-abc"), false);
});

test("PATCH rejects unknown channel", async () => {
  const handler = createChannelSettingPatchHandler({
    requireAuth: adminAuth(TENANT_A),
    apiBootstrap: () => ({ channelSettingRepository: {} }) as any
  });
  const res = await handler(makePatchReq(TENANT_A, "TIKTOK", { enabled: true }), {
    params: Promise.resolve({ channel: "TIKTOK" })
  });
  assert.equal(res.status, 400);
});

test("PATCH tenant boundary uses auth tenant only", async () => {
  const handler = createChannelSettingPatchHandler({
    requireAuth: adminAuth(TENANT_B),
    apiBootstrap: () =>
      ({
        channelSettingRepository: {
          upsertForTenant: async (input: { tenantId: string }) => {
            assert.equal(input.tenantId, TENANT_B);
            return { ...sampleSafe, tenantId: TENANT_B };
          }
        }
      }) as any
  });
  const res = await handler(makePatchReq(TENANT_B, "FACEBOOK", { enabled: false }), {
    params: Promise.resolve({ channel: "FACEBOOK" })
  });
  assert.equal(res.status, 200);
});

test("webhook and adapter modules do not import channel settings repository", () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const webhookLine = read("../../../app/api/webhook/line/route.ts");
  const fbAdapter = read("../../infrastructure/adapters/channels/facebookAdapter.ts");
  assert.equal(webhookLine.includes("channelSettingRepository"), false);
  assert.equal(webhookLine.includes("channel_settings"), false);
  assert.equal(fbAdapter.includes("channelSettingRepository"), false);
  assert.equal(fbAdapter.includes("channel_settings"), false);
});
