import test from "node:test";
import assert from "node:assert/strict";
import { SendOutboundMessageUseCase } from "./sendOutboundMessage.js";
import type { OutboundMessageRequestedPayload } from "../../domain/events.js";

test("duplicate outbound event does not send twice", async () => {
  let sendCount = 0;
  let idempotencyChecks = 0;

  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca00",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "LINE",
    channelThreadId: "Ue56f7d11e481c3e0f8d0924f68b2c673",
    content: "hello"
  };

  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "LINE",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          sendCount += 1;
          return { externalMessageId: "ext-1" };
        },
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
    activityLogRepository: {
      create: async () => {}
    },
    rateLimiter: {
      checkOrThrow: async () => {}
    },
    idempotency: {
      hasProcessed: async () => {
        idempotencyChecks += 1;
        return idempotencyChecks > 1;
      },
      markProcessed: async () => {}
    }
  });

  await useCase.execute(payload);
  await useCase.execute(payload);

  assert.equal(sendCount, 1);
});

test("image outbound payload is forwarded to channel adapter", async () => {
  let captured: any = null;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca01",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "LINE",
    channelThreadId: "Ue56f7d11e481c3e0f8d0924f68b2c673",
    content: "",
    messageType: "IMAGE",
    mediaUrl: "https://example.com/image.webp",
    mediaMimeType: "image/webp"
  };

  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "LINE",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async (input: any) => {
          captured = input;
          return { externalMessageId: "ext-2" };
        },
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
    }
  });

  await useCase.execute(payload);
  assert.equal(captured.messageType, "IMAGE");
  assert.equal(captured.mediaUrl, "https://example.com/image.webp");
});

test("document outbound payload is forwarded to channel adapter", async () => {
  let captured: any = null;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca09",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "FACEBOOK",
    channelThreadId: "user:123",
    content: "[document]",
    messageType: "DOCUMENT_PDF",
    mediaUrl: "https://example.com/file.pdf",
    mediaMimeType: "application/pdf",
    fileName: "file.pdf"
  };

  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async (input: any) => {
          captured = input;
          return { externalMessageId: "ext-3" };
        },
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
    }
  });

  await useCase.execute(payload);
  assert.equal(captured.messageType, "DOCUMENT_PDF");
  assert.equal(captured.mediaMimeType, "application/pdf");
  assert.equal(captured.fileName, "file.pdf");
});

function buildFacebookConversation(overrides?: Record<string, unknown>) {
  return {
    id: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    channelType: "FACEBOOK",
    channelThreadId: "comment:123_456",
    providerThreadType: "FACEBOOK_COMMENT",
    providerCommentId: "123_456",
    providerPageId: "page_1",
    providerExternalUserId: "987654",
    privateReplySentAt: null,
    facebookPublicReplySentAt: null,
    status: "OPEN",
    lastMessageAt: new Date(),
    ...overrides
  } as any;
}

test("new facebook comment sends public acknowledgement once", async () => {
  let publicReplyCount = 0;
  let markedPublicReplySent = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca10",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "FACEBOOK",
    channelThreadId: "comment:123_456",
    content: "hello from admin",
    messageType: "TEXT"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => { throw new Error("not used"); },
        sendMessage: async () => ({ externalMessageId: "dm-1" }),
        sendPrivateReply: async () => ({ externalMessageId: "pr-1" }),
        sendPublicCommentReply: async (input: { text: string }) => {
          publicReplyCount += 1;
          assert.equal(input.text, "ขอบคุณที่ทักมา ทาง Admin จะตอบกลับผ่านทาง Inbox นะครับ");
          return { externalMessageId: "pub-1" };
        },
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () => buildFacebookConversation(),
      findFacebookMessengerDmByParticipant: async () => null,
      markFacebookCommentPrivateReplySent: async () => {},
      markFacebookPublicReplySent: async () => { markedPublicReplySent += 1; }
    } as any,
    messageRepository: { create: async () => { throw new Error("not used"); }, markSent: async () => {}, markFailed: async () => {}, listByConversation: async () => ({ items: [], nextCursor: null }) },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} }
  });
  await useCase.execute(payload);
  assert.equal(publicReplyCount, 1);
  assert.equal(markedPublicReplySent, 1);
});

test("facebook composer text sends to messenger dm not public reply", async () => {
  let dmSendCount = 0;
  let privateReplyCount = 0;
  let sentPageId: string | null = null;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca11",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "FACEBOOK",
    channelThreadId: "comment:123_456",
    content: "admin composer text"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => { throw new Error("not used"); },
        sendMessage: async (input: { channelThreadId: string; pageId?: string | null }) => {
          dmSendCount += 1;
          assert.equal(input.channelThreadId, "user:987654");
          sentPageId = input.pageId ?? null;
          return { externalMessageId: "dm-2" };
        },
        sendPrivateReply: async () => {
          privateReplyCount += 1;
          return { externalMessageId: "pr-2" };
        },
        sendPublicCommentReply: async () => ({ externalMessageId: "pub-2" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () => buildFacebookConversation(),
      findFacebookMessengerDmByParticipant: async () => buildFacebookConversation({ id: "dm-conv", providerThreadType: "MESSENGER_DM", channelThreadId: "user:987654" })
    } as any,
    messageRepository: { create: async () => { throw new Error("not used"); }, markSent: async () => {}, markFailed: async () => {}, listByConversation: async () => ({ items: [], nextCursor: null }) },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} }
  });
  await useCase.execute(payload);
  assert.equal(dmSendCount, 1);
  assert.equal(privateReplyCount, 0);
  assert.equal(sentPageId, "page_1");
});

test("facebook comment row still uses messenger send when dm conversation exists", async () => {
  let sentToThread: string | null = null;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca12",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "FACEBOOK",
    channelThreadId: "comment:123_456",
    content: "follow-up"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => { throw new Error("not used"); },
        sendMessage: async (input: { channelThreadId: string }) => {
          sentToThread = input.channelThreadId;
          return { externalMessageId: "dm-3" };
        },
        sendPrivateReply: async () => ({ externalMessageId: "pr-3" }),
        sendPublicCommentReply: async () => ({ externalMessageId: "pub-3" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () => buildFacebookConversation(),
      findFacebookMessengerDmByParticipant: async () => buildFacebookConversation({ id: "dm-conv-2", providerThreadType: "MESSENGER_DM", channelThreadId: "user:987654" })
    } as any,
    messageRepository: { create: async () => { throw new Error("not used"); }, markSent: async () => {}, markFailed: async () => {}, listByConversation: async () => ({ items: [], nextCursor: null }) },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} }
  });
  await useCase.execute(payload);
  assert.equal(sentToThread, "user:987654");
});

test("no dm route uses private reply once then second outbound uses messenger send", async () => {
  let privateReplyCount = 0;
  let sendCount = 0;
  let lookupCount = 0;
  let conversationState = buildFacebookConversation();
  const basePayload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca13",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "FACEBOOK",
    channelThreadId: "comment:123_456",
    content: "open dm"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => { throw new Error("not used"); },
        sendMessage: async (input: { channelThreadId: string }) => {
          sendCount += 1;
          assert.equal(input.channelThreadId, "user:987654");
          return { externalMessageId: `dm-${sendCount}` };
        },
        sendPrivateReply: async () => {
          privateReplyCount += 1;
          return { externalMessageId: "pr-4" };
        },
        sendPublicCommentReply: async () => ({ externalMessageId: "pub-4" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () => conversationState,
      findFacebookMessengerDmByParticipant: async () => {
        lookupCount += 1;
        return null;
      },
      markFacebookCommentPrivateReplySent: async () => {
        conversationState = buildFacebookConversation({
          providerThreadType: "MESSENGER_DM",
          channelThreadId: "user:987654",
          privateReplySentAt: new Date()
        });
      },
      markFacebookPublicReplySent: async () => {}
    } as any,
    messageRepository: { create: async () => { throw new Error("not used"); }, markSent: async () => {}, markFailed: async () => {}, listByConversation: async () => ({ items: [], nextCursor: null }) },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: {
      hasProcessed: async (_scope: string, key: string) => false,
      markProcessed: async () => {}
    }
  });
  await useCase.execute(basePayload);
  await useCase.execute({ ...basePayload, messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca14", content: "second message" });
  assert.equal(privateReplyCount, 1);
  assert.equal(sendCount, 1);
  assert.equal(lookupCount, 1);
});

test("media outbound never uses private reply fallback", async () => {
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca15",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "FACEBOOK",
    channelThreadId: "comment:123_456",
    content: "[image]",
    messageType: "IMAGE",
    mediaUrl: "https://example.com/img.png",
    mediaMimeType: "image/png"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => { throw new Error("not used"); },
        sendMessage: async () => ({ externalMessageId: "dm-5" }),
        sendPrivateReply: async () => ({ externalMessageId: "pr-5" }),
        sendPublicCommentReply: async () => ({ externalMessageId: "pub-5" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () => buildFacebookConversation(),
      findFacebookMessengerDmByParticipant: async () => null
    } as any,
    messageRepository: { create: async () => { throw new Error("not used"); }, markSent: async () => {}, markFailed: async () => {}, listByConversation: async () => ({ items: [], nextCursor: null }) },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} }
  });
  await assert.rejects(useCase.execute(payload), /text-only private reply/);
});

test("facebook private reply preserves real provider error", async () => {
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca16",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "FACEBOOK",
    channelThreadId: "comment:123_456",
    content: "hello"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => { throw new Error("not used"); },
        sendMessage: async () => ({ externalMessageId: "dm-6" }),
        sendPrivateReply: async () => {
          throw new Error('Facebook Private Reply API error: {"message":"Invalid PSID"}');
        },
        sendPublicCommentReply: async () => ({ externalMessageId: "pub-6" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () => buildFacebookConversation(),
      findFacebookMessengerDmByParticipant: async () => null
    } as any,
    messageRepository: { create: async () => { throw new Error("not used"); }, markSent: async () => {}, markFailed: async () => {}, listByConversation: async () => ({ items: [], nextCursor: null }) },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} }
  });
  await assert.rejects(useCase.execute(payload), /Invalid PSID/);
});

test("public comment acknowledgement failure does not block dm composer send", async () => {
  let sendCount = 0;
  let privateReplyCount = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca17",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "FACEBOOK",
    channelThreadId: "comment:123_456",
    content: "dm message"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => { throw new Error("not used"); },
        sendMessage: async (input: { channelThreadId: string }) => {
          sendCount += 1;
          assert.equal(input.channelThreadId, "user:987654");
          return { externalMessageId: "dm-7" };
        },
        sendPrivateReply: async () => {
          privateReplyCount += 1;
          return { externalMessageId: "pr-7" };
        },
        sendPublicCommentReply: async () => {
          throw new Error("public reply API down");
        },
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () => buildFacebookConversation(),
      findFacebookMessengerDmByParticipant: async () =>
        buildFacebookConversation({ id: "dm-conv-7", providerThreadType: "MESSENGER_DM", channelThreadId: "user:987654" })
    } as any,
    messageRepository: { create: async () => { throw new Error("not used"); }, markSent: async () => {}, markFailed: async () => {}, listByConversation: async () => ({ items: [], nextCursor: null }) },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} }
  });
  await useCase.execute(payload);
  assert.equal(sendCount, 1);
  assert.equal(privateReplyCount, 0);
});

test("FACEBOOK_COMMENT selected but grouped MESSENGER_DM id exists uses Messenger Send API", async () => {
  let sendCount = 0;
  let privateReplyCount = 0;
  let capturedRouteUsed: string | null = null;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca18",
    conversationId: "comment-conv",
    conversationIds: ["comment-conv", "dm-conv-grouped"],
    channel: "FACEBOOK",
    channelThreadId: "comment:123_456",
    content: "hello"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => { throw new Error("not used"); },
        sendMessage: async (input: { channelThreadId: string; pageId?: string | null }) => {
          sendCount += 1;
          assert.equal(input.channelThreadId, "user:987654");
          assert.equal(input.pageId, "page_1");
          return { externalMessageId: "dm-group-1" };
        },
        sendPrivateReply: async () => {
          privateReplyCount += 1;
          return { externalMessageId: "pr-group-1" };
        },
        sendPublicCommentReply: async () => ({ externalMessageId: "pub-group-1" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async (_tenantId: string, conversationId: string) =>
        conversationId === "dm-conv-grouped"
          ? buildFacebookConversation({
              id: "dm-conv-grouped",
              providerThreadType: "MESSENGER_DM",
              channelThreadId: "user:987654"
            })
          : buildFacebookConversation({ id: "comment-conv" }),
      findFacebookMessengerDmByParticipant: async () => null
    } as any,
    messageRepository: { create: async () => { throw new Error("not used"); }, markSent: async () => {}, markFailed: async () => {}, listByConversation: async () => ({ items: [], nextCursor: null }) },
    activityLogRepository: {
      create: async (input: { metadataJson?: { routeUsed?: string | null } }) => {
        capturedRouteUsed = input.metadataJson?.routeUsed ?? null;
      }
    },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} }
  });
  await useCase.execute(payload);
  assert.equal(sendCount, 1);
  assert.equal(privateReplyCount, 0);
  assert.equal(capturedRouteUsed, "MESSENGER_SEND");
});

test("resolver ignores invalid comment-shaped MESSENGER_DM target and chooses valid user target", async () => {
  let sentThread: string | null = null;
  let privateReplyCount = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca18b",
    conversationId: "comment-conv",
    conversationIds: ["comment-conv", "dm-conv-invalid", "dm-conv-valid"],
    channel: "FACEBOOK",
    channelThreadId: "comment:122098025780693891_1278672180548121",
    content: "hello"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => { throw new Error("not used"); },
        sendMessage: async (input: { channelThreadId: string }) => {
          sentThread = input.channelThreadId;
          return { externalMessageId: "dm-group-valid-1" };
        },
        sendPrivateReply: async () => {
          privateReplyCount += 1;
          return { externalMessageId: "pr-group-invalid-1" };
        },
        sendPublicCommentReply: async () => ({ externalMessageId: "pub-group-invalid-1" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async (_tenantId: string, conversationId: string) => {
        if (conversationId === "dm-conv-invalid") {
          return buildFacebookConversation({
            id: "dm-conv-invalid",
            providerThreadType: "MESSENGER_DM",
            channelThreadId: "122098025780693891_1278672180548121",
            providerPageId: "page_1",
            providerExternalUserId: "987654"
          });
        }
        if (conversationId === "dm-conv-valid") {
          return buildFacebookConversation({
            id: "dm-conv-valid",
            providerThreadType: "MESSENGER_DM",
            channelThreadId: "user:27244508575134096",
            providerPageId: "page_1",
            providerExternalUserId: "987654"
          });
        }
        return buildFacebookConversation({ id: "comment-conv" });
      },
      findFacebookMessengerDmByParticipant: async () => null
    } as any,
    messageRepository: { create: async () => { throw new Error("not used"); }, markSent: async () => {}, markFailed: async () => {}, listByConversation: async () => ({ items: [], nextCursor: null }) },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} }
  });
  await useCase.execute(payload);
  assert.equal(sentThread, "user:27244508575134096");
  assert.equal(privateReplyCount, 0);
});

test("public acknowledgement uses public comment reply API and not private reply", async () => {
  let publicAckCount = 0;
  let privateReplyCount = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca19",
    conversationId: "comment-conv",
    channel: "FACEBOOK",
    channelThreadId: "comment:123_456",
    content: "open dm"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => { throw new Error("not used"); },
        sendMessage: async () => ({ externalMessageId: "dm-ack-1" }),
        sendPrivateReply: async () => {
          privateReplyCount += 1;
          return { externalMessageId: "pr-ack-1" };
        },
        sendPublicCommentReply: async () => {
          publicAckCount += 1;
          return { externalMessageId: "pub-ack-1" };
        },
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () => buildFacebookConversation({ id: "comment-conv" }),
      findFacebookMessengerDmByParticipant: async () =>
        buildFacebookConversation({
          id: "dm-conv-ack",
          providerThreadType: "MESSENGER_DM",
          channelThreadId: "user:987654"
        }),
      markFacebookCommentPrivateReplySent: async () => {}
    } as any,
    messageRepository: { create: async () => { throw new Error("not used"); }, markSent: async () => {}, markFailed: async () => {}, listByConversation: async () => ({ items: [], nextCursor: null }) },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} }
  });
  await useCase.execute(payload);
  assert.equal(publicAckCount, 1);
  assert.equal(privateReplyCount, 0);
});

test("uses private reply only as first-contact fallback when no DM route exists", async () => {
  let privateReplyCount = 0;
  let messengerSendCount = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca19-fallback",
    conversationId: "comment-conv",
    channel: "FACEBOOK",
    channelThreadId: "comment:123_456",
    content: "first contact"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => { throw new Error("not used"); },
        sendMessage: async () => {
          messengerSendCount += 1;
          return { externalMessageId: "dm-fallback-1" };
        },
        sendPrivateReply: async () => {
          privateReplyCount += 1;
          return { externalMessageId: "pr-fallback-1" };
        },
        sendPublicCommentReply: async () => ({ externalMessageId: "pub-fallback-1" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () => buildFacebookConversation({ id: "comment-conv" }),
      findFacebookMessengerDmByParticipant: async () => null,
      markFacebookCommentPrivateReplySent: async () => {}
    } as any,
    messageRepository: { create: async () => { throw new Error("not used"); }, markSent: async () => {}, markFailed: async () => {}, listByConversation: async () => ({ items: [], nextCursor: null }) },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} }
  });
  await useCase.execute(payload);
  assert.equal(privateReplyCount, 1);
  assert.equal(messengerSendCount, 0);
});

test("missing provider_comment_id prevents private reply API call", async () => {
  let privateReplyCount = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca20",
    conversationId: "comment-conv",
    channel: "FACEBOOK",
    channelThreadId: "comment:",
    content: "open dm"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => { throw new Error("not used"); },
        sendMessage: async () => ({ externalMessageId: "dm-missing-1" }),
        sendPrivateReply: async () => {
          privateReplyCount += 1;
          return { externalMessageId: "pr-missing-1" };
        },
        sendPublicCommentReply: async () => ({ externalMessageId: "pub-missing-1" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () =>
        buildFacebookConversation({
          id: "comment-conv",
          providerCommentId: null,
          channelThreadId: "comment:"
        }),
      findFacebookMessengerDmByParticipant: async () => null
    } as any,
    messageRepository: { create: async () => { throw new Error("not used"); }, markSent: async () => {}, markFailed: async () => {}, listByConversation: async () => ({ items: [], nextCursor: null }) },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} }
  });
  await assert.rejects(useCase.execute(payload), /Cannot use Private Reply without provider_comment_id/);
  assert.equal(privateReplyCount, 0);
});

test("Meta error is preserved in markFailed and not replaced", async () => {
  let markedError = "";
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca21",
    conversationId: "comment-conv",
    channel: "FACEBOOK",
    channelThreadId: "comment:123_456",
    content: "hello"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => { throw new Error("not used"); },
        sendMessage: async () => ({ externalMessageId: "dm-error-1" }),
        sendPrivateReply: async () => {
          throw new Error("Facebook Private Reply API error: {\"message\":\"Unsupported post request\"}");
        },
        sendPublicCommentReply: async () => ({ externalMessageId: "pub-error-1" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () => buildFacebookConversation({ id: "comment-conv" }),
      findFacebookMessengerDmByParticipant: async () => null
    } as any,
    messageRepository: {
      create: async () => { throw new Error("not used"); },
      markSent: async () => {},
      markFailed: async (_id: string, reason: string) => {
        markedError = reason;
      },
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} }
  });
  await assert.rejects(useCase.execute(payload), /Unsupported post request/);
  assert.match(markedError, /Unsupported post request/);
});

test("falls back to repository DM lookup when conversationIds missing", async () => {
  let sendCount = 0;
  let privateReplyCount = 0;
  let lookupArgs: { tenantId: string; providerPageId: string; providerExternalUserId: string } | null = null;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca22",
    conversationId: "comment-conv",
    channel: "FACEBOOK",
    channelThreadId: "comment:123_456",
    content: "hello"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => { throw new Error("not used"); },
        sendMessage: async () => {
          sendCount += 1;
          return { externalMessageId: "dm-lookup-1" };
        },
        sendPrivateReply: async () => {
          privateReplyCount += 1;
          return { externalMessageId: "pr-lookup-1" };
        },
        sendPublicCommentReply: async () => ({ externalMessageId: "pub-lookup-1" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () => buildFacebookConversation({ id: "comment-conv" }),
      findFacebookMessengerDmByParticipant: async (input: {
        tenantId: string; providerPageId: string; providerExternalUserId: string;
      }) => {
        lookupArgs = input;
        return buildFacebookConversation({
          id: "dm-conv",
          providerThreadType: "MESSENGER_DM",
          channelThreadId: "user:987654"
        });
      }
    } as any,
    messageRepository: { create: async () => { throw new Error("not used"); }, markSent: async () => {}, markFailed: async () => {}, listByConversation: async () => ({ items: [], nextCursor: null }) },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} }
  });
  await useCase.execute(payload);
  assert.deepEqual(lookupArgs, {
    tenantId: payload.tenantId,
    providerPageId: "page_1",
    providerExternalUserId: "987654"
  });
  assert.equal(sendCount, 1);
  assert.equal(privateReplyCount, 0);
});

test("line outbound never attempts facebook public comment reply", async () => {
  let lineSendCount = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca16",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "LINE",
    channelThreadId: "U123",
    content: "hello"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "LINE",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          lineSendCount += 1;
          return { externalMessageId: "line-1" };
        },
        sendPublicCommentReply: async () => {
          throw new Error("should not be called");
        },
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
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} }
  });
  await useCase.execute(payload);
  assert.equal(lineSendCount, 1);
});
