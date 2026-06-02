import test from "node:test";
import assert from "node:assert/strict";
import type { QueuePort } from "../../domain/ports.js";
import { enqueueProfileAvatarCache } from "./enqueueProfileAvatarCache.js";
import { PROFILE_AVATAR_CACHE_TOPIC } from "../../lib/profileAvatarCacheCommon.js";

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

test("enqueueProfileAvatarCache enqueues when enabled", async () => {
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
