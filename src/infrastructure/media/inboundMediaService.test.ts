import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { InboundMediaService } from "./inboundMediaService.js";

async function makeFetchResponse() {
  const bytes = await sharp({
    create: {
      width: 1,
      height: 1,
      channels: 3,
      background: { r: 255, g: 0, b: 0 }
    }
  })
    .png()
    .toBuffer();
  return {
    ok: true,
    status: 200,
    headers: {
      get: (key: string) => (key.toLowerCase() === "content-type" ? "image/png" : null)
    },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  } as any;
}

function makeSupabaseMock(mode: "public" | "signed") {
  const calls = {
    uploads: [] as string[],
    publicUrls: [] as string[],
    signedUrls: [] as Array<{ path: string; ttl: number }>
  };
  const fromApi = {
    upload: async (path: string) => {
      calls.uploads.push(path);
      return { error: null };
    },
    getPublicUrl: (path: string) => {
      calls.publicUrls.push(path);
      return { data: { publicUrl: `https://cdn.example/public/${path}` } };
    },
    createSignedUrl: async (path: string, ttl: number) => {
      calls.signedUrls.push({ path, ttl });
      return { data: { signedUrl: `https://cdn.example/sign/${path}?token=abc` }, error: null };
    }
  };
  const supabase = {
    storage: {
      from: (_bucket: string) => fromApi
    }
  } as any;
  if (mode === "public") {
    process.env.INBOUND_MEDIA_URL_MODE = "public";
  } else {
    process.env.INBOUND_MEDIA_URL_MODE = "signed";
  }
  process.env.INBOUND_MEDIA_BUCKET = "inbound-media";
  process.env.INBOUND_MEDIA_SIGNED_URL_TTL_SEC = "604800";
  return { supabase, calls };
}

test("public mode uses getPublicUrl and returns public URLs", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () => makeFetchResponse()) as any;
  const { supabase, calls } = makeSupabaseMock("public");
  const service = new InboundMediaService(supabase, { lineChannelAccessToken: "line-token" });
  const out = await service.processLineImage({ tenantId: "tenant-1", lineMessageId: "line-1" });
  assert.equal(calls.publicUrls.length, 2);
  assert.equal(calls.signedUrls.length, 0);
  assert.equal(out.metadata.urlMode, "public");
  assert.equal(out.metadata.storageBucket, "inbound-media");
  assert.equal(out.metadata.originalPath.includes("/original/line-1.jpg"), true);
  assert.equal(out.metadata.thumbPath.includes("/thumb/line-1.jpg"), true);
  assert.equal(out.mediaUrl.includes("/public/"), true);
  assert.equal(out.previewUrl.includes("/public/"), true);
  global.fetch = originalFetch;
});

test("signed mode uses createSignedUrl and records ttl in metadata", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () => makeFetchResponse()) as any;
  const { supabase, calls } = makeSupabaseMock("signed");
  const service = new InboundMediaService(supabase, { lineChannelAccessToken: "line-token" });
  const out = await service.processLineImage({ tenantId: "tenant-1", lineMessageId: "line-2" });
  assert.equal(calls.publicUrls.length, 0);
  assert.equal(calls.signedUrls.length, 2);
  assert.equal(calls.signedUrls[0]?.ttl, 604800);
  assert.equal(out.metadata.urlMode, "signed");
  assert.equal(out.metadata.signedUrlExpiresInSec, 604800);
  assert.equal(out.mediaUrl.includes("/sign/"), true);
  assert.equal(out.previewUrl.includes("/sign/"), true);
  global.fetch = originalFetch;
});

