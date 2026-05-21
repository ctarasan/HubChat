import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { TestChannelConnectionUseCase } from "../../application/usecases/testChannelConnection.js";
import { createChannelTestConnectionHandler } from "../../../app/api/channel-settings/[channel]/test-connection/route.js";
import type { ChannelSettingPublicDto, ChannelTestConnectionResponseDto } from "../../domain/channelSettings.js";

const TENANT_A = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const TENANT_B = "11111111-1111-4111-8111-111111111111";

function readyLineSetting(overrides: Partial<ChannelSettingPublicDto> = {}): ChannelSettingPublicDto {
  return {
    channel: "LINE",
    enabled: true,
    configured: true,
    status: "READY",
    providerPageId: "U123",
    providerAccountName: "LINE Bot",
    lastVerifiedAt: null,
    lastError: null,
    updatedAt: "2026-01-02T00:00:00.000Z",
    secretState: { accessToken: "SET", channelSecret: "SET" },
    displayName: "LINE Bot",
    configJson: {},
    secretsConfigured: [],
    ...overrides
  };
}

function adminAuth(tenantId: string) {
  return async () => ({
    tenantId,
    role: "ADMIN" as const,
    userId: "u1",
    email: "admin@test.com",
    salesAgentId: null
  });
}

function managerAuth(tenantId: string) {
  return async () => ({
    tenantId,
    role: "MANAGER" as const,
    userId: "u2",
    email: "mgr@test.com",
    salesAgentId: "sa-1"
  });
}

function makePostReq(tenantId: string, channel: string) {
  return new NextRequest(`http://local/api/channel-settings/${channel}/test-connection`, {
    method: "POST",
    headers: new Headers({
      Authorization: "Bearer test",
      "x-tenant-id": tenantId
    })
  });
}

function mockRepo(overrides: Record<string, unknown> = {}) {
  return {
    findByTenantAndChannel: async () => readyLineSetting(),
    getRuntimeConfigForConnectionTest: async () => ({
      tenantId: TENANT_A,
      channel: "LINE" as const,
      enabled: true,
      providerPageId: null,
      providerAccountName: null,
      secrets: { accessToken: "line-token", channelSecret: "line-secret" }
    }),
    updateConnectionHealth: async () => readyLineSetting({ lastVerifiedAt: "2026-05-21T12:00:00.000Z", lastError: null }),
    ...overrides
  };
}

test("ADMIN can call test-connection", async () => {
  const handler = createChannelTestConnectionHandler({
    requireAuth: adminAuth(TENANT_A),
    apiBootstrap: () => ({ channelSettingRepository: mockRepo() }) as any
  });
  const res = await handler(makePostReq(TENANT_A, "line"), {
    params: Promise.resolve({ channel: "line" })
  });
  assert.equal(res.status, 200);
});

test("MANAGER cannot call test-connection", async () => {
  const handler = createChannelTestConnectionHandler({
    requireAuth: async (_req, allowedRoles) => {
      const ctx = await managerAuth(TENANT_A)();
      if (!allowedRoles.includes(ctx.role)) throw new Error("Forbidden");
      return ctx;
    },
    apiBootstrap: () => ({ channelSettingRepository: mockRepo() }) as any
  });
  const res = await handler(makePostReq(TENANT_A, "LINE"), {
    params: Promise.resolve({ channel: "LINE" })
  });
  assert.equal(res.status, 403);
});

test("test-connection preserves tenant isolation", async () => {
  let capturedTenant: string | null = null;
  const handler = createChannelTestConnectionHandler({
    requireAuth: adminAuth(TENANT_B),
    apiBootstrap: () =>
      ({
        channelSettingRepository: mockRepo({
          findByTenantAndChannel: async (tenantId: string) => {
            capturedTenant = tenantId;
            return readyLineSetting();
          }
        })
      }) as any
  });
  const res = await handler(makePostReq(TENANT_B, "LINE"), {
    params: Promise.resolve({ channel: "LINE" })
  });
  assert.equal(res.status, 200);
  assert.equal(capturedTenant, TENANT_B);
});

test("invalid channel is rejected", async () => {
  const handler = createChannelTestConnectionHandler({
    requireAuth: adminAuth(TENANT_A),
    apiBootstrap: () => ({ channelSettingRepository: mockRepo() }) as any
  });
  const res = await handler(makePostReq(TENANT_A, "TIKTOK"), {
    params: Promise.resolve({ channel: "TIKTOK" })
  });
  assert.equal(res.status, 400);
});

test("disabled channel returns DISABLED without provider call", async () => {
  let providerCalled = false;
  const useCase = new TestChannelConnectionUseCase(
    mockRepo({
      findByTenantAndChannel: async () => readyLineSetting({ enabled: false, status: "DISABLED", configured: false })
    }) as any,
    {
      verifyChannelHealth: async () => {
        providerCalled = true;
        return { ok: true, message: "should not run" };
      }
    }
  );
  const result = await useCase.execute({ tenantId: TENANT_A, channel: "LINE" });
  assert.equal(result.ok, false);
  assert.equal(result.status, "DISABLED");
  assert.equal(providerCalled, false);
});

test("missing secrets returns NOT_CONFIGURED without provider call", async () => {
  let providerCalled = false;
  const useCase = new TestChannelConnectionUseCase(
    mockRepo({
      findByTenantAndChannel: async () =>
        readyLineSetting({ configured: false, status: "NOT_CONFIGURED", secretState: { accessToken: "EMPTY" } })
    }) as any,
    {
      verifyChannelHealth: async () => {
        providerCalled = true;
        return { ok: true, message: "should not run" };
      }
    }
  );
  const result = await useCase.execute({ tenantId: TENANT_A, channel: "LINE" });
  assert.equal(result.ok, false);
  assert.equal(result.status, "NOT_CONFIGURED");
  assert.equal(providerCalled, false);
});

test("successful check returns READY and updates lastVerifiedAt", async () => {
  const healthUpdates: { lastVerifiedAt?: string | null; lastError?: string | null }[] = [];
  const useCase = new TestChannelConnectionUseCase(
    mockRepo({
      updateConnectionHealth: async (input: { lastVerifiedAt?: string | null; lastError?: string | null }) => {
        healthUpdates.push(input);
        return readyLineSetting();
      }
    }) as any,
    {
      verifyChannelHealth: async () => ({ ok: true, message: "LINE connection verified." })
    }
  );
  const result = await useCase.execute({ tenantId: TENANT_A, channel: "LINE" });
  assert.equal(result.ok, true);
  assert.equal(result.status, "READY");
  assert.ok(result.lastVerifiedAt);
  assert.equal(result.lastError, null);
  assert.equal(healthUpdates.length, 1);
  assert.equal(healthUpdates[0]!.lastError, null);
  assert.ok(healthUpdates[0]!.lastVerifiedAt);
});

test("successful check clears lastError", async () => {
  let cleared = false;
  const useCase2 = new TestChannelConnectionUseCase(
    mockRepo({
      findByTenantAndChannel: async () => readyLineSetting({ lastError: "old", status: "ERROR" }),
      updateConnectionHealth: async (input: { lastError?: string | null }) => {
        cleared = input.lastError === null;
        return readyLineSetting();
      }
    }) as any,
    { verifyChannelHealth: async () => ({ ok: true, message: "ok" }) }
  );
  await useCase2.execute({ tenantId: TENANT_A, channel: "LINE" });
  assert.equal(cleared, true);
});

test("failed check returns ERROR and persists sanitized lastError", async () => {
  let persistedError: string | undefined;
  const useCase = new TestChannelConnectionUseCase(
    mockRepo({
      updateConnectionHealth: async (input: { lastError?: string | null }) => {
        persistedError = input.lastError ?? undefined;
        return readyLineSetting();
      }
    }) as any,
    {
      verifyChannelHealth: async () => ({
        ok: false,
        message: "Invalid OAuth access token EAAG1234567890abcdef0123456789"
      })
    }
  );
  const result = await useCase.execute({ tenantId: TENANT_A, channel: "LINE" });
  assert.equal(result.ok, false);
  assert.equal(result.status, "ERROR");
  assert.equal(result.message.includes("EAAG"), false);
  assert.equal(persistedError?.includes("EAAG"), false);
});

test("response never includes raw secrets", async () => {
  const handler = createChannelTestConnectionHandler({
    requireAuth: adminAuth(TENANT_A),
    apiBootstrap: () => ({ channelSettingRepository: mockRepo() }) as any
  });
  const useCase = new TestChannelConnectionUseCase(mockRepo() as any, {
    verifyChannelHealth: async () => ({ ok: true, message: "verified" })
  });
  const result = await useCase.execute({ tenantId: TENANT_A, channel: "LINE" });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("line-token"), false);
  assert.equal(serialized.includes("line-secret"), false);
  assert.equal(serialized.includes("secret_json"), false);
  assert.equal(serialized.includes("channel_access_token"), false);
});

test("ERROR state still allows connection test when configured", async () => {
  const useCase = new TestChannelConnectionUseCase(
    mockRepo({
      findByTenantAndChannel: async () =>
        readyLineSetting({ status: "ERROR", lastError: "Previous failure", configured: true })
    }) as any,
    { verifyChannelHealth: async () => ({ ok: true, message: "recovered" }) }
  );
  const result = await useCase.execute({ tenantId: TENANT_A, channel: "LINE" });
  assert.equal(result.ok, true);
  assert.equal(result.status, "READY");
});

test("worker and adapters are not cut over to test-connection", () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const worker = read("../../worker/main.ts");
  const lineAdapter = read("../../infrastructure/adapters/channels/lineAdapter.ts");
  assert.equal(worker.includes("test-connection"), false);
  assert.equal(worker.includes("TestChannelConnection"), false);
  assert.equal(lineAdapter.includes("TestChannelConnection"), false);
});

test("test-connection route does not expose getRuntimeConfig in response path", async () => {
  const handler = createChannelTestConnectionHandler({
    requireAuth: adminAuth(TENANT_A),
    apiBootstrap: () => ({ channelSettingRepository: mockRepo() }) as any
  });
  const res = await handler(makePostReq(TENANT_A, "LINE"), {
    params: Promise.resolve({ channel: "LINE" })
  });
  const body = (await res.json()) as ChannelTestConnectionResponseDto;
  assert.equal(body.channel, "LINE");
  assert.equal("secrets" in body, false);
});
