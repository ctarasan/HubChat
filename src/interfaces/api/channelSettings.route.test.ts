import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createChannelSettingsGetHandler } from "../../../app/api/channel-settings/route.js";
const TENANT_A = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

test("GET /api/channel-settings returns safe PostgREST detail on repository failure", async () => {
  const handler = createChannelSettingsGetHandler({
    requireAuth: async () => ({
      tenantId: TENANT_A,
      role: "ADMIN" as const,
      userId: "u1",
      email: "admin@test.com",
      salesAgentId: null
    }),
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
  const res = await handler(
    new NextRequest("http://local/api/channel-settings", {
      headers: new Headers({ Authorization: "Bearer test", "x-tenant-id": TENANT_A })
    })
  );
  assert.equal(res.status, 500);
  const body = (await res.json()) as {
    error: string;
    detail: { message: string; code?: string; hint?: string };
  };
  assert.equal(body.error, "Internal server error");
  assert.match(body.detail.message, /channel_settings/);
  assert.equal(JSON.stringify(body).includes("secret_json"), false);
});

test("GET /api/channel-settings rejects non-ADMIN", async () => {
  const handler = createChannelSettingsGetHandler({
    requireAuth: async () => {
      throw new Error("Forbidden");
    },
    apiBootstrap: () => ({ channelSettingRepository: {} }) as any
  });
  const res = await handler(
    new NextRequest("http://local/api/channel-settings", {
      headers: new Headers({ Authorization: "Bearer test", "x-tenant-id": TENANT_A })
    })
  );
  assert.equal(res.status, 403);
});
