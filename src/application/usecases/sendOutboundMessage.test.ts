import test from "node:test";
import assert from "node:assert/strict";
import { SendOutboundMessageUseCase } from "./sendOutboundMessage.js";
import type { OutboundMessageRequestedPayload } from "../../domain/events.js";
import { InstagramGraphApiError } from "../../infrastructure/adapters/channels/instagramGraphApiError.js";
import type { MessageDeliveryFailurePayload } from "../../domain/ports.js";
import {
  RetryableOutboundDeliveryError,
  TerminalOutboundDeliveryError,
  TH_MSG_INSTAGRAM_OUTSIDE_ALLOWED_WINDOW,
  INTERNAL_CODE_FACEBOOK_API_TEMPORARY_ERROR,
  INTERNAL_CODE_FACEBOOK_TOKEN_EXPIRED,
  INTERNAL_CODE_OUTBOUND_IDEMPOTENCY_PENDING,
  TH_MSG_FACEBOOK_TOKEN_EXPIRED
} from "../../lib/outboundDeliveryError.js";

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

test("idempotency skip without finalized message throws RetryableOutboundDeliveryError", async () => {
  let sendCount = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca77",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "INSTAGRAM",
    channelThreadId: "ig:user:959986016929726",
    content: "hello"
  };

  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "INSTAGRAM",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          sendCount += 1;
          return { externalMessageId: "ig-mid-1" };
        },
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () => ({
        id: payload.conversationId,
        tenantId: payload.tenantId,
        leadId: payload.leadId,
        channelType: "INSTAGRAM",
        channelThreadId: payload.channelThreadId,
        providerThreadType: "INSTAGRAM_DM",
        assignedAgentId: null,
        status: "OPEN",
        lastMessageAt: new Date()
      })
    } as any,
    messageRepository: {
      create: async () => {
        throw new Error("not used");
      },
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null }),
      getDeliverySnapshot: async () => ({
        externalMessageId: null,
        deliveryStatus: "PENDING"
      })
    },
    activityLogRepository: {
      create: async () => {}
    },
    rateLimiter: {
      checkOrThrow: async () => {}
    },
    idempotency: {
      hasProcessed: async () => true,
      markProcessed: async () => {}
    }
  });

  await assert.rejects(
    () => useCase.execute(payload),
    (err: unknown) => {
      assert.ok(err instanceof RetryableOutboundDeliveryError);
      assert.equal(err.deliveryErrorCode, INTERNAL_CODE_OUTBOUND_IDEMPOTENCY_PENDING);
      return true;
    }
  );
  assert.equal(sendCount, 0);
});

test("idempotency skip is safe when message delivery is already SENT", async () => {
  let sendCount = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca78",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "INSTAGRAM",
    channelThreadId: "ig:user:959986016929726",
    content: "hello"
  };

  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "INSTAGRAM",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          sendCount += 1;
          return { externalMessageId: "ig-mid-2" };
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
      listByConversation: async () => ({ items: [], nextCursor: null }),
      getDeliverySnapshot: async () => ({
        externalMessageId: "ig-mid-existing",
        deliveryStatus: "SENT"
      })
    },
    activityLogRepository: {
      create: async () => {}
    },
    rateLimiter: {
      checkOrThrow: async () => {}
    },
    idempotency: {
      hasProcessed: async () => true,
      markProcessed: async () => {}
    }
  });

  await useCase.execute(payload);
  assert.equal(sendCount, 0);
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

function buildInstagramConversation(overrides?: Record<string, unknown>) {
  return {
    id: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    channelType: "INSTAGRAM",
    channelThreadId: "ig:user:17841400000000000",
    providerThreadType: "INSTAGRAM_DM",
    /** Webhook IG business/recipient-style id - must not be forwarded as Graph `/{page}/messages`. */
    providerPageId: "17841411111111111",
    providerExternalUserId: "17841400000000000",
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

test("MESSENGER_DM selected still sends grouped comment public acknowledgement once", async () => {
  let publicReplyCount = 0;
  let markedConversationId: string | null = null;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca18c",
    conversationId: "dm-conv-selected",
    conversationIds: ["dm-conv-selected", "comment-conv-unsent"],
    channel: "FACEBOOK",
    channelThreadId: "user:987654",
    content: "follow up"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => ({ externalMessageId: "dm-group-ack-1" }),
        sendPrivateReply: async () => ({ externalMessageId: "pr-group-ack-1" }),
        sendPublicCommentReply: async () => {
          publicReplyCount += 1;
          return { externalMessageId: "pub-group-ack-1" };
        },
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async (_tenantId: string, conversationId: string) => {
        if (conversationId === "dm-conv-selected") {
          return buildFacebookConversation({
            id: "dm-conv-selected",
            providerThreadType: "MESSENGER_DM",
            channelThreadId: "user:987654",
            providerCommentId: null
          });
        }
        if (conversationId === "comment-conv-unsent") {
          return buildFacebookConversation({
            id: "comment-conv-unsent",
            providerThreadType: "FACEBOOK_COMMENT",
            channelThreadId: "comment:123_456",
            providerCommentId: "123_456",
            facebookPublicReplySentAt: null
          });
        }
        return null;
      },
      markFacebookPublicReplySent: async (conversationId: string) => {
        markedConversationId = conversationId;
      }
    } as any,
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
  assert.equal(publicReplyCount, 1);
  assert.equal(markedConversationId, "comment-conv-unsent");
});

test("MESSENGER_DM selected sends public acknowledgement via participant fallback when conversationIds missing", async () => {
  let publicReplyCount = 0;
  let markedConversationId: string | null = null;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca18d",
    conversationId: "dm-conv-selected",
    channel: "FACEBOOK",
    channelThreadId: "user:987654",
    content: "follow up"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => ({ externalMessageId: "dm-group-ack-fallback-1" }),
        sendPrivateReply: async () => ({ externalMessageId: "pr-group-ack-fallback-1" }),
        sendPublicCommentReply: async () => {
          publicReplyCount += 1;
          return { externalMessageId: "pub-group-ack-fallback-1" };
        },
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () =>
        buildFacebookConversation({
          id: "dm-conv-selected",
          providerThreadType: "MESSENGER_DM",
          channelThreadId: "user:987654",
          providerCommentId: null
        }),
      findLatestFacebookCommentByParticipant: async () =>
        buildFacebookConversation({
          id: "comment-conv-fallback",
          providerThreadType: "FACEBOOK_COMMENT",
          channelThreadId: "comment:123_456",
          providerCommentId: "123_456",
          facebookPublicReplySentAt: null
        }),
      markFacebookPublicReplySent: async (conversationId: string) => {
        markedConversationId = conversationId;
      }
    } as any,
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
  assert.equal(publicReplyCount, 1);
  assert.equal(markedConversationId, "comment-conv-fallback");
});

test("MESSENGER_DM selected falls back to lead-based comment acknowledgement when external user id missing", async () => {
  let publicReplyCount = 0;
  let markedConversationId: string | null = null;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca18e",
    conversationId: "dm-conv-selected",
    channel: "FACEBOOK",
    channelThreadId: "user:987654",
    content: "follow up"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => ({ externalMessageId: "dm-group-ack-lead-1" }),
        sendPrivateReply: async () => ({ externalMessageId: "pr-group-ack-lead-1" }),
        sendPublicCommentReply: async () => {
          publicReplyCount += 1;
          return { externalMessageId: "pub-group-ack-lead-1" };
        },
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () =>
        buildFacebookConversation({
          id: "dm-conv-selected",
          providerThreadType: "MESSENGER_DM",
          channelThreadId: "user:987654",
          providerExternalUserId: null
        }),
      findLatestFacebookCommentByParticipant: async () => null,
      findLatestFacebookCommentByLead: async () =>
        buildFacebookConversation({
          id: "comment-conv-by-lead",
          providerThreadType: "FACEBOOK_COMMENT",
          channelThreadId: "comment:123_456",
          providerCommentId: "123_456",
          facebookPublicReplySentAt: null
        }),
      markFacebookPublicReplySent: async (conversationId: string) => {
        markedConversationId = conversationId;
      }
    } as any,
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
  assert.equal(publicReplyCount, 1);
  assert.equal(markedConversationId, "comment-conv-by-lead");
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

test("Meta error is preserved on retryable Facebook failure (technicalSummary, no immediate markFailed)", async () => {
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
  try {
    await useCase.execute(payload);
    assert.fail("expected RetryableOutboundDeliveryError");
  } catch (e) {
    assert.ok(e instanceof RetryableOutboundDeliveryError);
    assert.match(e.technicalSummary, /Unsupported post request/);
  }
  assert.equal(markedError, "");
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

test("Messenger outside-window error is preserved with user-friendly message", async () => {
  let markedError = "";
  let privateReplyCount = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca30",
    conversationId: "dm-conv-outside-window",
    channel: "FACEBOOK",
    channelThreadId: "user:987654",
    content: "hello"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          throw new Error(
            'Facebook Send API failed (500): {"error":{"message":"This message is being sent outside the allowed window","type":"OAuthException","code":10,"error_subcode":2018278,"fbtrace_id":"TRACE123"}}'
          );
        },
        sendPrivateReply: async () => {
          privateReplyCount += 1;
          return { externalMessageId: "pr-should-not-run" };
        },
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () =>
        buildFacebookConversation({
          id: "dm-conv-outside-window",
          providerThreadType: "MESSENGER_DM",
          channelThreadId: "user:987654",
          providerCommentId: null
        })
    } as any,
    messageRepository: {
      create: async () => {
        throw new Error("not used");
      },
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
  await assert.rejects(useCase.execute(payload), /outside the allowed window/);
  assert.match(markedError, /outside-window \(10\/2018278\)/);
  assert.match(markedError, /ไม่สามารถส่งข้อความผ่าน Messenger ได้/);
  assert.equal(privateReplyCount, 0);
});

test("comment-origin text falls back to private reply when outside-window and eligible", async () => {
  let privateReplyCount = 0;
  let sendMessageCount = 0;
  let markedPrivateReply = 0;
  let markSentCount = 0;
  let markFailedCount = 0;
  let capturedFallbackRouteUsed: string | null = null;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca31",
    conversationId: "comment-conv",
    channel: "FACEBOOK",
    channelThreadId: "comment:123_456",
    content: "สนใจตัวไหนครับ"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          sendMessageCount += 1;
          throw new Error(
            'Facebook Send API failed (500): {"error":{"message":"This message is being sent outside the allowed window","type":"OAuthException","code":10,"error_subcode":2018278}}'
          );
        },
        sendPrivateReply: async () => {
          privateReplyCount += 1;
          return { externalMessageId: "pr-fallback-outside-window" };
        },
        sendPublicCommentReply: async () => ({ externalMessageId: "pub-fallback-outside-window" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () => buildFacebookConversation({ id: "comment-conv", lastMessageAt: new Date() }),
      findFacebookMessengerDmByParticipant: async () =>
        buildFacebookConversation({
          id: "dm-conv",
          providerThreadType: "MESSENGER_DM",
          channelThreadId: "user:987654"
        }),
      markFacebookCommentPrivateReplySent: async () => {
        markedPrivateReply += 1;
      }
    } as any,
    messageRepository: {
      create: async () => {
        throw new Error("not used");
      },
      markSent: async () => {
        markSentCount += 1;
      },
      markFailed: async () => {
        markFailedCount += 1;
      },
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: {
      create: async (input: { metadataJson?: { fallbackRouteUsed?: string | null } }) => {
        capturedFallbackRouteUsed = input.metadataJson?.fallbackRouteUsed ?? null;
      }
    },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} }
  });
  await useCase.execute(payload);
  assert.equal(sendMessageCount, 1);
  assert.equal(privateReplyCount, 1);
  assert.equal(markedPrivateReply, 1);
  assert.equal(capturedFallbackRouteUsed, "PRIVATE_REPLY");
  assert.equal(markSentCount, 1);
  assert.equal(markFailedCount, 0);
});

test("outside-window media does not fallback to private reply", async () => {
  let privateReplyCount = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca32",
    conversationId: "comment-conv",
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
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          throw new Error(
            'Facebook Send API failed (500): {"error":{"message":"This message is being sent outside the allowed window","type":"OAuthException","code":10,"error_subcode":2018278}}'
          );
        },
        sendPrivateReply: async () => {
          privateReplyCount += 1;
          return { externalMessageId: "pr-should-not-media" };
        },
        sendPublicCommentReply: async () => ({ externalMessageId: "pub-media" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () => buildFacebookConversation({ id: "comment-conv", lastMessageAt: new Date() }),
      findFacebookMessengerDmByParticipant: async () =>
        buildFacebookConversation({
          id: "dm-conv",
          providerThreadType: "MESSENGER_DM",
          channelThreadId: "user:987654"
        })
    } as any,
    messageRepository: { create: async () => { throw new Error("not used"); }, markSent: async () => {}, markFailed: async () => {}, listByConversation: async () => ({ items: [], nextCursor: null }) },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} }
  });
  await assert.rejects(useCase.execute(payload), /outside the allowed window/);
  assert.equal(privateReplyCount, 0);
});

test("outside-window does not fallback when private reply was already used", async () => {
  let privateReplyCount = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca33",
    conversationId: "comment-conv",
    channel: "FACEBOOK",
    channelThreadId: "comment:123_456",
    content: "follow up"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          throw new Error(
            'Facebook Send API failed (500): {"error":{"message":"This message is being sent outside the allowed window","type":"OAuthException","code":10,"error_subcode":2018278}}'
          );
        },
        sendPrivateReply: async () => {
          privateReplyCount += 1;
          return { externalMessageId: "pr-should-not-repeat" };
        },
        sendPublicCommentReply: async () => ({ externalMessageId: "pub-repeat" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () =>
        buildFacebookConversation({
          id: "comment-conv",
          privateReplySentAt: new Date(),
          lastMessageAt: new Date()
        }),
      findFacebookMessengerDmByParticipant: async () =>
        buildFacebookConversation({
          id: "dm-conv",
          providerThreadType: "MESSENGER_DM",
          channelThreadId: "user:987654"
        })
    } as any,
    messageRepository: { create: async () => { throw new Error("not used"); }, markSent: async () => {}, markFailed: async () => {}, listByConversation: async () => ({ items: [], nextCursor: null }) },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} }
  });
  await assert.rejects(useCase.execute(payload), /outside the allowed window/);
  assert.equal(privateReplyCount, 0);
});

test("outside-window with missing provider_comment_id does not fallback to private reply", async () => {
  let privateReplyCount = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca34",
    conversationId: "comment-conv",
    channel: "FACEBOOK",
    channelThreadId: "comment:123_456",
    content: "hello"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          throw new Error(
            'Facebook Send API failed (500): {"error":{"message":"This message is being sent outside the allowed window","type":"OAuthException","code":10,"error_subcode":2018278}}'
          );
        },
        sendPrivateReply: async () => {
          privateReplyCount += 1;
          return { externalMessageId: "pr-should-not-missing-comment" };
        },
        sendPublicCommentReply: async () => ({ externalMessageId: "pub-missing-comment" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () =>
        buildFacebookConversation({
          id: "comment-conv",
          providerCommentId: null,
          lastMessageAt: new Date()
        }),
      findFacebookMessengerDmByParticipant: async () =>
        buildFacebookConversation({
          id: "dm-conv",
          providerThreadType: "MESSENGER_DM",
          channelThreadId: "user:987654"
        })
    } as any,
    messageRepository: { create: async () => { throw new Error("not used"); }, markSent: async () => {}, markFailed: async () => {}, listByConversation: async () => ({ items: [], nextCursor: null }) },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} }
  });
  await assert.rejects(useCase.execute(payload), /outside the allowed window/);
  assert.equal(privateReplyCount, 0);
});

test("instagram outbound sends via instagram adapter only", async () => {
  let instagramSendCount = 0;
  let privateReplyCount = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca50",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "INSTAGRAM",
    channelThreadId: "ig:user:17841400000000000",
    content: "hello ig"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "INSTAGRAM",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async (input: any) => {
          instagramSendCount += 1;
          assert.equal(input.channelThreadId, "ig:user:17841400000000000");
          assert.equal(input.pageId, null);
          return { externalMessageId: "ig-1" };
        },
        sendPrivateReply: async () => {
          privateReplyCount += 1;
          return { externalMessageId: "should-not-call" };
        },
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    messageRepository: { create: async () => { throw new Error("not used"); }, markSent: async () => {}, markFailed: async () => {}, listByConversation: async () => ({ items: [], nextCursor: null }) },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} },
    conversationRepository: {
      findById: async () => buildInstagramConversation()
    } as any
  });
  await useCase.execute(payload);
  assert.equal(instagramSendCount, 1);
  assert.equal(privateReplyCount, 0);
});

test("Instagram outbound does not pass webhook-style providerPageId through as adapter pageId", async () => {
  let capturedPageId: unknown;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca57",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "INSTAGRAM",
    channelThreadId: "ig:user:17841400000000000",
    content: "ping"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "INSTAGRAM",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async (input: any) => {
          capturedPageId = input.pageId;
          return { externalMessageId: "ig-2" };
        },
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    messageRepository: { create: async () => { throw new Error("not used"); }, markSent: async () => {}, markFailed: async () => {}, listByConversation: async () => ({ items: [], nextCursor: null }) },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} },
    conversationRepository: {
      findById: async () =>
        buildInstagramConversation({
          providerPageId: "17841499999999999"
        })
    } as any
  });
  await useCase.execute(payload);
  assert.equal(capturedPageId, null);
});

test("instagram outside-window error stores structured failure, marks idempotency, throws TerminalOutboundDeliveryError", async () => {
  let markedFailure: string | MessageDeliveryFailurePayload | null = null;
  let idempotencyMarked = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca51",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "INSTAGRAM",
    channelThreadId: "ig:user:17841400000000000",
    content: "hello ig"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "INSTAGRAM",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          throw new InstagramGraphApiError(
            400,
            "/v25.0/1137356672785125/messages",
            {
              message: "(#10) This message is sent outside of allowed window.",
              type: "OAuthException",
              code: 10,
              error_subcode: 2534022,
              fbtrace_id: "IGTRACE"
            },
            "{}"
          );
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
      markFailed: async (_id: string, failure: string | MessageDeliveryFailurePayload) => {
        markedFailure = failure;
      },
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: {
      hasProcessed: async () => false,
      markProcessed: async () => {
        idempotencyMarked += 1;
      }
    },
    conversationRepository: {
      findById: async () => buildInstagramConversation()
    } as any
  });
  await assert.rejects(useCase.execute(payload), (e: unknown) => e instanceof TerminalOutboundDeliveryError);
  assert.ok(markedFailure && typeof markedFailure === "object");
  assert.equal((markedFailure as MessageDeliveryFailurePayload).deliveryErrorCode, "INSTAGRAM_OUTSIDE_ALLOWED_WINDOW");
  assert.equal((markedFailure as MessageDeliveryFailurePayload).userFacingMessage, TH_MSG_INSTAGRAM_OUTSIDE_ALLOWED_WINDOW);
  assert.equal(idempotencyMarked, 1);
});

test("instagram generic Graph error is structured as OUTBOUND_PROVIDER_ERROR and remains retryable", async () => {
  let markedFailure: string | MessageDeliveryFailurePayload | null = null;
  let idempotencyMarked = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca56",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "INSTAGRAM",
    channelThreadId: "ig:user:17841400000000000",
    content: "hello ig"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "INSTAGRAM",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          throw new InstagramGraphApiError(
            400,
            "/v25.0/1137356672785125/messages",
            { message: "not-outside-window", code: 100, error_subcode: 33, fbtrace_id: "FBTR", type: "OAuthException" },
            "{}"
          );
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
      markFailed: async (_id: string, failure: string | MessageDeliveryFailurePayload) => {
        markedFailure = failure;
      },
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: {
      hasProcessed: async () => false,
      markProcessed: async () => {
        idempotencyMarked += 1;
      }
    },
    conversationRepository: {
      findById: async () => buildInstagramConversation()
    } as any
  });
  await assert.rejects(useCase.execute(payload), (e: unknown) => e instanceof RetryableOutboundDeliveryError);
  assert.equal(markedFailure, null);
  assert.equal(idempotencyMarked, 0);
});

test("Facebook Send API metaCode=1 does not mark message failed; throws RetryableOutboundDeliveryError", async () => {
  let markFailedCalls = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca70",
    conversationId: "fb-dm-retry-1",
    channel: "FACEBOOK",
    channelThreadId: "user:111",
    content: "hello fb"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          throw new Error(
            'Facebook Send API failed (500): {"error":{"message":"(#1) An unknown error has occurred.","type":"OAuthException","code":1,"fbtrace_id":"ABC"}}'
          );
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
      markFailed: async () => {
        markFailedCalls += 1;
      },
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} },
    conversationRepository: {
      findById: async () =>
        buildFacebookConversation({
          id: "fb-dm-retry-1",
          providerThreadType: "MESSENGER_DM",
          channelThreadId: "user:111",
          providerPageId: "page_1"
        })
    } as any
  });
  try {
    await useCase.execute(payload);
    assert.fail("expected RetryableOutboundDeliveryError");
  } catch (e) {
    assert.ok(e instanceof RetryableOutboundDeliveryError);
    assert.equal(e.deliveryErrorCode, INTERNAL_CODE_FACEBOOK_API_TEMPORARY_ERROR);
  }
  assert.equal(markFailedCalls, 0);
});

test("Facebook OAuth token expired marks message failed and throws TerminalOutboundDeliveryError", async () => {
  let marked: MessageDeliveryFailurePayload | null = null;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca71",
    conversationId: "fb-dm-token-1",
    channel: "FACEBOOK",
    channelThreadId: "user:222",
    content: "hello"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          throw new Error(
            'Facebook Send API failed (400): {"error":{"message":"Invalid OAuth access token.","type":"OAuthException","code":190,"fbtrace_id":"X"}}'
          );
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
      markFailed: async (_id: string, failure: string | MessageDeliveryFailurePayload) => {
        marked = typeof failure === "string" ? null : failure;
      },
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} },
    conversationRepository: {
      findById: async () =>
        buildFacebookConversation({
          id: "fb-dm-token-1",
          providerThreadType: "MESSENGER_DM",
          channelThreadId: "user:222",
          providerPageId: "page_1"
        })
    } as any
  });
  await assert.rejects(async () => {
    await useCase.execute(payload);
  });
  const failure = marked as MessageDeliveryFailurePayload | null;
  assert.ok(failure, "expected markFailed with structured payload");
  assert.equal(failure.deliveryErrorCode, INTERNAL_CODE_FACEBOOK_TOKEN_EXPIRED);
  assert.equal(failure.userFacingMessage, TH_MSG_FACEBOOK_TOKEN_EXPIRED);
});

test("instagram outbound IMAGE passes validation and calls adapter sendMessage", async () => {
  let sendCalled = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca52",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "INSTAGRAM",
    channelThreadId: "ig:user:17841400000000000",
    content: "[image]",
    messageType: "IMAGE",
    mediaUrl: "https://example.com/image.jpg",
    mediaMimeType: "image/jpeg"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "INSTAGRAM",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          sendCalled += 1;
          return { externalMessageId: "ig-ext-1" };
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
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} },
    conversationRepository: {
      findById: async () => buildInstagramConversation()
    } as any
  });
  await useCase.execute(payload);
  assert.equal(sendCalled, 1);
});

test("instagram outbound IMAGE over 8MB fails validation before adapter", async () => {
  let sendCalled = 0;
  let markedError = "";
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca55",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "INSTAGRAM",
    channelThreadId: "ig:user:17841400000000000",
    content: "[image]",
    messageType: "IMAGE",
    mediaUrl: "https://example.com/big.jpg",
    mediaMimeType: "image/jpeg",
    fileSizeBytes: 8 * 1024 * 1024 + 1
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "INSTAGRAM",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          sendCalled += 1;
          return { externalMessageId: "x" };
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
      markFailed: async (_id: string, reason: string) => {
        markedError = reason;
      },
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} },
    conversationRepository: {
      findById: async () => buildInstagramConversation()
    } as any
  });
  await assert.rejects(useCase.execute(payload), /8MB/);
  assert.equal(sendCalled, 0);
  assert.match(markedError, /8MB/);
});

test("instagram outbound PDF fails locally before adapter", async () => {
  let sendCalled = 0;
  let markedError = "";
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca53",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "INSTAGRAM",
    channelThreadId: "ig:user:17841400000000000",
    content: "doc",
    messageType: "DOCUMENT_PDF",
    mediaUrl: "https://example.com/x.pdf",
    mediaMimeType: "application/pdf"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "INSTAGRAM",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          sendCalled += 1;
          return { externalMessageId: "x" };
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
      markFailed: async (_id: string, reason: string) => {
        markedError = reason;
      },
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} },
    conversationRepository: {
      findById: async () => buildInstagramConversation()
    } as any
  });
  await assert.rejects(useCase.execute(payload), /Instagram DM does not support PDF attachments yet/);
  assert.equal(sendCalled, 0);
  assert.match(markedError, /Instagram DM does not support PDF attachments yet/);
});

test("instagram outbound IMAGE with http URL fails validation before adapter", async () => {
  let sendCalled = 0;
  let markedError = "";
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca54",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "INSTAGRAM",
    channelThreadId: "ig:user:17841400000000000",
    content: "[image]",
    messageType: "IMAGE",
    mediaUrl: "http://example.com/image.jpg",
    mediaMimeType: "image/jpeg"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "INSTAGRAM",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          sendCalled += 1;
          return { externalMessageId: "x" };
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
      markFailed: async (_id: string, reason: string) => {
        markedError = reason;
      },
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} },
    conversationRepository: {
      findById: async () => buildInstagramConversation()
    } as any
  });
  await assert.rejects(useCase.execute(payload), /Instagram DM image URL must be a valid HTTPS link/);
  assert.equal(sendCalled, 0);
  assert.match(markedError, /Instagram DM image URL must be a valid HTTPS link/);
});

test("instagram outbound rejects wrong channelThreadId shape before sending", async () => {
  let sendCalled = 0;
  let markedError = "";
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca53",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "INSTAGRAM",
    channelThreadId: "959986016929726",
    content: "hi"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "INSTAGRAM",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          sendCalled += 1;
          return { externalMessageId: "x" };
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
      markFailed: async (_id: string, reason: string) => {
        markedError = reason;
      },
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} },
    conversationRepository: {
      findById: async () => buildInstagramConversation()
    } as any
  });
  await assert.rejects(useCase.execute(payload), /ig:user:/);
  assert.equal(sendCalled, 0);
  assert.match(markedError, /ig:user:/);
});

test("instagram outbound rejects empty trimmed content", async () => {
  let sendCalled = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca54",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "INSTAGRAM",
    channelThreadId: "ig:user:1",
    content: "   "
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "INSTAGRAM",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          sendCalled += 1;
          return { externalMessageId: "x" };
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
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} },
    conversationRepository: {
      findById: async () => buildInstagramConversation({ channelThreadId: "ig:user:1" })
    } as any
  });
  await assert.rejects(useCase.execute(payload), /cannot be empty/);
  assert.equal(sendCalled, 0);
});

test("instagram outbound rejects content longer than 1000 UTF-8 bytes", async () => {
  let sendCalled = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca56",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "INSTAGRAM",
    channelThreadId: "ig:user:17841400000000000",
    content: "a".repeat(1001)
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "INSTAGRAM",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          sendCalled += 1;
          return { externalMessageId: "x" };
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
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} },
    conversationRepository: {
      findById: async () => buildInstagramConversation()
    } as any
  });
  await assert.rejects(useCase.execute(payload), /1000 bytes/);
  assert.equal(sendCalled, 0);
});

test("instagram MetaGraphApiError retryable path carries code subcode message fbtrace_id in technicalSummary", async () => {
  let markedFailure: string | MessageDeliveryFailurePayload | null = null;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca55",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "INSTAGRAM",
    channelThreadId: "ig:user:17841400000000000",
    content: "hello"
  };
  const raw = JSON.stringify({ error: { message: "boom", code: 100, error_subcode: 33, fbtrace_id: "FBTR", type: "OAuthException" } });
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "INSTAGRAM",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          throw new InstagramGraphApiError(400, "/v25.0/1137356672785125/messages", { message: "boom", code: 100, error_subcode: 33, fbtrace_id: "FBTR", type: "OAuthException" }, raw);
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
      markFailed: async (_id: string, failure: string | MessageDeliveryFailurePayload) => {
        markedFailure = failure;
      },
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} },
    conversationRepository: {
      findById: async () => buildInstagramConversation()
    } as any
  });
  try {
    await useCase.execute(payload);
    assert.fail("expected RetryableOutboundDeliveryError");
  } catch (e) {
    assert.ok(e instanceof RetryableOutboundDeliveryError);
    const tech = e.technicalSummary;
    assert.match(tech, /boom/);
    assert.match(tech, /code=100/);
    assert.match(tech, /subcode=33/);
    assert.match(tech, /fbtrace_id=FBTR/);
    assert.match(tech, /type=OAuthException/);
  }
  assert.equal(markedFailure, null);
});

test("LINE success calls recordAgentOutboundSent after markSent", async () => {
  const order: string[] = [];
  let recorded: any = null;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca70",
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
        sendMessage: async () => ({ externalMessageId: "ext-line-ts" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      recordAgentOutboundSent: async (input: { tenantId: string; conversationId: string; sentAt: Date }) => {
        order.push("record");
        recorded = input;
      }
    } as any,
    messageRepository: {
      create: async () => {
        throw new Error("not used");
      },
      markSent: async () => {
        order.push("markSent");
      },
      markFailed: async () => {
        order.push("markFailed");
      },
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} }
  });
  await useCase.execute(payload);
  assert.deepEqual(order, ["markSent", "record"]);
  assert.ok(recorded);
  assert.equal(recorded.tenantId, payload.tenantId);
  assert.equal(recorded.conversationId, payload.conversationId);
  assert.ok(recorded.sentAt instanceof Date);
});

test("Messenger outside-window terminal error does not call recordAgentOutboundSent", async () => {
  let recordCalls = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca71",
    conversationId: "dm-conv-outside-window",
    channel: "FACEBOOK",
    channelThreadId: "user:987654",
    content: "hello"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          throw new Error(
            'Facebook Send API failed (500): {"error":{"message":"This message is being sent outside the allowed window","type":"OAuthException","code":10,"error_subcode":2018278,"fbtrace_id":"TRACE123"}}'
          );
        },
        sendPrivateReply: async () => ({ externalMessageId: "pr-should-not-run" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () =>
        buildFacebookConversation({
          id: "dm-conv-outside-window",
          providerThreadType: "MESSENGER_DM",
          channelThreadId: "user:987654",
          providerCommentId: null
        }),
      recordAgentOutboundSent: async () => {
        recordCalls += 1;
      }
    } as any,
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
  await assert.rejects(useCase.execute(payload), /outside the allowed window/);
  assert.equal(recordCalls, 0);
});

test("Facebook private reply success calls recordAgentOutboundSent after markSent", async () => {
  const order: string[] = [];
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca72",
    conversationId: "comment-conv-pr-ts",
    channel: "FACEBOOK",
    channelThreadId: "comment:123_456",
    content: "open dm text"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          throw new Error("not used");
        },
        sendPrivateReply: async () => ({ externalMessageId: "pr-only-route" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () =>
        buildFacebookConversation({
          id: "comment-conv-pr-ts",
          facebookPublicReplySentAt: new Date("2026-01-01T00:00:00.000Z"),
          privateReplySentAt: null,
          lastMessageAt: new Date()
        }),
      findFacebookMessengerDmByParticipant: async () => null,
      markFacebookCommentPrivateReplySent: async () => {},
      recordAgentOutboundSent: async () => {
        order.push("record");
      }
    } as any,
    messageRepository: {
      create: async () => {
        throw new Error("not used");
      },
      markSent: async () => {
        order.push("markSent");
      },
      markFailed: async () => {
        order.push("markFailed");
      },
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} }
  });
  await useCase.execute(payload);
  assert.deepEqual(order, ["markSent", "record"]);
});

test("Facebook outside-window private reply fallback calls recordAgentOutboundSent after markSent", async () => {
  const order: string[] = [];
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca73",
    conversationId: "comment-conv-fallback-ts",
    channel: "FACEBOOK",
    channelThreadId: "comment:789_012",
    content: "fallback pr"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          throw new Error(
            'Facebook Send API failed (500): {"error":{"message":"This message is being sent outside the allowed window","type":"OAuthException","code":10,"error_subcode":2018278}}'
          );
        },
        sendPrivateReply: async () => ({ externalMessageId: "pr-fallback-ts" }),
        sendPublicCommentReply: async () => ({ externalMessageId: "pub-fallback-ts" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () =>
        buildFacebookConversation({
          id: "comment-conv-fallback-ts",
          providerCommentId: "789_012",
          lastMessageAt: new Date()
        }),
      findFacebookMessengerDmByParticipant: async () =>
        buildFacebookConversation({
          id: "dm-conv-fb",
          providerThreadType: "MESSENGER_DM",
          channelThreadId: "user:987654"
        }),
      markFacebookCommentPrivateReplySent: async () => {},
      recordAgentOutboundSent: async () => {
        order.push("record");
      }
    } as any,
    messageRepository: {
      create: async () => {
        throw new Error("not used");
      },
      markSent: async () => {
        order.push("markSent");
      },
      markFailed: async () => {
        order.push("markFailed");
      },
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} }
  });
  await useCase.execute(payload);
  assert.deepEqual(order, ["markSent", "record"]);
});

test("first agent reply promotes NEW lead to CONTACTED", async () => {
  let patchedStatus: string | undefined;
  const activityLogs: unknown[] = [];
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca99",
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
        sendMessage: async () => ({ externalMessageId: "ext-promote" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    leadRepository: {
      findById: async () => ({
        id: payload.leadId,
        tenantId: payload.tenantId,
        sourceChannel: "LINE",
        externalUserId: "U1",
        name: null,
        phone: null,
        email: null,
        status: "NEW",
        assignedSalesId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastContactAt: null,
        tags: []
      }),
      updateStatus: async (_leadId: string, status: string) => {
        patchedStatus = status;
      }
    },
    conversationRepository: {
      recordAgentOutboundSent: async () => {}
    } as any,
    messageRepository: {
      create: async () => {
        throw new Error("not used");
      },
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: {
      create: async (entry: unknown) => {
        activityLogs.push(entry);
      }
    },
    rateLimiter: { checkOrThrow: async () => {} },
    idempotency: { hasProcessed: async () => false, markProcessed: async () => {} }
  });
  await useCase.execute(payload);
  assert.equal(patchedStatus, "CONTACTED");
  assert.ok(activityLogs.some((e) => (e as { type?: string }).type === "STATUS_CHANGED"));
});
