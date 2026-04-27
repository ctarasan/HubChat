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
      touchLastMessage: async (_id, _at, opts) => {
        capturedDisplayName = opts?.participantDisplayName ?? null;
      },
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
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
      touchLastMessage: async (_id, _at, opts) => {
        capturedDisplayName = opts?.participantDisplayName ?? null;
      },
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
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
      touchLastMessage: async (_id, _at, opts) => {
        capturedProfileUrl = opts?.participantProfileImageUrl;
      },
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
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
      touchLastMessage: async (_id, _at, opts) => {
        capturedProfileUrl = opts?.participantProfileImageUrl;
      },
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
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
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
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
  assert.equal(createArg?.unreadCount, 1);
  assert.equal(createArg?.lastMessagePreview, "hello");
});

test("inbound touch increments unread and updates preview", async () => {
  let capturedOpts: any = null;
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
      touchLastMessage: async (_id, _at, opts) => {
        capturedOpts = opts;
      },
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
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
        displayName: "User",
        phone: null,
        email: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      upsertIdentityProfile: async () => ({ contactId: "contact-1", displayName: "User", profileImageUrl: null })
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null }
  });

  await useCase.execute(makePayload({ text: "inbound hello" }));
  assert.equal(capturedOpts?.incrementUnreadCount, true);
  assert.equal(capturedOpts?.lastMessagePreview, "inbound hello");
  assert.equal(capturedOpts?.lastMessageType, "TEXT");
});

test("LINE inbound image stores IMAGE metadata from media service", async () => {
  let capturedMessage: any = null;
  const useCase = new ProcessInboundMessageUseCase({
    leadRepository: {
      findByExternalUser: async () => ({
        id: "lead-1", tenantId: "t", sourceChannel: "LINE", externalUserId: "U123", name: null, phone: null, email: null,
        status: "NEW", assignedSalesId: null, createdAt: new Date(), updatedAt: new Date(), lastContactAt: null, tags: []
      }),
      create: async () => { throw new Error("not used"); },
      updateStatus: async () => {},
      assign: async () => {},
      list: async () => ({ items: [], nextCursor: null })
    },
    conversationRepository: {
      findByThread: async () => ({ id: "conv-1", tenantId: "t", leadId: "lead-1", channelType: "LINE", channelThreadId: "U123", status: "OPEN", lastMessageAt: new Date() }),
      create: async () => { throw new Error("not used"); },
      touchLastMessage: async () => {},
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
    },
    messageRepository: {
      create: async (d: any) => { capturedMessage = d; return { id: "msg-1", ...d, externalMessageId: d.externalMessageId ?? null, createdAt: new Date() }; },
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    contactRepository: {
      getOrCreateByIdentity: async () => ({ id: "contact-1", tenantId: "t", displayName: "User", phone: null, email: null, createdAt: new Date(), updatedAt: new Date() }),
      upsertIdentityProfile: async () => ({ contactId: "contact-1", displayName: "User", profileImageUrl: null })
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null },
    inboundMediaService: {
      processLineInboundImage: async () => ({
        ok: true,
        mediaUrl: "https://cdn.example/original.jpg",
        previewUrl: "https://cdn.example/thumb.jpg"
      })
    }
  });

  await useCase.execute(makePayload({ messageType: "IMAGE", lineMessageId: "line-img-1", text: "" }));
  assert.equal(capturedMessage?.messageType, "IMAGE");
  assert.equal(capturedMessage?.metadataJson?.source, "line");
  assert.equal(capturedMessage?.metadataJson?.previewUrl, "https://cdn.example/thumb.jpg");
});

test("LINE inbound image failure fallback does not throw and stores error metadata", async () => {
  let capturedMessage: any = null;
  const useCase = new ProcessInboundMessageUseCase({
    leadRepository: {
      findByExternalUser: async () => ({
        id: "lead-1", tenantId: "t", sourceChannel: "LINE", externalUserId: "U123", name: null, phone: null, email: null,
        status: "NEW", assignedSalesId: null, createdAt: new Date(), updatedAt: new Date(), lastContactAt: null, tags: []
      }),
      create: async () => { throw new Error("not used"); },
      updateStatus: async () => {},
      assign: async () => {},
      list: async () => ({ items: [], nextCursor: null })
    },
    conversationRepository: {
      findByThread: async () => ({ id: "conv-1", tenantId: "t", leadId: "lead-1", channelType: "LINE", channelThreadId: "U123", status: "OPEN", lastMessageAt: new Date() }),
      create: async () => { throw new Error("not used"); },
      touchLastMessage: async () => {},
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
    },
    messageRepository: {
      create: async (d: any) => { capturedMessage = d; return { id: "msg-1", ...d, externalMessageId: d.externalMessageId ?? null, createdAt: new Date() }; },
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    contactRepository: {
      getOrCreateByIdentity: async () => ({ id: "contact-1", tenantId: "t", displayName: "User", phone: null, email: null, createdAt: new Date(), updatedAt: new Date() }),
      upsertIdentityProfile: async () => ({ contactId: "contact-1", displayName: "User", profileImageUrl: null })
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null },
    inboundMediaService: {
      processLineInboundImage: async () => ({ ok: false, reason: "download failed" })
    }
  });

  await useCase.execute(makePayload({ messageType: "IMAGE", lineMessageId: "line-img-2", text: "" }));
  assert.equal(capturedMessage?.messageType, "IMAGE");
  assert.equal(capturedMessage?.metadataJson?.error, true);
});

test("Facebook inbound image bypasses line storage service", async () => {
  let mediaCalls = 0;
  let capturedMessage: any = null;
  const useCase = new ProcessInboundMessageUseCase({
    leadRepository: {
      findByExternalUser: async () => ({
        id: "lead-1", tenantId: "t", sourceChannel: "FACEBOOK", externalUserId: "fb-1", name: null, phone: null, email: null,
        status: "NEW", assignedSalesId: null, createdAt: new Date(), updatedAt: new Date(), lastContactAt: null, tags: []
      }),
      create: async () => { throw new Error("not used"); },
      updateStatus: async () => {},
      assign: async () => {},
      list: async () => ({ items: [], nextCursor: null })
    },
    conversationRepository: {
      findByThread: async () => ({ id: "conv-1", tenantId: "t", leadId: "lead-1", channelType: "FACEBOOK", channelThreadId: "fb-1", status: "OPEN", lastMessageAt: new Date() }),
      create: async () => { throw new Error("not used"); },
      touchLastMessage: async () => {},
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
    },
    messageRepository: {
      create: async (d: any) => { capturedMessage = d; return { id: "msg-1", ...d, externalMessageId: d.externalMessageId ?? null, createdAt: new Date() }; },
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    contactRepository: {
      getOrCreateByIdentity: async () => ({ id: "contact-1", tenantId: "t", displayName: "User", phone: null, email: null, createdAt: new Date(), updatedAt: new Date() }),
      upsertIdentityProfile: async () => ({ contactId: "contact-1", displayName: "User", profileImageUrl: null })
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null },
    inboundMediaService: {
      processLineInboundImage: async () => {
        mediaCalls += 1;
        return { ok: false, reason: "should not call" };
      }
    }
  });

  await useCase.execute(
    makePayload({
      channel: "FACEBOOK",
      externalUserId: "fb-1",
      channelThreadId: "fb-1",
      messageType: "IMAGE",
      mediaUrl: "https://cdn.facebook.com/inbound.jpg",
      text: ""
    })
  );
  assert.equal(mediaCalls, 0);
  assert.equal(capturedMessage?.metadataJson?.source, "facebook");
});
