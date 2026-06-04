import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SendOutboundMessageUseCase } from "./sendOutboundMessage.js";
import type { OutboundMessageRequestedPayload } from "../../domain/events.js";
import { createLineOutboundAdapterResolver } from "../lineOutbound/createLineOutboundAdapterResolver.js";
import type { ChannelRuntimeConfig } from "../../domain/channelSettings.js";

const TENANT_A = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

const linePayload: OutboundMessageRequestedPayload = {
  tenantId: TENANT_A,
  leadId: "lead-1",
  messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca00",
  conversationId: "conv-1",
  channel: "LINE",
  channelThreadId: "Uline-user-1",
  content: "hello"
};

const envCreds = {
  LINE_CHANNEL_ACCESS_TOKEN: "env-access-token",
  LINE_CHANNEL_SECRET: "env-channel-secret"
};

const dbRuntime: ChannelRuntimeConfig = {
  tenantId: TENANT_A,
  channel: "LINE",
  enabled: true,
  providerPageId: null,
  providerAccountName: null,
  secrets: { accessToken: "db-access-token", channelSecret: "db-channel-secret" }
};

function baseDeps(overrides: Record<string, unknown> = {}) {
  return {
    channelAdapterRegistry: {
      get: (channel: string) => ({
        channel,
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => ({ externalMessageId: "ext-env" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    messageRepository: {
      create: async () => {
        throw new Error("not used");
      },
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: {
      hasProcessed: async () => false,
      markProcessed: async () => {}
    },
    ...overrides
  };
}

async function withMockLinePushFetch(run: (captureAuth: () => string | null) => Promise<void>) {
  let authHeader: string | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const headers = init?.headers;
    if (headers && typeof headers === "object" && !Array.isArray(headers)) {
      const auth = (headers as Record<string, string>).Authorization;
      if (typeof auth === "string") authHeader = auth;
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };
  try {
    await run(() => authHeader);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("ENV_ONLY path uses channelAdapterRegistry for LINE (no resolver)", async () => {
  let registryUsed = false;
  const useCase = new SendOutboundMessageUseCase(
    baseDeps({
      channelAdapterRegistry: {
        get: (channel: string) => {
          registryUsed = channel === "LINE";
          return {
            channel: "LINE",
            receiveMessage: async () => {
              throw new Error("not used");
            },
            sendMessage: async () => ({ externalMessageId: "ext-1" }),
            fetchUserProfile: async () => ({}),
            fetchConversationThread: async () => []
          };
        }
      }
    }) as any
  );
  await useCase.execute(linePayload);
  assert.equal(registryUsed, true);
});

test("DB_WITH_ENV_FALLBACK uses DB token on LINE push when runtime config is available", async () => {
  const resolver = createLineOutboundAdapterResolver({
    mode: "DB_WITH_ENV_FALLBACK",
    env: envCreds,
    channelSettingRepository: {
      getRuntimeConfig: async () => dbRuntime,
      findByTenantAndChannel: async () => null
    } as any
  });

  const useCase = new SendOutboundMessageUseCase(
    baseDeps({
      lineOutboundAdapterResolver: {
        resolve: (tenantId: string) => resolver.resolve(tenantId)
      }
    }) as any
  );

  await withMockLinePushFetch(async (getAuth) => {
    await useCase.execute(linePayload);
    assert.equal(getAuth(), "Bearer db-access-token");
  });
});

test("DB_WITH_ENV_FALLBACK falls back to env token when DB runtime is missing", async () => {
  const resolver = createLineOutboundAdapterResolver({
    mode: "DB_WITH_ENV_FALLBACK",
    env: envCreds,
    channelSettingRepository: {
      getRuntimeConfig: async () => null,
      findByTenantAndChannel: async () => null
    } as any
  });

  const useCase = new SendOutboundMessageUseCase(
    baseDeps({
      lineOutboundAdapterResolver: {
        resolve: (tenantId: string) => resolver.resolve(tenantId)
      }
    }) as any
  );

  await withMockLinePushFetch(async (getAuth) => {
    await useCase.execute(linePayload);
    assert.equal(getAuth(), "Bearer env-access-token");
  });
});

test("DB_ONLY fails safely without leaking secrets when DB config missing", async () => {
  const resolver = createLineOutboundAdapterResolver({
    mode: "DB_ONLY",
    env: envCreds,
    channelSettingRepository: {
      getRuntimeConfig: async () => null,
      findByTenantAndChannel: async () => null
    } as any
  });

  const useCase = new SendOutboundMessageUseCase(
    baseDeps({
      lineOutboundAdapterResolver: {
        resolve: (tenantId: string) => resolver.resolve(tenantId)
      }
    }) as any
  );

  await assert.rejects(
    () => useCase.execute(linePayload),
    (err: Error) => {
      assert.equal(err.message.includes("env-access-token"), false);
      assert.equal(err.message.includes("db-access-token"), false);
      return true;
    }
  );
});

test("Facebook outbound still uses registry when LINE resolver is configured", async () => {
  let facebookRegistry = false;
  let lineResolverCalled = false;
  const useCase = new SendOutboundMessageUseCase(
    baseDeps({
      lineOutboundAdapterResolver: {
        resolve: async () => {
          lineResolverCalled = true;
          throw new Error("LINE resolver should not run for Facebook");
        }
      },
      channelAdapterRegistry: {
        get: (channel: string) => {
          if (channel === "FACEBOOK") facebookRegistry = true;
          return {
            channel: "FACEBOOK",
            receiveMessage: async () => {
              throw new Error("not used");
            },
            sendMessage: async () => ({ externalMessageId: "fb-1" }),
            fetchUserProfile: async () => ({}),
            fetchConversationThread: async () => []
          };
        }
      },
      conversationRepository: {
        findById: async () => ({
          id: "conv-fb",
          tenantId: TENANT_A,
          leadId: "lead-1",
          channel: "FACEBOOK",
          channelThreadId: "user:123",
          providerThreadType: "MESSENGER_DM",
          providerPageId: "page-1",
          providerExternalUserId: "123",
          providerCommentId: null,
          privateReplySentAt: null,
          status: "OPEN",
          assignmentStatus: "ASSIGNED",
          assignedAgentId: null
        })
      }
    }) as any
  );

  const fbPayload: OutboundMessageRequestedPayload = {
    ...linePayload,
    channel: "FACEBOOK",
    channelThreadId: "user:123",
    messageId: "fb-msg-1"
  };

  await useCase.execute(fbPayload);
  assert.equal(facebookRegistry, true);
  assert.equal(lineResolverCalled, false);
});

test("inbound LINE webhook route does not import LINE outbound runtime resolver", () => {
  const source = readFileSync(new URL("../../interfaces/api/webhook/line.ts", import.meta.url), "utf8");
  assert.equal(source.includes("lineOutboundRuntimeConfig"), false);
  assert.equal(source.includes("createLineOutboundAdapterResolver"), false);
  assert.equal(source.includes("HUBCHAT_LINE_RUNTIME_CONFIG_MODE"), false);
});

test("worker wires LINE runtime mode without changing inbound media env token path", () => {
  const source = readFileSync(new URL("../../worker/main.ts", import.meta.url), "utf8");
  assert.match(source, /parseLineRuntimeConfigMode/);
  assert.match(source, /lineOutboundAdapterResolver/);
  assert.match(source, /lineChannelAccessToken: env\.LINE_CHANNEL_ACCESS_TOKEN/);
  assert.match(source, /isChannelConnectResolverEnabled/);
});
