import test from "node:test";
import assert from "node:assert/strict";
import { hashProfileImageSourceUrl } from "../../lib/profileAvatarCache.js";
import { ProfileAvatarCacheService } from "./profileAvatarCacheService.js";

function makeSupabaseMock(uploadError: Error | null = null) {
  return {
    storage: {
      from: () => ({
        upload: async () => ({ error: uploadError })
      })
    }
  } as never;
}

test("cacheFromSourceUrl uploads jpeg and returns ok", async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const fetchFn = async () =>
    new Response(jpeg, {
      status: 200,
      headers: { "content-type": "image/jpeg" }
    });
  const service = new ProfileAvatarCacheService(makeSupabaseMock(), {
    fetchFn: fetchFn as typeof fetch,
    reencodeToJpeg: async (body) => body
  });
  process.env.SUPABASE_URL = "https://proj.supabase.co";
  const result = await service.cacheFromSourceUrl({
    tenantId: "tenant-1",
    contactIdentityId: "identity-1",
    sourceUrl: "https://cdninstagram.com/pic.jpg",
    identity: {
      id: "identity-1",
      tenant_id: "tenant-1",
      contact_id: "contact-1",
      profile_image_url: "https://cdninstagram.com/pic.jpg",
      profile_image_cached_path: null,
      profile_image_cache_status: null,
      profile_image_source_url_hash: null
    }
  });
  assert.equal(result.outcome, "ok");
  if (result.outcome === "ok") {
    assert.match(result.storagePath, /tenant-1\/avatars\/identity-1\.jpg/);
    assert.match(result.publicUrl, /profile-avatars/);
  }
});

test("cacheFromSourceUrl maps 403 to failed without throwing", async () => {
  const fetchFn = async () => new Response("URL signature expired", { status: 403 });
  const service = new ProfileAvatarCacheService(makeSupabaseMock(), { fetchFn: fetchFn as typeof fetch });
  const result = await service.cacheFromSourceUrl({
    tenantId: "tenant-1",
    contactIdentityId: "identity-1",
    sourceUrl: "https://cdninstagram.com/expired.jpg",
    identity: {
      id: "identity-1",
      tenant_id: "tenant-1",
      contact_id: null,
      profile_image_url: "https://cdninstagram.com/expired.jpg",
      profile_image_cached_path: null,
      profile_image_cache_status: null,
      profile_image_source_url_hash: null
    }
  });
  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    assert.equal(result.retryable, false);
  }
});

test("shouldSkipDownload when hash unchanged and cache ok", () => {
  const service = new ProfileAvatarCacheService(makeSupabaseMock());
  const url = "https://cdninstagram.com/same.jpg";
  const realHash = hashProfileImageSourceUrl(url);
  assert.equal(
    service.shouldSkipDownload(
      {
        id: "i",
        tenant_id: "t",
        contact_id: null,
        profile_image_url: url,
        profile_image_cached_path: "t/avatars/i.jpg",
        profile_image_cache_status: "ok",
        profile_image_source_url_hash: realHash
      },
      url
    ),
    true
  );
});
