import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SendOutboundMessageUseCase } from "./sendOutboundMessage.js";
import type { OutboundMessageRequestedPayload } from "../../domain/events.js";
import { createInstagramOutboundAdapterResolver } from "../instagramOutbound/createInstagramOutboundAdapterResolver.js";
import type { ChannelRuntimeConfig } from "../../domain/channelSettings.js";

const TENANT_A = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

function fakePageAccessToken(suffix: string): string {
  return `EA${suffix.repeat(78)}`;
}

const igPayload: OutboundMessageRequestedPayload = {
  tenantId: TENANT_A,
  leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
  messageId: "ig-msg-runtime-1",
  conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
  channel: "INSTAGRAM",
  channelThreadId: "ig:user:17841400000000000",
  content: "hello"
};

const envCreds = {
  FACEBOOK_PAGE_ACCESS_TOKEN: fakePageAccessToken("E"),
  FACEBOOK_PAGE_ID: "env-page-id"
};

const dbRuntime: ChannelRuntimeConfig = {
  tenantId: TENANT_A,
  channel: "INSTAGRAM",
  enabled: true,
  providerPageId: "db-page-id",
  providerAccountName: null,
  secrets: {
    accessToken: fakePageAccessToken("D"),
    appSecret: "db-app-secret-value",
    verifyToken: "db-verify-token-value"
  }
};

const igConversation = {
  id: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
  tenantId: TENANT_A,
  leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
  channelType: "INSTAGRAM",
  channelThreadId: "ig:user:17841400000000000",
  providerThreadType: "INSTAGRAM_DM",
  providerPageId: "17841411111111111",
  providerExternalUserId: "17841400000000000",
  status: "OPEN",
  lastMessageAt: new Date()
};

function baseDeps(overrides: Record<string, unknown> = {}) {
  return {
    channelAdapterRegistry: {
      get: (channel: string) => ({
        channel,
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => ({ externalMessageId: "ig-env-1" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () => igConversation
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

async function withMockInstagramGraphFetch(run: (getAccessToken: () => string | null) => Promise<void>) {
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

test("ENV_ONLY uses channelAdapterRegistry for Instagram (no resolver)", async () => {
  let registryUsed = false;
  const useCase = new SendOutboundMessageUseCase(
    baseDeps({
      channelAdapterRegistry: {
        get: (channel: string) => {
          registryUsed = channel === "INSTAGRAM";
          return {
            channel: "INSTAGRAM",
            receiveMessage: async () => {
              throw new Error("not used");
            },
            sendMessage: async () => ({ externalMessageId: "ig-1" }),
            fetchUserProfile: async () => ({}),
            fetchConversationThread: async () => []
          };
        }
      }
    }) as any
  );
  await useCase.execute(igPayload);
  assert.equal(registryUsed, true);
});

test("DB_WITH_ENV_FALLBACK uses DB page token on Instagram DM send", async () => {
  const resolver = createInstagramOutboundAdapterResolver({
    mode: "DB_WITH_ENV_FALLBACK",
    env: envCreds,
    channelSettingRepository: {
      getRuntimeConfig: async () => dbRuntime,
      findByTenantAndChannel: async () => null
    } as any
  });

  const useCase = new SendOutboundMessageUseCase(
    baseDeps({
      instagramOutboundAdapterResolver: {
        resolve: (tenantId: string) => resolver.resolve(tenantId)
      }
    }) as any
  );

  await withMockInstagramGraphFetch(async (getToken) => {
    await useCase.execute(igPayload);
    assert.equal(getToken(), fakePageAccessToken("D"));
  });
});

test("DB_WITH_ENV_FALLBACK falls back to env token when DB runtime missing", async () => {
  const resolver = createInstagramOutboundAdapterResolver({
    mode: "DB_WITH_ENV_FALLBACK",
    env: envCreds,
    channelSettingRepository: {
      getRuntimeConfig: async () => null,
      findByTenantAndChannel: async () => null
    } as any
  });

  const useCase = new SendOutboundMessageUseCase(
    baseDeps({
      instagramOutboundAdapterResolver: {
        resolve: (tenantId: string) => resolver.resolve(tenantId)
      }
    }) as any
  );

  await withMockInstagramGraphFetch(async (getToken) => {
    await useCase.execute(igPayload);
    assert.equal(getToken(), fakePageAccessToken("E"));
  });
});

test("DB_ONLY fails safely without leaking secrets when DB config missing", async () => {
  const resolver = createInstagramOutboundAdapterResolver({
    mode: "DB_ONLY",
    env: envCreds,
    channelSettingRepository: {
      getRuntimeConfig: async () => null,
      findByTenantAndChannel: async () => null
    } as any
  });

  const useCase = new SendOutboundMessageUseCase(
    baseDeps({
      instagramOutboundAdapterResolver: {
        resolve: (tenantId: string) => resolver.resolve(tenantId)
      }
    }) as any
  );

  await assert.rejects(
    () => useCase.execute(igPayload),
    (err: Error) => {
      assert.equal(err.message.includes(fakePageAccessToken("E")), false);
      assert.equal(err.message.includes(fakePageAccessToken("D")), false);
      assert.equal(err.message.includes("db-app-secret-value"), false);
      return true;
    }
  );
});

test("LINE and Facebook outbound still use registry when Instagram resolver is configured", async () => {
  let lineRegistry = false;
  let facebookRegistry = false;
  let instagramResolverCalled = false;
  const fbConversation = {
    id: "conv-fb-1",
    tenantId: TENANT_A,
    leadId: "lead-1",
    channel: "FACEBOOK",
    channelThreadId: "user:987654",
    providerThreadType: "MESSENGER_DM",
    providerPageId: "fb-page-id",
    providerExternalUserId: "987654",
    providerCommentId: null,
    privateReplySentAt: null,
    status: "OPEN",
    assignmentStatus: "ASSIGNED",
    assignedAgentId: null
  };
  const useCase = new SendOutboundMessageUseCase(
    baseDeps({
      instagramOutboundAdapterResolver: {
        resolve: async () => {
          instagramResolverCalled = true;
          throw new Error("Instagram resolver should not run for LINE/Facebook");
        }
      },
      conversationRepository: {
        findById: async (_tenantId: string, conversationId: string) => {
          if (conversationId === "conv-fb-1") return fbConversation;
          return igConversation;
        },
        findFacebookMessengerDmByParticipant: async () => null
      },
      channelAdapterRegistry: {
        get: (channel: string) => {
          if (channel === "LINE") lineRegistry = true;
          if (channel === "FACEBOOK") facebookRegistry = true;
          return {
            channel,
            receiveMessage: async () => {
              throw new Error("not used");
            },
            sendMessage: async () => ({ externalMessageId: "x-1" }),
            fetchUserProfile: async () => ({}),
            fetchConversationThread: async () => []
          };
        }
      }
    }) as any
  );

  const linePayload: OutboundMessageRequestedPayload = {
    ...igPayload,
    channel: "LINE",
    channelThreadId: "U123",
    messageId: "line-msg-1"
  };
  const fbPayload: OutboundMessageRequestedPayload = {
    ...igPayload,
    channel: "FACEBOOK",
    conversationId: "conv-fb-1",
    channelThreadId: "user:987654",
    messageId: "fb-msg-1"
  };

  await useCase.execute(linePayload);
  await useCase.execute(fbPayload);
  assert.equal(lineRegistry, true);
  assert.equal(facebookRegistry, true);
  assert.equal(instagramResolverCalled, false);
});

test("inbound Instagram webhook route does not import Instagram outbound runtime resolver", () => {
  const source = readFileSync(new URL("../../interfaces/api/webhook/instagram.ts", import.meta.url), "utf8");
  assert.equal(source.includes("instagramOutboundRuntimeConfig"), false);
  assert.equal(source.includes("createInstagramOutboundAdapterResolver"), false);
  assert.equal(source.includes("HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE"), false);
});

test("worker wires Instagram runtime mode", () => {
  const source = readFileSync(new URL("../../worker/main.ts", import.meta.url), "utf8");
  assert.match(source, /parseInstagramRuntimeConfigMode/);
  assert.match(source, /instagramOutboundAdapterResolver/);
  assert.match(source, /HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE/);
});
