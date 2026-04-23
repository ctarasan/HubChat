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
