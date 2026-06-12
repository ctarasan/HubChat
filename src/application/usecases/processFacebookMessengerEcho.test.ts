import test from "node:test";
import assert from "node:assert/strict";
import { ProcessFacebookMessengerEchoUseCase } from "./processFacebookMessengerEcho.js";
import type { FacebookMessengerEchoNormalizedPayload } from "../../domain/events.js";
import type { Conversation, Message, SenderType } from "../../domain/entities.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const PAGE_ID = "1137356672785125";
const CUSTOMER_PSID = "customer_psid_99";

function makeEchoPayload(
  overrides?: Partial<FacebookMessengerEchoNormalizedPayload>
): FacebookMessengerEchoNormalizedPayload {
  return {
    webhookIngestKind: "facebook_messenger_echo",
    tenantId: TENANT_ID,
    channel: "FACEBOOK",
    externalMessageId: "mid.echo.uc.1",
    customerPsid: CUSTOMER_PSID,
    channelThreadId: CUSTOMER_PSID,
    text: "Native Messenger reply",
    messageType: "TEXT",
    occurredAt: new Date().toISOString(),
    facebookPageId: PAGE_ID,
    ...overrides
  };
}

function makeConversation(overrides?: Partial<Conversation>): Conversation {
  return {
    id: "conv-fb-1",
    tenantId: TENANT_ID,
    leadId: "lead-fb-1",
    channelType: "FACEBOOK",
    channelThreadId: CUSTOMER_PSID,
    status: "OPEN",
    lastMessageAt: new Date(),
    ...overrides
  };
}

test("ProcessFacebookMessengerEchoUseCase inserts one OUTBOUND message for native echo", async () => {
  let created: Omit<Message, "id" | "createdAt"> | null = null;
  const useCase = new ProcessFacebookMessengerEchoUseCase({
    conversationRepository: {
      findFacebookMessengerDmByParticipant: async () => makeConversation(),
      findByThread: async () => null,
      touchLastMessage: async () => {},
      recordAgentOutboundSent: async () => {},
      create: async () => {
        throw new Error("not used");
      },
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
    },
    messageRepository: {
      findByTenantChannelExternalMessageId: async () => null,
      create: async (data) => {
        created = data;
        return { id: "msg-new", ...data, createdAt: new Date() };
      },
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} }
  });

  const result = await useCase.execute(makeEchoPayload());
  assert.equal(result, "inserted");
  assert.ok(created);
  const inserted = created as Omit<Message, "id" | "createdAt">;
  assert.equal(inserted.direction, "OUTBOUND");
  assert.equal(inserted.channelType, "FACEBOOK");
  assert.equal(inserted.externalMessageId, "mid.echo.uc.1");
  assert.equal(inserted.senderType, "SYSTEM");
  assert.equal(inserted.metadataJson?.outbound_origin, "facebook_native_echo");
  assert.equal(inserted.metadataJson?.delivery_status, "SENT");
});

test("ProcessFacebookMessengerEchoUseCase resolves conversation by customer PSID via DM participant lookup", async () => {
  let lookupPsid: string | null = null;
  const useCase = new ProcessFacebookMessengerEchoUseCase({
    conversationRepository: {
      findFacebookMessengerDmByParticipant: async (input) => {
        lookupPsid = input.providerExternalUserId;
        return makeConversation();
      },
      findByThread: async () => {
        throw new Error("should not fall back when DM lookup succeeds");
      },
      touchLastMessage: async () => {},
      recordAgentOutboundSent: async () => {},
      create: async () => {
        throw new Error("not used");
      },
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
    },
    messageRepository: {
      findByTenantChannelExternalMessageId: async () => null,
      create: async (data) => ({ id: "msg-new", ...data, createdAt: new Date() }),
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} }
  });

  const result = await useCase.execute(makeEchoPayload());
  assert.equal(result, "inserted");
  assert.equal(lookupPsid, CUSTOMER_PSID);
});

test("ProcessFacebookMessengerEchoUseCase never creates conversations or leads for Page sender echo", async () => {
  const useCase = new ProcessFacebookMessengerEchoUseCase({
    conversationRepository: {
      findFacebookMessengerDmByParticipant: async (input) => {
        assert.notEqual(input.providerExternalUserId, PAGE_ID);
        return makeConversation();
      },
      findByThread: async () => null,
      touchLastMessage: async () => {},
      recordAgentOutboundSent: async () => {},
      create: async () => {
        throw new Error("conversation create must not run for echo");
      },
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
    },
    messageRepository: {
      findByTenantChannelExternalMessageId: async () => null,
      create: async (data) => ({ id: "msg-new", ...data, createdAt: new Date() }),
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} }
  });

  const result = await useCase.execute(makeEchoPayload());
  assert.equal(result, "inserted");
});

test("ProcessFacebookMessengerEchoUseCase deduplicates HubChat-originated outbound by mid", async () => {
  let markSentCalls = 0;
  const useCase = new ProcessFacebookMessengerEchoUseCase({
    conversationRepository: {
      findFacebookMessengerDmByParticipant: async () => makeConversation(),
      findByThread: async () => null,
      touchLastMessage: async () => {
        throw new Error("should not touch on dedupe");
      },
      recordAgentOutboundSent: async () => {
        throw new Error("should not record on dedupe");
      },
      create: async () => {
        throw new Error("not used");
      },
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
    },
    messageRepository: {
      findByTenantChannelExternalMessageId: async () => ({
        id: "msg-existing",
        tenantId: TENANT_ID,
        conversationId: "conv-fb-1",
        channelType: "FACEBOOK",
        externalMessageId: "mid.echo.uc.1",
        messageType: "TEXT",
        direction: "OUTBOUND",
        senderType: "SALES" satisfies SenderType,
        content: "from hubchat",
        occurredAt: new Date(),
        createdAt: new Date(),
        metadataJson: { delivery_status: "PENDING" }
      }),
      getDeliverySnapshot: async () => ({ externalMessageId: "mid.echo.uc.1", deliveryStatus: "PENDING" }),
      markSent: async () => {
        markSentCalls += 1;
      },
      create: async () => {
        throw new Error("create must not run when mid exists");
      },
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} }
  });

  const result = await useCase.execute(makeEchoPayload());
  assert.equal(result, "deduplicated");
  assert.equal(markSentCalls, 1);
});

test("ProcessFacebookMessengerEchoUseCase duplicate echo delivery remains idempotent", async () => {
  let createCalls = 0;
  const useCase = new ProcessFacebookMessengerEchoUseCase({
    conversationRepository: {
      findFacebookMessengerDmByParticipant: async () => makeConversation(),
      findByThread: async () => null,
      touchLastMessage: async () => {},
      recordAgentOutboundSent: async () => {},
      create: async () => {
        throw new Error("not used");
      },
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
    },
    messageRepository: {
      findByTenantChannelExternalMessageId: async () => ({
        id: "msg-existing",
        tenantId: TENANT_ID,
        conversationId: "conv-fb-1",
        channelType: "FACEBOOK",
        externalMessageId: "mid.echo.uc.1",
        messageType: "TEXT",
        direction: "OUTBOUND",
        senderType: "SYSTEM",
        content: "native",
        occurredAt: new Date(),
        createdAt: new Date(),
        metadataJson: { delivery_status: "SENT" }
      }),
      getDeliverySnapshot: async () => ({ externalMessageId: "mid.echo.uc.1", deliveryStatus: "SENT" }),
      markSent: async () => {
        throw new Error("must not downgrade or rewrite sent message");
      },
      create: async () => {
        createCalls += 1;
        return { id: "msg-new", tenantId: TENANT_ID, conversationId: "conv-fb-1", channelType: "FACEBOOK", externalMessageId: "mid.echo.uc.1", messageType: "TEXT", direction: "OUTBOUND", senderType: "SYSTEM", content: "native", occurredAt: new Date(), createdAt: new Date() };
      },
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} }
  });

  const result = await useCase.execute(makeEchoPayload());
  assert.equal(result, "deduplicated");
  assert.equal(createCalls, 0);
});

test("ProcessFacebookMessengerEchoUseCase returns conversation_not_found without insert", async () => {
  let createCalls = 0;
  const useCase = new ProcessFacebookMessengerEchoUseCase({
    conversationRepository: {
      findFacebookMessengerDmByParticipant: async () => null,
      findByThread: async () => null,
      touchLastMessage: async () => {},
      create: async () => {
        throw new Error("not used");
      },
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
    },
    messageRepository: {
      findByTenantChannelExternalMessageId: async () => null,
      create: async () => {
        createCalls += 1;
        return { id: "msg-new", tenantId: TENANT_ID, conversationId: "conv-fb-1", channelType: "FACEBOOK", externalMessageId: "mid.echo.uc.1", messageType: "TEXT", direction: "OUTBOUND", senderType: "SYSTEM", content: "native", occurredAt: new Date(), createdAt: new Date() };
      },
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} }
  });

  const result = await useCase.execute(makeEchoPayload());
  assert.equal(result, "conversation_not_found");
  assert.equal(createCalls, 0);
});

test("ProcessFacebookMessengerEchoUseCase invalid payload without mid fails safe", async () => {
  const useCase = new ProcessFacebookMessengerEchoUseCase({
    conversationRepository: {
      findByThread: async () => null,
      touchLastMessage: async () => {},
      create: async () => {
        throw new Error("not used");
      },
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
    },
    messageRepository: {
      create: async () => {
        throw new Error("not used");
      },
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} }
  });

  const result = await useCase.execute(makeEchoPayload({ externalMessageId: "   " }));
  assert.equal(result, "invalid_payload");
});
