import test from "node:test";
import assert from "node:assert/strict";
import { ProcessInboundMessageUseCase } from "./processInboundMessage.js";
import type { InboundMessageNormalizedPayload } from "../../domain/events.js";
import { buildDefaultTenantSlaPolicy } from "../../domain/tenantSlaPolicy.js";

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

function toIso(value: string | number | Date): string {
  return new Date(value).toISOString();
}

test("blank sender display name does not overwrite existing identity value", async () => {
  let capturedDisplayName: string | null = null;
  const useCase = new ProcessInboundMessageUseCase({
    leadRepository: {
      findById: async () => null,
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
      upsertIdentityProfile: async () => ({ contactIdentityId: "identity-1", contactId: "contact-1", displayName: "Existing Name", profileImageUrl: "https://cdn.example/old.png" })
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
      findById: async () => null,
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
      upsertIdentityProfile: async () => ({ contactIdentityId: "identity-1", contactId: "contact-1", displayName: "New Name", profileImageUrl: null })
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
      findById: async () => null,
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
        contactIdentityId: "identity-1",
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
      findById: async () => null,
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
        contactIdentityId: "identity-1",
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
      findById: async () => null,
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
        contactIdentityId: "identity-1",
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
  assert.ok(createArg?.lastCustomerMessageAt);
  assert.equal(toIso(createArg.lastCustomerMessageAt), toIso(createArg.lastMessageAt));
});

test("inbound touch increments unread and updates preview", async () => {
  let capturedOpts: any = null;
  let capturedTouchAt: Date | null = null;
  const useCase = new ProcessInboundMessageUseCase({
    leadRepository: {
      findById: async () => null,
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
      touchLastMessage: async (_id, at, opts) => {
        capturedTouchAt = at;
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
      upsertIdentityProfile: async () => ({ contactIdentityId: "identity-1", contactId: "contact-1", displayName: "User", profileImageUrl: null })
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null }
  });

  await useCase.execute(makePayload({ text: "inbound hello" }));
  assert.equal(capturedOpts?.incrementUnreadCount, true);
  assert.equal(capturedOpts?.lastMessagePreview, "inbound hello");
  assert.equal(capturedOpts?.lastMessageType, "TEXT");
  assert.ok(capturedTouchAt);
  assert.ok(capturedOpts?.lastCustomerMessageAt);
  assert.equal(capturedOpts.lastCustomerMessageAt.getTime(), (capturedTouchAt as Date).getTime());
});

test("LINE inbound image stores IMAGE metadata from media service", async () => {
  let capturedMessage: any = null;
  let calledLineMessageId = "";
  const useCase = new ProcessInboundMessageUseCase({
    leadRepository: {
      findById: async () => null,
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
      upsertIdentityProfile: async () => ({ contactIdentityId: "identity-1", contactId: "contact-1", displayName: "User", profileImageUrl: null })
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null },
    inboundMediaService: {
      processLineImage: async (input) => {
        calledLineMessageId = input.lineMessageId;
        return {
        mediaUrl: "https://cdn.example/original.jpg",
        previewUrl: "https://cdn.example/thumb.jpg",
        metadata: {
          storageBucket: "inbound-media",
          originalPath: "inbound/tenant/line/original/line-img-1.jpg",
          thumbPath: "inbound/tenant/line/thumb/line-img-1.jpg",
          urlMode: "signed",
          signedUrlExpiresInSec: 604800
        }
        };
      }
    }
  });

  await useCase.execute(makePayload({ messageType: "IMAGE", lineMessageId: "line-img-1", text: "" }));
  assert.equal(calledLineMessageId, "line-img-1");
  assert.equal(capturedMessage?.messageType, "IMAGE");
  assert.equal(capturedMessage?.content, "[image]");
  assert.equal(capturedMessage?.metadataJson?.source, "line");
  assert.equal(capturedMessage?.metadataJson?.previewUrl, "https://cdn.example/thumb.jpg");
  assert.equal(capturedMessage?.metadataJson?.urlMode, "signed");
  assert.equal(capturedMessage?.metadataJson?.storageBucket, "inbound-media");
  assert.equal(capturedMessage?.mediaUrl, "https://cdn.example/original.jpg");
  assert.equal(capturedMessage?.previewUrl, "https://cdn.example/thumb.jpg");
});

test("LINE inbound image failure fallback does not throw and stores error metadata", async () => {
  let capturedMessage: any = null;
  const useCase = new ProcessInboundMessageUseCase({
    leadRepository: {
      findById: async () => null,
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
      upsertIdentityProfile: async () => ({ contactIdentityId: "identity-1", contactId: "contact-1", displayName: "User", profileImageUrl: null })
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null },
    inboundMediaService: {
      processLineImage: async () => {
        throw new Error("download failed");
      }
    }
  });

  await useCase.execute(makePayload({ messageType: "IMAGE", lineMessageId: "line-img-2", text: "" }));
  assert.equal(capturedMessage?.messageType, "IMAGE");
  assert.equal(capturedMessage?.metadataJson?.error, true);
  assert.equal(typeof capturedMessage?.metadataJson?.errorReason, "string");
});

test("Facebook inbound image bypasses line storage service", async () => {
  let mediaCalls = 0;
  let capturedMessage: any = null;
  const useCase = new ProcessInboundMessageUseCase({
    leadRepository: {
      findById: async () => null,
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
      upsertIdentityProfile: async () => ({ contactIdentityId: "identity-1", contactId: "contact-1", displayName: "User", profileImageUrl: null })
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null },
    inboundMediaService: {
      processLineImage: async () => {
        mediaCalls += 1;
        throw new Error("should not call");
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

test("Facebook comment with bad occurredAt falls back and updates latest conversation timestamp", async () => {
  let touchedAtIso: string | null = null;
  let touchedCustomerAtIso: string | null = null;
  let persistedOccurredAt: Date | string | null = null;
  const useCase = new ProcessInboundMessageUseCase({
    leadRepository: {
      findById: async () => null,
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
      findByThread: async () => ({
        id: "conv-1",
        tenantId: "t",
        leadId: "lead-1",
        channelType: "FACEBOOK",
        channelThreadId: "post_1_comment_1",
        status: "OPEN",
        lastMessageAt: new Date("2026-01-01T00:00:00.000Z")
      }),
      create: async () => { throw new Error("not used"); },
      touchLastMessage: async (_id, at, opts) => {
        touchedAtIso = at.toISOString();
        touchedCustomerAtIso = opts?.lastCustomerMessageAt?.toISOString() ?? null;
      },
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
    },
    messageRepository: {
      create: async (d: any) => {
        persistedOccurredAt = (d?.occurredAt as Date | string | null | undefined) ?? null;
        return { id: "msg-1", ...d, externalMessageId: d.externalMessageId ?? null, createdAt: new Date() };
      },
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    contactRepository: {
      getOrCreateByIdentity: async () => ({ id: "contact-1", tenantId: "t", displayName: "User", phone: null, email: null, createdAt: new Date(), updatedAt: new Date() }),
      upsertIdentityProfile: async () => ({ contactIdentityId: "identity-1", contactId: "contact-1", displayName: "User", profileImageUrl: null })
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null }
  });

  await useCase.execute(
    makePayload({
      channel: "FACEBOOK",
      externalUserId: "fb-1",
      channelThreadId: "post_1_comment_1",
      sourceThreadType: "FACEBOOK_COMMENT",
      facebookCommentId: "post_1_comment_1",
      externalMessageId: "post_1_comment_1",
      occurredAt: "1970-01-21T13:43:58.022Z",
      queueCreatedAt: "2026-04-29T04:46:10.000Z",
      text: "new comment"
    })
  );

  assert.equal(touchedAtIso, "2026-04-29T04:46:10.000Z");
  assert.equal(touchedCustomerAtIso, "2026-04-29T04:46:10.000Z");
  if (persistedOccurredAt === null) {
    throw new Error("Expected persistedOccurredAt to be captured");
  }
  const persistedOccurredAtIso = toIso(persistedOccurredAt as string | number | Date);
  assert.equal(persistedOccurredAtIso, "2026-04-29T04:46:10.000Z");
});

test("instagram inbound creates INSTAGRAM_DM conversation and persists text", async () => {
  let createdConversation: any = null;
  let createdMessage: any = null;
  const useCase = new ProcessInboundMessageUseCase({
    leadRepository: {
      findById: async () => null,
      findByExternalUser: async () => null,
      create: async () => ({
        id: "lead-ig",
        tenantId: "t",
        sourceChannel: "INSTAGRAM",
        externalUserId: "17841400000000000",
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
        createdConversation = data;
        return { id: "conv-ig", ...data };
      },
      touchLastMessage: async () => {},
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
    },
    messageRepository: {
      create: async (data: any) => {
        createdMessage = data;
        return { id: "msg-ig", ...data, externalMessageId: data.externalMessageId ?? null, createdAt: new Date() };
      },
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    contactRepository: {
      getOrCreateByIdentity: async () => ({ id: "contact-ig", tenantId: "t", displayName: "IG User", phone: null, email: null, createdAt: new Date(), updatedAt: new Date() }),
      upsertIdentityProfile: async () => ({ contactIdentityId: "identity-1", contactId: "contact-ig", displayName: "IG User", profileImageUrl: null })
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null }
  });
  await useCase.execute(
    makePayload({
      channel: "INSTAGRAM",
      externalUserId: "17841400000000000",
      channelThreadId: "ig:user:17841400000000000",
      sourceThreadType: "INSTAGRAM_DM",
      metadataJson: { instagramRecipientId: "17841411111111111" },
      text: "hello instagram"
    })
  );
  assert.equal(createdConversation?.channelType, "INSTAGRAM");
  assert.equal(createdConversation?.providerThreadType, "INSTAGRAM_DM");
  assert.equal(createdConversation?.providerExternalUserId, "17841400000000000");
  assert.equal(createdConversation?.providerPageId, null);
  assert.equal(createdMessage?.messageType, "TEXT");
  assert.equal(createdMessage?.content, "hello instagram");
  assert.equal(createdMessage?.metadataJson?.instagramRecipientId, "17841411111111111");
  assert.ok(createdConversation?.lastCustomerMessageAt);
  assert.equal(toIso(createdConversation.lastCustomerMessageAt), toIso(createdConversation.lastMessageAt));
});

test("instagram inbound does not write instagram recipient id into conversation provider_page_id", async () => {
  let updatedContextCalls = 0;
  const useCase = new ProcessInboundMessageUseCase({
    leadRepository: {
      findById: async () => null,
      findByExternalUser: async () => ({
        id: "lead-ig",
        tenantId: "t",
        sourceChannel: "INSTAGRAM",
        externalUserId: "17841400000000000",
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
        id: "conv-ig",
        tenantId: "t",
        leadId: "lead-ig",
        channelType: "INSTAGRAM",
        channelThreadId: "ig:user:17841400000000000",
        providerPageId: null,
        status: "OPEN",
        lastMessageAt: new Date()
      }),
      create: async () => {
        throw new Error("not used");
      },
      touchLastMessage: async () => {},
      updateInstagramProviderContext: async () => {
        updatedContextCalls += 1;
      },
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
    },
    messageRepository: {
      create: async (data: any) => ({
        id: "msg-ig",
        ...data,
        externalMessageId: data.externalMessageId ?? null,
        createdAt: new Date()
      }),
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    contactRepository: {
      getOrCreateByIdentity: async () => ({ id: "contact-ig", tenantId: "t", displayName: "IG User", phone: null, email: null, createdAt: new Date(), updatedAt: new Date() }),
      upsertIdentityProfile: async () => ({ contactIdentityId: "identity-1", contactId: "contact-ig", displayName: "IG User", profileImageUrl: null })
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null }
  });
  await useCase.execute(
    makePayload({
      channel: "INSTAGRAM",
      externalUserId: "17841400000000000",
      channelThreadId: "ig:user:17841400000000000",
      sourceThreadType: "INSTAGRAM_DM",
      metadataJson: { instagramRecipientId: "17841411111111111" },
      text: "hello instagram"
    })
  );
  assert.equal(updatedContextCalls, 0);
});

test("instagram comment inbound persists INSTAGRAM_COMMENT conversation metadata", async () => {
  let createdConversation: any = null;
  const useCase = new ProcessInboundMessageUseCase({
    leadRepository: {
      findById: async () => null,
      findByExternalUser: async () => null,
      create: async () => ({
        id: "lead-ig-comment",
        tenantId: "t",
        sourceChannel: "INSTAGRAM",
        externalUserId: "17841400000000111",
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
        createdConversation = data;
        return { id: "conv-ig-comment", ...data };
      },
      touchLastMessage: async () => {},
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
    },
    messageRepository: {
      create: async (data: any) => ({
        id: "msg-ig-comment",
        ...data,
        externalMessageId: data.externalMessageId ?? null,
        createdAt: new Date()
      }),
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    contactRepository: {
      getOrCreateByIdentity: async () => ({ id: "contact-ig", tenantId: "t", displayName: "IG User", phone: null, email: null, createdAt: new Date(), updatedAt: new Date() }),
      upsertIdentityProfile: async () => ({ contactIdentityId: "identity-1", contactId: "contact-ig", displayName: "IG User", profileImageUrl: null })
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null }
  });
  await useCase.execute(
    makePayload({
      channel: "INSTAGRAM",
      externalUserId: "17841400000000111",
      channelThreadId: "ig:comment:17890000000000001",
      sourceThreadType: "INSTAGRAM_COMMENT",
      instagramCommentId: "17890000000000001",
      instagramPageId: "1137356672785125",
      text: "สนใจค่ะ"
    })
  );
  assert.equal(createdConversation?.providerThreadType, "INSTAGRAM_COMMENT");
  assert.equal(createdConversation?.providerCommentId, "17890000000000001");
  assert.equal(createdConversation?.providerPageId, "1137356672785125");
  assert.equal(createdConversation?.providerExternalUserId, "17841400000000111");
});

test("inbound customer message on RESOLVED conversation reopens and sets sla_due_at", async () => {
  const customerAt = new Date("2026-05-10T10:00:00.000Z");
  let touchOpts: Record<string, unknown> | undefined;
  const useCase = new ProcessInboundMessageUseCase({
    leadRepository: {
      findById: async () => null,
      findByExternalUser: async () => ({
        id: "lead-1",
        tenantId: "t",
        sourceChannel: "LINE",
        externalUserId: "U123",
        name: null,
        phone: null,
        email: null,
        status: "ASSIGNED",
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
        status: "RESOLVED",
        lastMessageAt: new Date(),
        resolvedAt: new Date("2026-05-09T00:00:00.000Z")
      }),
      create: async () => {
        throw new Error("not used");
      },
      touchLastMessage: async (_id, _at, opts) => {
        touchOpts = opts as Record<string, unknown>;
      },
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
    },
    messageRepository: {
      create: async (d: any) => ({ id: "msg-1", ...d, createdAt: new Date() }),
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    contactRepository: {
      getOrCreateByIdentity: async () => ({
        id: "c1",
        tenantId: "t",
        displayName: "User",
        phone: null,
        email: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      upsertIdentityProfile: async () => ({ contactIdentityId: "identity-1", contactId: "c1", displayName: "User", profileImageUrl: null })
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null }
  });
  await useCase.execute(
    makePayload({
      occurredAt: customerAt.toISOString(),
      text: "customer follow-up"
    })
  );
  assert.equal(touchOpts?.reopenFromResolved, true);
  assert.ok(touchOpts?.slaDueAt instanceof Date);
  const expectedMinutes = buildDefaultTenantSlaPolicy().rules.REOPENED_RESPONSE.targetMinutes!;
  assert.equal(
    (touchOpts!.slaDueAt as Date).getTime() - customerAt.getTime(),
    expectedMinutes * 60_000
  );
  assert.equal((touchOpts?.lastCustomerMessageAt as Date).toISOString(), customerAt.toISOString());
});

test("processInboundMessage persists safe source_post_snippet for Facebook TEXT comment", async () => {
  let createdMessage: any = null;
  const useCase = new ProcessInboundMessageUseCase({
    leadRepository: {
      findById: async () => null,
      findByExternalUser: async () => null,
      create: async () => ({
        id: "lead-fb",
        tenantId: "t",
        sourceChannel: "FACEBOOK",
        externalUserId: "fb-user",
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
      create: async (d: any) => ({ id: "conv-fb", ...d, lastMessageAt: new Date() }),
      touchLastMessage: async () => {},
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
    },
    messageRepository: {
      create: async (d: any) => {
        createdMessage = d;
        return { id: "msg-fb", ...d, createdAt: new Date() };
      },
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    contactRepository: {
      getOrCreateByIdentity: async () => ({
        id: "c1",
        tenantId: "t",
        displayName: "User",
        phone: null,
        email: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      upsertIdentityProfile: async () => ({ contactIdentityId: "identity-1", contactId: "c1", displayName: "User", profileImageUrl: null })
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null }
  });

  await useCase.execute(
    makePayload({
      channel: "FACEBOOK",
      externalUserId: "fb-user",
      channelThreadId: "comment:post_1",
      sourceThreadType: "FACEBOOK_COMMENT",
      facebookCommentId: "post_1",
      metadataJson: {
        source_post_snippet: "Parent post marketing copy",
        source_post_captured_at: "2026-06-01T09:00:00.000Z",
        source_post_source: "ingest_graph",
        rawPayload: { comment_id: "secret" }
      }
    })
  );

  assert.ok(createdMessage);
  const metadata = createdMessage!.metadataJson as Record<string, unknown>;
  assert.equal(metadata.source_post_snippet, "Parent post marketing copy");
  assert.equal(metadata.source_post_source, "ingest_graph");
  assert.equal("rawPayload" in metadata, false);
});

test("processInboundMessage drops unsafe source post metadata for TEXT comments", async () => {
  let createdMessage: any = null;
  const useCase = new ProcessInboundMessageUseCase({
    leadRepository: {
      findById: async () => null,
      findByExternalUser: async () => null,
      create: async () => ({
        id: "lead-ig",
        tenantId: "t",
        sourceChannel: "INSTAGRAM",
        externalUserId: "ig-user",
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
      create: async (d: any) => ({ id: "conv-ig", ...d, lastMessageAt: new Date() }),
      touchLastMessage: async () => {},
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
    },
    messageRepository: {
      create: async (d: any) => {
        createdMessage = d;
        return { id: "msg-ig", ...d, createdAt: new Date() };
      },
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    contactRepository: {
      getOrCreateByIdentity: async () => ({
        id: "c1",
        tenantId: "t",
        displayName: "User",
        phone: null,
        email: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      upsertIdentityProfile: async () => ({ contactIdentityId: "identity-1", contactId: "c1", displayName: "User", profileImageUrl: null })
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null }
  });

  await useCase.execute(
    makePayload({
      channel: "INSTAGRAM",
      externalUserId: "ig-user",
      channelThreadId: "ig:comment:1",
      sourceThreadType: "INSTAGRAM_COMMENT",
      instagramCommentId: "1",
      metadataJson: {
        source_post_snippet: "https://www.instagram.com/p/abc/",
        source_post_source: "ingest_graph"
      }
    })
  );

  assert.ok(createdMessage);
  assert.deepEqual(createdMessage!.metadataJson, {});
});

test("processInboundMessage keeps IMAGE metadata behavior unchanged", async () => {
  let createdMessage: any = null;
  const useCase = new ProcessInboundMessageUseCase({
    leadRepository: {
      findById: async () => null,
      findByExternalUser: async () => null,
      create: async () => ({
        id: "lead-fb-img",
        tenantId: "t",
        sourceChannel: "FACEBOOK",
        externalUserId: "fb-user",
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
      create: async (d: any) => ({ id: "conv-fb-img", ...d, lastMessageAt: new Date() }),
      touchLastMessage: async () => {},
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
    },
    messageRepository: {
      create: async (d: any) => {
        createdMessage = d;
        return { id: "msg-fb-img", ...d, createdAt: new Date() };
      },
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    contactRepository: {
      getOrCreateByIdentity: async () => ({
        id: "c1",
        tenantId: "t",
        displayName: "User",
        phone: null,
        email: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      upsertIdentityProfile: async () => ({ contactIdentityId: "identity-1", contactId: "c1", displayName: "User", profileImageUrl: null })
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null }
  });

  await useCase.execute(
    makePayload({
      channel: "FACEBOOK",
      externalUserId: "fb-user",
      channelThreadId: "comment:img",
      sourceThreadType: "FACEBOOK_COMMENT",
      messageType: "IMAGE",
      mediaUrl: "https://cdn.example.com/comment.jpg",
      previewUrl: "https://cdn.example.com/comment-thumb.jpg",
      text: ""
    })
  );

  assert.ok(createdMessage);
  const metadata = createdMessage!.metadataJson as Record<string, unknown>;
  assert.equal(metadata.source, "facebook");
  assert.equal(metadata.mediaUrl, "https://cdn.example.com/comment.jpg");
  assert.equal(metadata.previewUrl, "https://cdn.example.com/comment-thumb.jpg");
});

