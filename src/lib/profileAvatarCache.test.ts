import test from "node:test";
import assert from "node:assert/strict";
import { buildProfileAvatarPublicUrl, isProfileAvatarCacheEnabled } from "./profileAvatarCacheCommon.js";
import {
  ProfileAvatarFetchError,
  assertAllowlistedProfileImageUrl,
  fetchAllowlistedProfileImage,
  hashProfileImageSourceUrl,
  isAllowlistedProfileImageHost,
  isBlockedProfileImageHost
} from "./profileAvatarCache.js";

test("isProfileAvatarCacheEnabled defaults false", () => {
  assert.equal(isProfileAvatarCacheEnabled({}), false);
  assert.equal(isProfileAvatarCacheEnabled({ HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED: "true" }), true);
});

test("allowlist accepts Meta/Facebook/LINE profile hosts", () => {
  assert.equal(isAllowlistedProfileImageHost("scontent.cdninstagram.com"), true);
  assert.equal(isAllowlistedProfileImageHost("platform-lookaside.fbsbx.com"), true);
  assert.equal(isAllowlistedProfileImageHost("profile.line-scdn.net"), true);
  assert.equal(isAllowlistedProfileImageHost("obs.line-scdn.net"), true);
});

test("allowlist rejects arbitrary and private hosts", () => {
  assert.equal(isAllowlistedProfileImageHost("evil.example"), false);
  assert.equal(isAllowlistedProfileImageHost("localhost"), false);
  assert.equal(isBlockedProfileImageHost("127.0.0.1"), true);
  assert.throws(() => assertAllowlistedProfileImageUrl("http://cdninstagram.com/x.jpg"), ProfileAvatarFetchError);
  assert.throws(() => assertAllowlistedProfileImageUrl("https://evil.example/x.jpg"), ProfileAvatarFetchError);
});

test("fetch rejects redirect to private IP", async () => {
  const fetchFn = async (url: string, init?: RequestInit) => {
    if (init?.redirect === "manual" && url.includes("cdninstagram.com")) {
      return new Response(null, {
        status: 302,
        headers: { Location: "https://127.0.0.1/secret.jpg" }
      });
    }
    return new Response(null, { status: 404 });
  };
  await assert.rejects(
    () =>
      fetchAllowlistedProfileImage("https://cdninstagram.com/a.jpg", {
        fetchFn: fetchFn as typeof fetch
      }),
    (err: unknown) => err instanceof ProfileAvatarFetchError && err.code === "redirect_host_blocked"
  );
});

test("fetch rejects non-image and oversize responses", async () => {
  const htmlFetch = async () =>
    new Response("<html></html>", {
      status: 200,
      headers: { "content-type": "text/html" }
    });
  await assert.rejects(() => fetchAllowlistedProfileImage("https://cdninstagram.com/a.jpg", { fetchFn: htmlFetch as typeof fetch }));

  const svgFetch = async () =>
    new Response("<svg></svg>", {
      status: 200,
      headers: { "content-type": "image/svg+xml" }
    });
  await assert.rejects(() => fetchAllowlistedProfileImage("https://cdninstagram.com/a.jpg", { fetchFn: svgFetch as typeof fetch }));

  const bigBody = new Uint8Array(600);
  bigBody[0] = 0xff;
  bigBody[1] = 0xd8;
  const bigFetch = async () =>
    new Response(bigBody, {
      status: 200,
      headers: { "content-type": "image/jpeg" }
    });
  await assert.rejects(() =>
    fetchAllowlistedProfileImage("https://cdninstagram.com/a.jpg", {
      fetchFn: bigFetch as typeof fetch,
      maxBytes: 512
    })
  );
});

test("fetchAllowlistedProfileImage accepts image/jpeg 200", async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const fetchFn = async () =>
    new Response(jpeg, {
      status: 200,
      headers: { "content-type": "image/jpeg" }
    });
  const result = await fetchAllowlistedProfileImage("https://cdninstagram.com/pic.jpg", {
    fetchFn: fetchFn as typeof fetch
  });
  assert.equal(result.body.length, 4);
});

test("hashProfileImageSourceUrl is stable", () => {
  const a = hashProfileImageSourceUrl("https://cdninstagram.com/x");
  const b = hashProfileImageSourceUrl("https://cdninstagram.com/x");
  assert.equal(a, b);
  assert.notEqual(a, hashProfileImageSourceUrl("https://cdninstagram.com/y"));
});

test("buildProfileAvatarPublicUrl encodes storage path", () => {
  const url = buildProfileAvatarPublicUrl("tenant/avatars/id.jpg", {
    SUPABASE_URL: "https://proj.supabase.co",
    HUBCHAT_PROFILE_AVATAR_BUCKET: "profile-avatars"
  });
  assert.equal(
    url,
    "https://proj.supabase.co/storage/v1/object/public/profile-avatars/tenant/avatars/id.jpg"
  );
});
