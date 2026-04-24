import test from "node:test";
import assert from "node:assert/strict";
import { ProcessInboundMessageUseCase } from "./processInboundMessage.js";
import type { InboundMessageNormalizedPayload } from "../../domain/events.js";

function makePayload(overrides?: Partial<InboundMessageNormalizedPayload>): InboundMessageNormalizedPayload {
  return {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    channel: "LINE",
    externalUserId: "U123",
    externalMessageId: "m-1",
    channelThreadId: "U123",
    text: "hello",
    occurredAt: new Date().toISOString(),
    ...overrides
  };
}

test("blank sender display name does not overwrite existing identity value", async () => {
  let capturedDisplayName: string | null = null;
  const useCase = new ProcessInboundMessageUseCase({
    leadRepository: {
      findByExternalUser: async () => ({
        id: "lead-1",
        tenantId: "t",
        sourceChannel: "LINE",
        externalUserId: "U123",
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
      create: async () => {
        throw new Error("not used");
      },
      updateStatus: async () => {},
      assign: async () => {},
      list: async () => ({ items: [], nextCursor: null })
    },
    conversationRepository: {
      findByThread: async () => ({
        id: "conv-1",
        tenantId: "t",
        leadId: "lead-1",
        channelType: "LINE",
        channelThreadId: "U123",
        status: "OPEN",
        lastMessageAt: new Date()
      }),
      create: async () => {
        throw new Error("not used");
      },
      touchLastMessage: async (_id, _at, name, _profileImageUrl) => {
        capturedDisplayName = name ?? null;
      },
      list: async () => ({ items: [], nextCursor: null })
    },
    messageRepository: {
      create: async (d: any) => ({
        id: "msg-1",
        ...d,
        externalMessageId: d.externalMessageId ?? null,
        createdAt: new Date()
      }),
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    contactRepository: {
      getOrCreateByIdentity: async () => ({
        id: "contact-1",
        tenantId: "t",
        displayName: "Existing Name",
        phone: null,
        email: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      upsertIdentityProfile: async () => ({ contactId: "contact-1", displayName: "Existing Name", profileImageUrl: "https://cdn.example/old.png" })
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null }
  });

  await useCase.execute(makePayload({ senderDisplayName: "   " }));
  assert.equal(capturedDisplayName, "Existing Name");
});

test("new non-empty sender display name updates conversation snapshot", async () => {
  let capturedDisplayName: string | null = null;
  const useCase = new ProcessInboundMessageUseCase({
    leadRepository: {
      findByExternalUser: async () => ({
        id: "lead-1",
        tenantId: "t",
        sourceChannel: "LINE",
        externalUserId: "U123",
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
      create: async () => {
        throw new Error("not used");
      },
      updateStatus: async () => {},
      assign: async () => {},
      list: async () => ({ items: [], nextCursor: null })
    },
    conversationRepository: {
      findByThread: async () => ({
        id: "conv-1",
        tenantId: "t",
        leadId: "lead-1",
        channelType: "LINE",
        channelThreadId: "U123",
        status: "OPEN",
        lastMessageAt: new Date()
      }),
      create: async () => {
        throw new Error("not used");
      },
      touchLastMessage: async (_id, _at, name, _profileImageUrl) => {
        capturedDisplayName = name ?? null;
      },
      list: async () => ({ items: [], nextCursor: null })
    },
    messageRepository: {
      create: async (d: any) => ({
        id: "msg-1",
        ...d,
        externalMessageId: d.externalMessageId ?? null,
        createdAt: new Date()
      }),
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    contactRepository: {
      getOrCreateByIdentity: async () => ({
        id: "contact-1",
        tenantId: "t",
        displayName: "Existing Name",
        phone: null,
        email: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      upsertIdentityProfile: async () => ({ contactId: "contact-1", displayName: "New Name", profileImageUrl: null })
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null }
  });

  await useCase.execute(makePayload({ senderDisplayName: "New Name" }));
  assert.equal(capturedDisplayName, "New Name");
});

test("blank inbound profile image does not pass a new snapshot URL to conversation touch", async () => {
  let capturedProfileUrl: string | null | undefined = "unset";
  const useCase = new ProcessInboundMessageUseCase({
    leadRepository: {
      findByExternalUser: async () => ({
        id: "lead-1",
        tenantId: "t",
        sourceChannel: "LINE",
        externalUserId: "U123",
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
      create: async () => {
        throw new Error("not used");
      },
      updateStatus: async () => {},
      assign: async () => {},
      list: async () => ({ items: [], nextCursor: null })
    },
    conversationRepository: {
      findByThread: async () => ({
        id: "conv-1",
        tenantId: "t",
        leadId: "lead-1",
        channelType: "LINE",
        channelThreadId: "U123",
        status: "OPEN",
        lastMessageAt: new Date()
      }),
      create: async () => {
        throw new Error("not used");
      },
      touchLastMessage: async (_id, _at, _name, profileImageUrl) => {
        capturedProfileUrl = profileImageUrl;
      },
      list: async () => ({ items: [], nextCursor: null })
    },
    messageRepository: {
      create: async (d: any) => ({
        id: "msg-1",
        ...d,
        externalMessageId: d.externalMessageId ?? null,
        createdAt: new Date()
      }),
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    contactRepository: {
      getOrCreateByIdentity: async () => ({
        id: "contact-1",
        tenantId: "t",
        displayName: "N",
        profileImageUrl: "https://cdn.example/existing.png",
        phone: null,
        email: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      upsertIdentityProfile: async () => ({
        contactId: "contact-1",
        displayName: "N",
        profileImageUrl: "https://cdn.example/existing.png"
      })
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null }
  });

  await useCase.execute(makePayload({ senderProfileImageUrl: "   " }));
  assert.equal(capturedProfileUrl, undefined);
});

test("non-empty inbound profile image is passed to conversation touch", async () => {
  let capturedProfileUrl: string | null | undefined = "unset";
  const useCase = new ProcessInboundMessageUseCase({
    leadRepository: {
      findByExternalUser: async () => ({
        id: "lead-1",
        tenantId: "t",
        sourceChannel: "LINE",
        externalUserId: "U123",
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
      create: async () => {
        throw new Error("not used");
      },
      updateStatus: async () => {},
      assign: async () => {},
      list: async () => ({ items: [], nextCursor: null })
    },
    conversationRepository: {
      findByThread: async () => ({
        id: "conv-1",
        tenantId: "t",
        leadId: "lead-1",
        channelType: "LINE",
        channelThreadId: "U123",
        status: "OPEN",
        lastMessageAt: new Date()
      }),
      create: async () => {
        throw new Error("not used");
      },
      touchLastMessage: async (_id, _at, _name, profileImageUrl) => {
        capturedProfileUrl = profileImageUrl;
      },
      list: async () => ({ items: [], nextCursor: null })
    },
    messageRepository: {
      create: async (d: any) => ({
        id: "msg-1",
        ...d,
        externalMessageId: d.externalMessageId ?? null,
        createdAt: new Date()
      }),
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    contactRepository: {
      getOrCreateByIdentity: async () => ({
        id: "contact-1",
        tenantId: "t",
        displayName: "N",
        phone: null,
        email: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      upsertIdentityProfile: async () => ({
        contactId: "contact-1",
        displayName: "N",
        profileImageUrl: "https://cdn.example/new.png"
      })
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null }
  });

  await useCase.execute(makePayload({ senderProfileImageUrl: "https://cdn.example/new.png" }));
  assert.equal(capturedProfileUrl, "https://cdn.example/new.png");
});

test("new conversation receives participant profile image snapshot when resolved", async () => {
  let createArg: any = null;
  const useCase = new ProcessInboundMessageUseCase({
    leadRepository: {
      findByExternalUser: async () => null,
      create: async () => ({
        id: "lead-new",
        tenantId: "t",
        sourceChannel: "LINE",
        externalUserId: "U999",
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
      updateStatus: async () => {},
      assign: async () => {},
      list: async () => ({ items: [], nextCursor: null })
    },
    conversationRepository: {
      findByThread: async () => null,
      create: async (data) => {
        createArg = data;
        return {
          id: "conv-new",
          ...data,
          lastMessageAt: data.lastMessageAt
        };
      },
      touchLastMessage: async () => {
        throw new Error("not used");
      },
      list: async () => ({ items: [], nextCursor: null })
    },
    messageRepository: {
      create: async (d: any) => ({
        id: "msg-1",
        ...d,
        externalMessageId: d.externalMessageId ?? null,
        createdAt: new Date()
      }),
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    contactRepository: {
      getOrCreateByIdentity: async () => ({
        id: "contact-new",
        tenantId: "t",
        displayName: "User",
        phone: null,
        email: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      upsertIdentityProfile: async () => ({
        contactId: "contact-new",
        displayName: "User",
        profileImageUrl: "https://cdn.example/u.png"
      })
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null }
  });

  await useCase.execute(
    makePayload({
      externalUserId: "U999",
      channelThreadId: "U999",
      senderProfileImageUrl: "https://cdn.example/u.png",
      senderDisplayName: "User"
    })
  );
  assert.equal(createArg?.participantProfileImageUrl, "https://cdn.example/u.png");
});
