import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SendOutboundMessageUseCase } from "./sendOutboundMessage.js";
import type { OutboundMessageRequestedPayload } from "../../domain/events.js";
import { createFacebookOutboundAdapterResolver } from "../facebookOutbound/createFacebookOutboundAdapterResolver.js";
import type { ChannelRuntimeConfig } from "../../domain/channelSettings.js";

const TENANT_A = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

const fbPayload: OutboundMessageRequestedPayload = {
  tenantId: TENANT_A,
  leadId: "lead-1",
  messageId: "fb-msg-runtime-1",
  conversationId: "conv-fb-1",
  channel: "FACEBOOK",
  channelThreadId: "user:987654",
  content: "hello"
};

const envCreds = {
  FACEBOOK_PAGE_ACCESS_TOKEN: "env-page-access-token",
  FACEBOOK_PAGE_ID: "env-page-id"
};

const dbRuntime: ChannelRuntimeConfig = {
  tenantId: TENANT_A,
  channel: "FACEBOOK",
  enabled: true,
  providerPageId: "db-page-id",
  providerAccountName: null,
  secrets: {
    accessToken: "db-page-access-token",
    appSecret: "db-app-secret-value",
    verifyToken: "db-verify-token-value"
  }
};

const fbConversation = {
  id: "conv-fb-1",
  tenantId: TENANT_A,
  leadId: "lead-1",
  channel: "FACEBOOK",
  channelThreadId: "user:987654",
  providerThreadType: "MESSENGER_DM",
  providerPageId: "db-page-id",
  providerExternalUserId: "987654",
  providerCommentId: null,
  privateReplySentAt: null,
  status: "OPEN",
  assignmentStatus: "ASSIGNED",
  assignedAgentId: null
};

function baseDeps(overrides: Record<string, unknown> = {}) {
  return {
    channelAdapterRegistry: {
      get: (channel: string) => ({
        channel,
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => ({ externalMessageId: "fb-env-1" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () => fbConversation,
      findFacebookMessengerDmByParticipant: async () => null
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

async function withMockFacebookGraphFetch(run: (getAccessToken: () => string | null) => Promise<void>) {
  let accessToken: string | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.hostname.includes("graph.facebook.com")) {
      accessToken = parsed.searchParams.get("access_token");
      return new Response(JSON.stringify({ message_id: "m1" }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };
  try {
    await run(() => accessToken);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("ENV_ONLY uses channelAdapterRegistry for Facebook (no resolver)", async () => {
  let registryUsed = false;
  const useCase = new SendOutboundMessageUseCase(
    baseDeps({
      channelAdapterRegistry: {
        get: (channel: string) => {
          registryUsed = channel === "FACEBOOK";
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
      }
    }) as any
  );
  await useCase.execute(fbPayload);
  assert.equal(registryUsed, true);
});

test("DB_WITH_ENV_FALLBACK uses DB page token on Facebook Messenger send", async () => {
  const resolver = createFacebookOutboundAdapterResolver({
    mode: "DB_WITH_ENV_FALLBACK",
    env: envCreds,
    channelSettingRepository: {
      getRuntimeConfig: async () => dbRuntime,
      findByTenantAndChannel: async () => null
    } as any
  });

  const useCase = new SendOutboundMessageUseCase(
    baseDeps({
      facebookOutboundAdapterResolver: {
        resolve: (tenantId: string) => resolver.resolve(tenantId)
      }
    }) as any
  );

  await withMockFacebookGraphFetch(async (getToken) => {
    await useCase.execute(fbPayload);
    assert.equal(getToken(), "db-page-access-token");
  });
});

test("DB_WITH_ENV_FALLBACK falls back to env token when DB runtime missing", async () => {
  const resolver = createFacebookOutboundAdapterResolver({
    mode: "DB_WITH_ENV_FALLBACK",
    env: envCreds,
    channelSettingRepository: {
      getRuntimeConfig: async () => null,
      findByTenantAndChannel: async () => null
    } as any
  });

  const useCase = new SendOutboundMessageUseCase(
    baseDeps({
      facebookOutboundAdapterResolver: {
        resolve: (tenantId: string) => resolver.resolve(tenantId)
      }
    }) as any
  );

  await withMockFacebookGraphFetch(async (getToken) => {
    await useCase.execute(fbPayload);
    assert.equal(getToken(), "env-page-access-token");
  });
});

test("DB_ONLY fails safely without leaking secrets when DB config missing", async () => {
  const resolver = createFacebookOutboundAdapterResolver({
    mode: "DB_ONLY",
    env: envCreds,
    channelSettingRepository: {
      getRuntimeConfig: async () => null,
      findByTenantAndChannel: async () => null
    } as any
  });

  const useCase = new SendOutboundMessageUseCase(
    baseDeps({
      facebookOutboundAdapterResolver: {
        resolve: (tenantId: string) => resolver.resolve(tenantId)
      }
    }) as any
  );

  await assert.rejects(
    () => useCase.execute(fbPayload),
    (err: Error) => {
      assert.equal(err.message.includes("env-page-access-token"), false);
      assert.equal(err.message.includes("db-page-access-token"), false);
      return true;
    }
  );
});

test("LINE outbound still uses registry when Facebook resolver is configured", async () => {
  let lineRegistry = false;
  let facebookResolverCalled = false;
  const useCase = new SendOutboundMessageUseCase(
    baseDeps({
      facebookOutboundAdapterResolver: {
        resolve: async () => {
          facebookResolverCalled = true;
          throw new Error("Facebook resolver should not run for LINE");
        }
      },
      channelAdapterRegistry: {
        get: (channel: string) => {
          if (channel === "LINE") lineRegistry = true;
          return {
            channel: "LINE",
            receiveMessage: async () => {
              throw new Error("not used");
            },
            sendMessage: async () => ({ externalMessageId: "line-1" }),
            fetchUserProfile: async () => ({}),
            fetchConversationThread: async () => []
          };
        }
      }
    }) as any
  );

  const linePayload: OutboundMessageRequestedPayload = {
    ...fbPayload,
    channel: "LINE",
    channelThreadId: "U123",
    messageId: "line-msg-1"
  };
  await useCase.execute(linePayload);
  assert.equal(lineRegistry, true);
  assert.equal(facebookResolverCalled, false);
});

test("inbound Facebook webhook route does not import Facebook outbound runtime resolver", () => {
  const source = readFileSync(new URL("../../interfaces/api/webhook/facebook.ts", import.meta.url), "utf8");
  assert.equal(source.includes("facebookOutboundRuntimeConfig"), false);
  assert.equal(source.includes("createFacebookOutboundAdapterResolver"), false);
  assert.equal(source.includes("HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE"), false);
});

test("worker wires Facebook runtime mode", () => {
  const source = readFileSync(new URL("../../worker/main.ts", import.meta.url), "utf8");
  assert.match(source, /parseFacebookRuntimeConfigMode/);
  assert.match(source, /facebookOutboundAdapterResolver/);
  assert.match(source, /HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE/);
});
