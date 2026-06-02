import test from "node:test";
import assert from "node:assert/strict";
import { ProcessInboundMessageUseCase } from "./processInboundMessage.js";
import type { InboundMessageNormalizedPayload } from "../../domain/events.js";
import { PROFILE_AVATAR_CACHE_TOPIC } from "../../lib/profileAvatarCacheCommon.js";

function makePayload(overrides?: Partial<InboundMessageNormalizedPayload>): InboundMessageNormalizedPayload {
  return {
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    channel: "INSTAGRAM",
    externalUserId: "959986016929726",
    externalMessageId: "m-ig-1",
    channelThreadId: "ig:user:959986016929726",
    text: "hello",
    occurredAt: new Date().toISOString(),
    ...overrides
  };
}

function baseDeps(overrides?: {
  upsertIdentityProfile?: () => Promise<{
    contactId: string | null;
    contactIdentityId: string | null;
    displayName: string | null;
    profileImageUrl: string | null;
  }>;
  enqueueProfileAvatarCache?: (input: {
    tenantId: string;
    contactIdentityId: string;
    sourceProfileImageUrl: string;
  }) => Promise<void>;
}) {
  return {
    leadRepository: {
      findById: async () => null,
      findByExternalUser: async () => ({
        id: "lead-1",
        tenantId: "t",
        sourceChannel: "INSTAGRAM",
        externalUserId: "959986016929726",
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
      create: async () => ({
        id: "lead-new",
        tenantId: "t",
        sourceChannel: "INSTAGRAM",
        externalUserId: "959986016929726",
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
      create: async () => ({
        id: "conv-1",
        tenantId: "t",
        leadId: "lead-1",
        channelType: "INSTAGRAM",
        channelThreadId: "ig:user:959986016929726",
        status: "OPEN",
        lastMessageAt: new Date()
      }),
      touchLastMessage: async () => {},
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
    },
    messageRepository: {
      create: async (d: Record<string, unknown>) => ({
        id: "msg-1",
        ...d,
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
        displayName: "IG User",
        phone: null,
        email: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      upsertIdentityProfile:
        overrides?.upsertIdentityProfile ??
        (async () => ({
          contactIdentityId: "identity-ig-1",
          contactId: "contact-1",
          displayName: "IG User",
          profileImageUrl: "https://scontent.cdninstagram.com/existing.jpg"
        }))
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null },
    enqueueProfileAvatarCache: overrides?.enqueueProfileAvatarCache
  };
}

test("Instagram inbound enqueues avatar cache from payload profile URL", async () => {
  const prev = process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = "true";
  let enqueued: { sourceProfileImageUrl: string; contactIdentityId: string } | null = null as {
    sourceProfileImageUrl: string;
    contactIdentityId: string;
  } | null;
  const useCase = new ProcessInboundMessageUseCase(
    baseDeps({
      enqueueProfileAvatarCache: async (input) => {
        enqueued = input;
      }
    }) as never
  );
  await useCase.execute(
    makePayload({
      senderProfileImageUrl: "https://cdninstagram.com/from-payload.jpg",
      profile: { profileImageUrl: "https://cdninstagram.com/from-profile.jpg" }
    })
  );
  assert.equal(enqueued?.sourceProfileImageUrl, "https://cdninstagram.com/from-payload.jpg");
  assert.equal(enqueued?.contactIdentityId, "identity-ig-1");
  if (prev === undefined) delete process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  else process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = prev;
});

test("Instagram inbound enqueues avatar cache from identity URL when payload has no image", async () => {
  const prev = process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = "true";
  let enqueued: { sourceProfileImageUrl: string } | null = null as { sourceProfileImageUrl: string } | null;
  const useCase = new ProcessInboundMessageUseCase(
    baseDeps({
      enqueueProfileAvatarCache: async (input) => {
        enqueued = input;
      }
    }) as never
  );
  await useCase.execute(makePayload({ senderProfileImageUrl: null, profile: {} }));
  assert.equal(enqueued?.sourceProfileImageUrl, "https://scontent.cdninstagram.com/existing.jpg");
  if (prev === undefined) delete process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  else process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = prev;
});

test("Instagram inbound does not enqueue when payload and identity URLs are missing", async () => {
  const prev = process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = "true";
  let called = false;
  const useCase = new ProcessInboundMessageUseCase(
    baseDeps({
      upsertIdentityProfile: async () => ({
        contactIdentityId: "identity-ig-1",
        contactId: "contact-1",
        displayName: "IG User",
        profileImageUrl: null
      }),
      enqueueProfileAvatarCache: async () => {
        called = true;
      }
    }) as never
  );
  await useCase.execute(makePayload());
  assert.equal(called, false);
  if (prev === undefined) delete process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  else process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = prev;
});

test("LINE inbound regression still processes when enqueue hook present", async () => {
  const prev = process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = "true";
  let messageCreated = false;
  const useCase = new ProcessInboundMessageUseCase({
    ...(baseDeps({
      enqueueProfileAvatarCache: async () => {}
    }) as Record<string, unknown>),
    leadRepository: {
      ...baseDeps().leadRepository,
      findByExternalUser: async () => ({
        id: "lead-line",
        tenantId: "t",
        sourceChannel: "LINE",
        externalUserId: "U-line",
        name: null,
        phone: null,
        email: null,
        status: "NEW",
        assignedSalesId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastContactAt: null,
        tags: []
      })
    },
    conversationRepository: {
      findByThread: async () => ({
        id: "conv-line",
        tenantId: "t",
        leadId: "lead-line",
        channelType: "LINE",
        channelThreadId: "U-line",
        status: "OPEN",
        lastMessageAt: new Date()
      }),
      create: async () => {
        throw new Error("not used");
      },
      touchLastMessage: async () => {},
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
    },
    contactRepository: {
      getOrCreateByIdentity: async () => ({
        id: "c-line",
        tenantId: "t",
        displayName: "Line User",
        phone: null,
        email: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      upsertIdentityProfile: async () => ({
        contactIdentityId: "identity-line",
        contactId: "c-line",
        displayName: "Line User",
        profileImageUrl: "https://profile.line-scdn.net/0hZ"
      })
    }
  } as never);
  await useCase.execute({
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    channel: "LINE",
    externalUserId: "U-line",
    externalMessageId: "m-line",
    channelThreadId: "U-line",
    text: "hello line",
    occurredAt: new Date().toISOString()
  });
  messageCreated = true;
  assert.equal(messageCreated, true);
  if (prev === undefined) delete process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  else process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = prev;
});

test("enqueueProfileAvatarCache from worker wiring uses profile.avatar.cache topic", async () => {
  const prev = process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = "true";
  let topic = "";
  const { enqueueProfileAvatarCache } = await import("../profileAvatar/enqueueProfileAvatarCache.js");
  const queue = {
    enqueue: async (t: string) => {
      topic = t;
    }
  };
  await enqueueProfileAvatarCache(queue as never, {
    tenantId: "t1",
    contactIdentityId: "id1",
    sourceProfileImageUrl: "https://cdninstagram.com/a.jpg"
  });
  assert.equal(topic, PROFILE_AVATAR_CACHE_TOPIC);
  if (prev === undefined) delete process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  else process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = prev;
});
