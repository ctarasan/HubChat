import test from "node:test";
import assert from "node:assert/strict";
import { SendMessageSchema } from "./contracts.js";
import { createMessagesSendPostHandler } from "../../../app/api/messages/send/route.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const LEAD_ID = "9e68eadd-01b6-4c66-a522-74b97d6a6902";
const CONVERSATION_ID = "d17bc402-7461-48fb-8b75-f2f3b02eb1b1";

function makeReq(body: unknown): { json: () => Promise<unknown>; headers: Headers } {
  return {
    json: async () => body,
    headers: new Headers()
  };
}

test("POST /api/messages/send returns 400 with exact schema error body", async () => {
  const payload = {
    tenantId: TENANT_ID,
    leadId: LEAD_ID,
    conversationId: CONVERSATION_ID,
    channel: "INSTAGRAM" as const,
    channelThreadId: "ig:user:12345",
    type: "image" as const,
    content: "caption",
    mediaUrl: "https://cdn.example.com/picture.jpg",
    mediaMimeType: "image/jpeg" as const,
    fileSizeBytes: 9 * 1024 * 1024
  };
  const parsed = SendMessageSchema.safeParse(payload);
  assert.equal(parsed.success, false);
  if (parsed.success) return;

  const handler = createMessagesSendPostHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u-1", email: "qa@example.com", role: "ADMIN" }) as any,
    apiBootstrap: () =>
      ({
        conversationRepository: {
          findById: async () => ({ channelThreadId: "ig:user:12345", providerThreadType: "INSTAGRAM_DM" })
        },
        outboundCommandRepository: {
          createOutboundMessageAndOutbox: async () => ({ messageId: "msg-should-not-create" })
        }
      }) as any
  });

  const response = await handler(makeReq(payload) as any);
  assert.equal(response.status, 400);
  const body = JSON.parse(await response.text());
  assert.deepEqual(body, { error: parsed.error.message });
});

test("POST /api/messages/send returns 202 with exact success body", async () => {
  let capturedInput: any = null;
  const payload = {
    tenantId: TENANT_ID,
    leadId: LEAD_ID,
    conversationId: CONVERSATION_ID,
    conversationIds: [CONVERSATION_ID],
    channel: "INSTAGRAM" as const,
    channelThreadId: "ig:user:12345",
    type: "image" as const,
    content: "caption from ui",
    mediaUrl: "https://cdn.example.com/picture.jpg",
    previewUrl: "https://cdn.example.com/picture.jpg",
    mediaMimeType: "image/jpeg" as const,
    fileSizeBytes: 1024
  };
  const handler = createMessagesSendPostHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u-1", email: "qa@example.com", role: "ADMIN" }) as any,
    apiBootstrap: () =>
      ({
        conversationRepository: {
          findById: async () => ({ channelThreadId: "ig:user:12345", providerThreadType: "INSTAGRAM_DM" })
        },
        outboundCommandRepository: {
          createOutboundMessageAndOutbox: async (input: Record<string, unknown>) => {
            capturedInput = input;
            return { messageId: "out-msg-202" };
          }
        }
      }) as any
  });

  const response = await handler(makeReq(payload) as any);
  assert.equal(response.status, 202);
  const body = JSON.parse(await response.text());
  assert.deepEqual(body, { data: { messageId: "out-msg-202", status: "QUEUED" } });
  assert.equal(capturedInput?.messageType, "IMAGE");
  assert.equal(capturedInput?.channel, "INSTAGRAM");
  assert.equal(capturedInput?.mediaMimeType, "image/jpeg");
});

