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

test("facebook comment first reply routes to private reply", async () => {
  let privateReplyCount = 0;
  let publicReplyCount = 0;
  let dmSendCount = 0;
  let markedConverted = false;
  let markedPublicReplySent = false;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca10",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "FACEBOOK",
    channelThreadId: "comment:123_456",
    content: "hello from private reply",
    messageType: "TEXT"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          dmSendCount += 1;
          return { externalMessageId: "dm-1" };
        },
        sendPrivateReply: async () => {
          privateReplyCount += 1;
          return { externalMessageId: "pr-1" };
        },
        sendPublicCommentReply: async () => {
          publicReplyCount += 1;
          return { externalMessageId: "pub-1" };
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
        channelType: "FACEBOOK",
        channelThreadId: "comment:123_456",
        providerThreadType: "FACEBOOK_COMMENT",
        providerCommentId: "123_456",
        providerPageId: "page_1",
        providerExternalUserId: "987654",
        privateReplySentAt: null,
        status: "OPEN",
        lastMessageAt: new Date()
      }),
      findByThread: async () => null,
      create: async () => {
        throw new Error("not used");
      },
      touchLastMessage: async () => {},
      markAsRead: async () => {},
      markFacebookCommentPrivateReplySent: async (input: {
        convertedToDm: boolean;
        nextChannelThreadId?: string | null;
      }) => {
        markedConverted = Boolean(input.convertedToDm && input.nextChannelThreadId === "user:987654");
      },
      markFacebookPublicReplySent: async (_conversationId: string) => {
        markedPublicReplySent = true;
      },
      list: async () => ({ items: [], nextCursor: null })
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
  assert.equal(privateReplyCount, 1);
  assert.equal(publicReplyCount, 1);
  assert.equal(dmSendCount, 0);
  assert.equal(markedConverted, true);
  assert.equal(markedPublicReplySent, true);
});

test("facebook comment first reply rejects non-text", async () => {
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca11",
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
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => ({ externalMessageId: "dm-1" }),
        sendPrivateReply: async () => ({ externalMessageId: "pr-1" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () =>
        ({
          id: payload.conversationId,
          tenantId: payload.tenantId,
          leadId: payload.leadId,
          channelType: "FACEBOOK",
          channelThreadId: "comment:123_456",
          providerThreadType: "FACEBOOK_COMMENT",
          providerCommentId: "123_456",
          privateReplySentAt: null,
          status: "OPEN",
          lastMessageAt: new Date()
        }) as any
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
  await assert.rejects(useCase.execute(payload), /First Facebook comment reply must be text only/);
});

test("facebook uses dm path after private reply conversion", async () => {
  let dmSendCount = 0;
  let privateReplyCount = 0;
  let publicReplyCount = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca12",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "FACEBOOK",
    channelThreadId: "user:987654",
    content: "follow-up",
    messageType: "TEXT"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          dmSendCount += 1;
          return { externalMessageId: "dm-2" };
        },
        sendPrivateReply: async () => {
          privateReplyCount += 1;
          return { externalMessageId: "pr-2" };
        },
        sendPublicCommentReply: async () => {
          publicReplyCount += 1;
          return { externalMessageId: "pub-2" };
        },
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () =>
        ({
          id: payload.conversationId,
          tenantId: payload.tenantId,
          leadId: payload.leadId,
          channelType: "FACEBOOK",
          channelThreadId: "user:987654",
          providerThreadType: "MESSENGER_DM",
          privateReplySentAt: new Date(),
          status: "OPEN",
          lastMessageAt: new Date()
        }) as any
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
  assert.equal(dmSendCount, 1);
  assert.equal(privateReplyCount, 0);
  assert.equal(publicReplyCount, 0);
});

test("facebook comment first reply fails clearly when comment id is missing", async () => {
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca13",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "FACEBOOK",
    channelThreadId: "comment:",
    content: "hi"
  };
  const useCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry: {
      get: () => ({
        channel: "FACEBOOK",
        receiveMessage: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => ({ externalMessageId: "dm-1" }),
        sendPrivateReply: async () => ({ externalMessageId: "pr-1" }),
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () =>
        ({
          id: payload.conversationId,
          tenantId: payload.tenantId,
          leadId: payload.leadId,
          channelType: "FACEBOOK",
          channelThreadId: "",
          providerThreadType: "FACEBOOK_COMMENT",
          providerCommentId: null,
          privateReplySentAt: null,
          status: "OPEN",
          lastMessageAt: new Date()
        }) as any
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
  await assert.rejects(useCase.execute(payload), /missing Facebook comment ID/);
});

test("facebook public comment reply failure does not fail private reply", async () => {
  let markedSent = false;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca14",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
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
        sendMessage: async () => ({ externalMessageId: "dm-1" }),
        sendPrivateReply: async () => ({ externalMessageId: "pr-1" }),
        sendPublicCommentReply: async () => {
          throw new Error("public failed");
        },
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () =>
        ({
          id: payload.conversationId,
          tenantId: payload.tenantId,
          leadId: payload.leadId,
          channelType: "FACEBOOK",
          channelThreadId: "comment:123_456",
          providerThreadType: "FACEBOOK_COMMENT",
          providerCommentId: "123_456",
          providerExternalUserId: "987654",
          privateReplySentAt: null,
          facebookPublicReplySentAt: null,
          status: "OPEN",
          lastMessageAt: new Date()
        }) as any,
      markFacebookCommentPrivateReplySent: async () => {},
      markFacebookPublicReplySent: async (_conversationId: string) => {
        markedSent = true;
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
  assert.equal(markedSent, false);
});

test("facebook public comment reply is one-time only for comment lead", async () => {
  let publicReplyCount = 0;
  const payload: OutboundMessageRequestedPayload = {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca15",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
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
        sendMessage: async () => ({ externalMessageId: "dm-1" }),
        sendPrivateReply: async () => ({ externalMessageId: "pr-1" }),
        sendPublicCommentReply: async () => {
          publicReplyCount += 1;
          return { externalMessageId: "pub-1" };
        },
        fetchUserProfile: async () => ({}),
        fetchConversationThread: async () => []
      })
    },
    conversationRepository: {
      findById: async () =>
        ({
          id: payload.conversationId,
          tenantId: payload.tenantId,
          leadId: payload.leadId,
          channelType: "FACEBOOK",
          channelThreadId: "comment:123_456",
          providerThreadType: "FACEBOOK_COMMENT",
          providerCommentId: "123_456",
          providerExternalUserId: "987654",
          privateReplySentAt: null,
          facebookPublicReplySentAt: new Date(),
          status: "OPEN",
          lastMessageAt: new Date()
        }) as any,
      markFacebookCommentPrivateReplySent: async () => {},
      markFacebookPublicReplySent: async (_conversationId: string) => {}
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
  assert.equal(publicReplyCount, 0);
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
