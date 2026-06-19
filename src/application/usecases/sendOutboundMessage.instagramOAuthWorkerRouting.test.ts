import test from "node:test";
import assert from "node:assert/strict";
import { SendOutboundMessageUseCase } from "./sendOutboundMessage.js";
import type { OutboundMessageRequestedPayload } from "../../domain/events.js";
import type { ConversationRepository } from "../../domain/ports.js";
import { TerminalOutboundDeliveryError } from "../../lib/outboundDeliveryError.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const CONNECTION = "cc111111-1111-4111-8111-111111111111";

const igConversation = {
  id: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
  tenantId: TENANT,
  leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
  channelType: "INSTAGRAM" as const,
  channelThreadId: "ig:user:959986016929726",
  providerThreadType: "INSTAGRAM_DM" as const,
  providerPageId: "17841411111111111",
  providerExternalUserId: "959986016929726",
  status: "OPEN" as const,
  lastMessageAt: new Date()
};

function oauthPayload(
  overrides: Partial<OutboundMessageRequestedPayload> = {}
): OutboundMessageRequestedPayload {
  return {
    tenantId: TENANT,
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "msg-oauth-worker-1",
    conversationId: igConversation.id,
    channel: "INSTAGRAM",
    channelThreadId: "ig:user:959986016929726",
    content: "hello oauth",
    messageType: "TEXT",
    instagramCredentialBinding: {
      mode: "CONNECTION_BOUND",
      contractVersion: 1,
      provider: "INSTAGRAM",
      authFamily: "INSTAGRAM_BUSINESS_LOGIN",
      deliveryPath: "DATABASE_ONLY",
      channelConnectionId: CONNECTION,
      messageKind: "TEXT"
    },
    ...overrides
  };
}

function buildUseCase(overrides: Record<string, unknown> = {}) {
  let legacySendCalls = 0;
  let oauthTextCalls = 0;
  let oauthImageCalls = 0;
  let markedSentExternalId: string | null = null;

  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "INSTAGRAM",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          legacySendCalls += 1;
          return { externalMessageId: "legacy-mid" };
        },
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () => igConversation
    } as unknown as ConversationRepository,
    messageRepository: {
      create: async () => {
        throw new Error("not used");
      },
      markSent: async (_id: string, externalMessageId: string) => {
        markedSentExternalId = externalMessageId;
      },
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: {
      hasProcessed: async () => false,
      markProcessed: async () => {}
    },
    instagramOAuthTextDelivery: {
      sendText: async () => {
        oauthTextCalls += 1;
        return { externalMessageId: "oauth-text-mid" };
      }
    },
    instagramOAuthImageDelivery: {
      sendImage: async () => {
        oauthImageCalls += 1;
        return { externalMessageId: "oauth-image-mid" };
      }
    },
    workerEnv: {
      HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED: "true",
      HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED: "true",
      HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED: "true",
      HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED: "true",
      HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED: "true"
    },
    ...overrides
  });

  return {
    useCase,
    getCounts: () => ({ legacySendCalls, oauthTextCalls, oauthImageCalls, markedSentExternalId })
  };
}

test("OAuth text binding routes to OAuth text service only", async () => {
  const { useCase, getCounts } = buildUseCase();
  await useCase.execute(oauthPayload());
  const counts = getCounts();
  assert.equal(counts.oauthTextCalls, 1);
  assert.equal(counts.oauthImageCalls, 0);
  assert.equal(counts.legacySendCalls, 0);
  assert.equal(counts.markedSentExternalId, "oauth-text-mid");
});

test("OAuth image binding routes to OAuth image service only", async () => {
  const { useCase, getCounts } = buildUseCase();
  await useCase.execute(
    oauthPayload({
      messageType: "IMAGE",
      mediaUrl: "https://cdn.example.com/photo.jpg",
      mediaMimeType: "image/jpeg",
      instagramCredentialBinding: {
        mode: "CONNECTION_BOUND",
        contractVersion: 1,
        provider: "INSTAGRAM",
        authFamily: "INSTAGRAM_BUSINESS_LOGIN",
        deliveryPath: "DATABASE_ONLY",
        channelConnectionId: CONNECTION,
        messageKind: "IMAGE"
      }
    })
  );
  const counts = getCounts();
  assert.equal(counts.oauthImageCalls, 1);
  assert.equal(counts.oauthTextCalls, 0);
  assert.equal(counts.legacySendCalls, 0);
});

test("legacy Instagram job uses legacy adapter only", async () => {
  const { useCase, getCounts } = buildUseCase();
  await useCase.execute({ ...oauthPayload(), instagramCredentialBinding: undefined });
  const counts = getCounts();
  assert.equal(counts.legacySendCalls, 1);
  assert.equal(counts.oauthTextCalls, 0);
  assert.equal(counts.oauthImageCalls, 0);
});

test("worker routing flag OFF does not invoke OAuth provider", async () => {
  const { useCase, getCounts } = buildUseCase({
    workerEnv: {
      HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED: "false",
      HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED: "true",
      HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED: "true",
      HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED: "true"
    }
  });
  await assert.rejects(() => useCase.execute(oauthPayload()), TerminalOutboundDeliveryError);
  const counts = getCounts();
  assert.equal(counts.oauthTextCalls, 0);
  assert.equal(counts.legacySendCalls, 0);
});

test("OAuth job never invokes legacy adapter when routing enabled", async () => {
  const { useCase, getCounts } = buildUseCase();
  await useCase.execute(oauthPayload());
  assert.equal(getCounts().legacySendCalls, 0);
});

test("invalid OAuth binding invokes neither adapter nor OAuth service", async () => {
  const { useCase, getCounts } = buildUseCase();
  await assert.rejects(
    () =>
      useCase.execute({
        ...oauthPayload(),
        instagramCredentialBinding: {
          mode: "CONNECTION_BOUND",
          contractVersion: 1,
          provider: "INSTAGRAM",
          authFamily: "INSTAGRAM_BUSINESS_LOGIN",
          deliveryPath: "DATABASE_ONLY",
          channelConnectionId: "not-a-uuid",
          messageKind: "TEXT"
        }
      }),
    TerminalOutboundDeliveryError
  );
  const counts = getCounts();
  assert.equal(counts.oauthTextCalls, 0);
  assert.equal(counts.legacySendCalls, 0);
});
