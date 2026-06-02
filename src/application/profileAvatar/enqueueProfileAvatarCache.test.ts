import test from "node:test";
import assert from "node:assert/strict";
import type { QueuePort } from "../../domain/ports.js";
import {
  enqueueProfileAvatarCache,
  resolveProfileAvatarCacheSourceUrl,
  scheduleProfileAvatarCacheEnqueue
} from "./enqueueProfileAvatarCache.js";
import { PROFILE_AVATAR_CACHE_TOPIC } from "../../lib/profileAvatarCacheCommon.js";

test("resolveProfileAvatarCacheSourceUrl prefers payload URL over identity URL", () => {
  assert.equal(
    resolveProfileAvatarCacheSourceUrl({
      payloadProfileImageUrl: "https://cdninstagram.com/new.jpg",
      identityProfileImageUrl: "https://cdninstagram.com/old.jpg"
    }),
    "https://cdninstagram.com/new.jpg"
  );
});

test("resolveProfileAvatarCacheSourceUrl falls back to identity URL when payload missing", () => {
  assert.equal(
    resolveProfileAvatarCacheSourceUrl({
      payloadProfileImageUrl: null,
      identityProfileImageUrl: "https://scontent.cdninstagram.com/stored.jpg"
    }),
    "https://scontent.cdninstagram.com/stored.jpg"
  );
});

test("resolveProfileAvatarCacheSourceUrl rejects non-https URLs", () => {
  assert.equal(
    resolveProfileAvatarCacheSourceUrl({
      payloadProfileImageUrl: "http://insecure.example/a.jpg",
      identityProfileImageUrl: "https://cdninstagram.com/safe.jpg"
    }),
    "https://cdninstagram.com/safe.jpg"
  );
});

test("enqueueProfileAvatarCache no-ops when feature disabled", async () => {
  const prev = process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  delete process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  let called = false;
  const queue = {
    enqueue: async () => {
      called = true;
    }
  } as unknown as QueuePort;
  await enqueueProfileAvatarCache(queue, {
    tenantId: "t1",
    contactIdentityId: "id1",
    sourceProfileImageUrl: "https://cdninstagram.com/a.jpg"
  });
  assert.equal(called, false);
  if (prev !== undefined) process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = prev;
});

test("enqueueProfileAvatarCache enqueues profile.avatar.cache when enabled", async () => {
  const prev = process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = "true";
  let topic = "";
  const queue = {
    enqueue: async (t: string) => {
      topic = t;
    }
  } as unknown as QueuePort;
  await enqueueProfileAvatarCache(queue, {
    tenantId: "t1",
    contactIdentityId: "id1",
    sourceProfileImageUrl: "https://cdninstagram.com/a.jpg"
  });
  assert.equal(topic, PROFILE_AVATAR_CACHE_TOPIC);
  if (prev === undefined) delete process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  else process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = prev;
});

test("scheduleProfileAvatarCacheEnqueue uses payload-time URL when present", async () => {
  const prev = process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = "true";
  let enqueuedUrl: string | null = null;
  await scheduleProfileAvatarCacheEnqueue(
    async (input) => {
      enqueuedUrl = input.sourceProfileImageUrl;
    },
    {
      tenantId: "t1",
      contactIdentityId: "id-1",
      payloadProfileImageUrl: "https://cdninstagram.com/payload.jpg",
      identityProfileImageUrl: "https://cdninstagram.com/identity.jpg"
    }
  );
  assert.equal(enqueuedUrl, "https://cdninstagram.com/payload.jpg");
  if (prev === undefined) delete process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  else process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = prev;
});

test("scheduleProfileAvatarCacheEnqueue uses identity URL when payload missing", async () => {
  const prev = process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = "true";
  let enqueuedUrl: string | null = null;
  await scheduleProfileAvatarCacheEnqueue(
    async (input) => {
      enqueuedUrl = input.sourceProfileImageUrl;
    },
    {
      tenantId: "t1",
      contactIdentityId: "id-1",
      payloadProfileImageUrl: null,
      identityProfileImageUrl: "https://scontent.cdninstagram.com/stored.jpg"
    }
  );
  assert.equal(enqueuedUrl, "https://scontent.cdninstagram.com/stored.jpg");
  if (prev === undefined) delete process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  else process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = prev;
});

test("scheduleProfileAvatarCacheEnqueue skips when both URLs missing", async () => {
  const prev = process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = "true";
  let called = false;
  await scheduleProfileAvatarCacheEnqueue(
    async () => {
      called = true;
    },
    {
      tenantId: "t1",
      contactIdentityId: "id-1",
      payloadProfileImageUrl: null,
      identityProfileImageUrl: null
    }
  );
  assert.equal(called, false);
  if (prev === undefined) delete process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  else process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = prev;
});

test("scheduleProfileAvatarCacheEnqueue skips when feature disabled", async () => {
  const prev = process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  delete process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  let called = false;
  await scheduleProfileAvatarCacheEnqueue(
    async () => {
      called = true;
    },
    {
      tenantId: "t1",
      contactIdentityId: "id-1",
      identityProfileImageUrl: "https://cdninstagram.com/a.jpg"
    }
  );
  assert.equal(called, false);
  if (prev !== undefined) process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = prev;
});

test("scheduleProfileAvatarCacheEnqueue skips when contactIdentityId missing", async () => {
  const prev = process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = "true";
  let called = false;
  await scheduleProfileAvatarCacheEnqueue(
    async () => {
      called = true;
    },
    {
      tenantId: "t1",
      contactIdentityId: null,
      identityProfileImageUrl: "https://cdninstagram.com/a.jpg"
    }
  );
  assert.equal(called, false);
  if (prev === undefined) delete process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  else process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = prev;
});
