import test from "node:test";
import assert from "node:assert/strict";
import { SendMessageSchema } from "./contracts.js";

test("Facebook image > 8MB is rejected before enqueue", () => {
  const parsed = SendMessageSchema.safeParse({
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "FACEBOOK",
    channelThreadId: "user:12345",
    type: "image",
    mediaUrl: "https://cdn.example.com/picture.jpg",
    mediaMimeType: "image/jpeg",
    fileSizeBytes: 9 * 1024 * 1024
  });
  assert.equal(parsed.success, false);
  if (parsed.success) return;
  assert.equal(parsed.error.issues.some((x) => x.path.join(".") === "fileSizeBytes"), true);
});

test("LINE image with non-HTTPS URL is rejected before enqueue", () => {
  const parsed = SendMessageSchema.safeParse({
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "LINE",
    channelThreadId: "U1234",
    type: "image",
    mediaUrl: "http://cdn.example.com/picture.jpg",
    mediaMimeType: "image/jpeg"
  });
  assert.equal(parsed.success, false);
});
