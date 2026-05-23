import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  createMessagesUploadImagePostHandler,
  type UploadImageStorageClient
} from "../../../app/api/messages/upload-image/route.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

function makeUploadReq(file: File, fields: Record<string, string> = {}): NextRequest {
  const form = new FormData();
  form.set("file", file);
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new NextRequest("http://local/api/messages/upload-image", {
    method: "POST",
    body: form
  });
}

function mockStorageClient(mediaUrl: string): UploadImageStorageClient {
  return {
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: mediaUrl } }),
        createSignedUrl: async () => ({ data: { signedUrl: mediaUrl }, error: null })
      })
    }
  };
}

test("POST /api/messages/upload-image rejects unsupported MIME", async () => {
  const handler = createMessagesUploadImagePostHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u-1",
        email: "qa@example.com",
        role: "ADMIN",
        salesAgentId: null
      }) as any,
    createStorageClient: () => mockStorageClient("https://cdn.example.com/x.gif")
  });
  const file = new File([Buffer.from("gif")], "x.gif", { type: "image/gif" });
  const res = await handler(makeUploadReq(file));
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error?: string };
  assert.match(body.error ?? "", /Only image\/jpeg, image\/png, image\/webp are supported/);
});

test("POST /api/messages/upload-image returns HTTPS mediaUrl for JPEG", async () => {
  const handler = createMessagesUploadImagePostHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u-1",
        email: "qa@example.com",
        role: "ADMIN",
        salesAgentId: null
      }) as any,
    createStorageClient: () => mockStorageClient("https://cdn.example.com/out.jpg"),
    urlMode: "signed"
  });
  const file = new File([Buffer.from("jpeg-bytes")], "photo.jpg", { type: "image/jpeg" });
  const res = await handler(makeUploadReq(file, { width: "100", height: "200" }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    data?: {
      mediaUrl?: string;
      mediaMimeType?: string;
      fileSizeBytes?: number;
      width?: number | null;
      height?: number | null;
    };
  };
  assert.equal(body.data?.mediaMimeType, "image/jpeg");
  assert.match(body.data?.mediaUrl ?? "", /^https:\/\//);
  assert.equal(body.data?.fileSizeBytes, file.size);
  assert.equal(body.data?.width, 100);
  assert.equal(body.data?.height, 200);
});
