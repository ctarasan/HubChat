import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { getRuntimeConfig } from "../../application/channelSettings/getChannelRuntimeConfig.js";
import { createChannelSettingsGetHandler } from "../../../app/api/channel-settings/route.js";
import { createChannelSettingPatchHandler } from "../../../app/api/channel-settings/[channel]/route.js";
import type { ChannelSettingPublicDto, ChannelRuntimeConfig } from "../../domain/channelSettings.js";
import { mergeChannelSecrets } from "../../lib/channelSettingSecrets.js";
import { normalizeApiSecretsPatch } from "../../lib/channelSettingApiSecrets.js";

const TENANT_A = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const TENANT_B = "11111111-1111-4111-8111-111111111111";

const samplePublic: ChannelSettingPublicDto = {
  channel: "LINE",
  enabled: true,
  configured: false,
  status: "NOT_CONFIGURED",
  providerPageId: null,
  providerAccountName: "LINE Main",
  lastVerifiedAt: null,
  lastError: null,
  updatedAt: "2026-01-02T00:00:00.000Z",
  secretState: {
    accessToken: "SET",
    channelSecret: "EMPTY"
  }
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

test("GET /api/channel-settings returns public DTO without raw secrets", async () => {
  const handler = createChannelSettingsGetHandler({
    requireAuth: adminAuth(TENANT_A),
    apiBootstrap: () =>
      ({
        channelSettingRepository: {
          listByTenant: async (tenantId: string) => {
            assert.equal(tenantId, TENANT_A);
            return [samplePublic];
          }
        }
      }) as any
  });
  const res = await handler(makeGetReq(TENANT_A));
  assert.equal(res.status, 200);
  const json = (await res.json()) as { data: ChannelSettingPublicDto[] };
  assert.equal(json.data[0]!.channel, "LINE");
  assert.equal(json.data[0]!.secretState.accessToken, "SET");
  const serialized = JSON.stringify(json);
  assert.equal(serialized.includes("secret_json"), false);
  assert.equal(serialized.includes("channel_secret"), false);
  assert.equal(serialized.includes("line-secret"), false);
  assert.equal("secretsConfigured" in json.data[0]!, false);
});

test("PATCH /api/channel-settings/[channel] returns public DTO without raw secrets", async () => {
  const handler = createChannelSettingPatchHandler({
    requireAuth: adminAuth(TENANT_A),
    apiBootstrap: () =>
      ({
        channelSettingRepository: {
          upsertForTenant: async () => samplePublic
        }
      }) as any
  });
  const res = await handler(makePatchReq(TENANT_A, "line", { enabled: true }), {
    params: Promise.resolve({ channel: "line" })
  });
  assert.equal(res.status, 200);
  const json = (await res.json()) as { data: ChannelSettingPublicDto };
  assert.equal(json.data.secretState.accessToken, "SET");
  assert.equal(JSON.stringify(json).includes("secret_json"), false);
});

test("PATCH rejects non-ADMIN", async () => {
  const handler = createChannelSettingPatchHandler({
    requireAuth: async () => {
      throw new Error("Forbidden");
    },
    apiBootstrap: () => ({ channelSettingRepository: {} }) as any
  });
  const res = await handler(makePatchReq(TENANT_A, "LINE", { enabled: true }), {
    params: Promise.resolve({ channel: "LINE" })
  });
  assert.equal(res.status, 403);
});

test("PATCH tenant boundary uses auth tenant only", async () => {
  const handler = createChannelSettingPatchHandler({
    requireAuth: adminAuth(TENANT_B),
    apiBootstrap: () =>
      ({
        channelSettingRepository: {
          upsertForTenant: async (input: { tenantId: string }) => {
            assert.equal(input.tenantId, TENANT_B);
            return { ...samplePublic, channel: "FACEBOOK" };
          }
        }
      }) as any
  });
  const res = await handler(makePatchReq(TENANT_B, "FACEBOOK", { enabled: false }), {
    params: Promise.resolve({ channel: "FACEBOOK" })
  });
  assert.equal(res.status, 200);
});

test("blank API secret does not overwrite existing storage secret", () => {
  const existing = { channel_secret: "keep-me" };
  const patch = normalizeApiSecretsPatch("LINE", { channelSecret: "   ", accessToken: "" });
  assert.equal(patch, undefined);
  const { secretJson } = mergeChannelSecrets("LINE", existing, patch, undefined);
  assert.equal(secretJson.channel_secret, "keep-me");
});

test("non-blank API secret replaces stored secret", () => {
  const patch = normalizeApiSecretsPatch("LINE", { channelSecret: "new-secret" });
  const { secretJson } = mergeChannelSecrets("LINE", { channel_secret: "old" }, patch, undefined);
  assert.equal(secretJson.channel_secret, "new-secret");
});

test("clearSecrets clears only selected storage keys", () => {
  const existing = {
    channel_secret: "s1",
    channel_access_token: "t1"
  };
  const { secretJson } = mergeChannelSecrets("LINE", existing, undefined, ["channel_secret"]);
  assert.equal(secretJson.channel_secret, undefined);
  assert.equal(secretJson.channel_access_token, "t1");
});

test("getRuntimeConfig returns null for disabled channel", async () => {
  const repo = {
    getRuntimeConfig: async () => null
  };
  const cfg = await getRuntimeConfig(repo as any, { tenantId: TENANT_A, channel: "LINE" });
  assert.equal(cfg, null);
});

test("getRuntimeConfig returns runtime secrets when configured", async () => {
  const runtime: ChannelRuntimeConfig = {
    tenantId: TENANT_A,
    channel: "LINE",
    enabled: true,
    providerPageId: "p1",
    providerAccountName: "LINE",
    secrets: { accessToken: "tok", channelSecret: "sec" }
  };
  const repo = { getRuntimeConfig: async () => runtime };
  const cfg = await getRuntimeConfig(repo as any, { tenantId: TENANT_A, channel: "LINE" });
  assert.equal(cfg?.secrets.accessToken, "tok");
  assert.equal(cfg?.secrets.channelSecret, "sec");
});

test("runtime config resolver is not imported by HTTP channel-settings routes", () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const getRoute = read("../../../app/api/channel-settings/route.ts");
  const patchRoute = read("../../../app/api/channel-settings/[channel]/route.ts");
  assert.equal(getRoute.includes("getRuntimeConfig"), false);
  assert.equal(patchRoute.includes("getRuntimeConfig"), false);
});

test("webhook and adapter modules do not import channel settings repository", () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const webhookLine = read("../../../app/api/webhook/line/route.ts");
  const fbAdapter = read("../../infrastructure/adapters/channels/facebookAdapter.ts");
  assert.equal(webhookLine.includes("channelSettingRepository"), false);
  assert.equal(fbAdapter.includes("getRuntimeConfig"), false);
});
