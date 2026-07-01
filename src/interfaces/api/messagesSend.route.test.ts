import test from "node:test";
import assert from "node:assert/strict";
import { SendMessageSchema } from "./contracts.js";
import { createMessagesSendPostHandler } from "../../../app/api/messages/send/route.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const LEAD_ID = "9e68eadd-01b6-4c66-a522-74b97d6a6902";
const CONVERSATION_ID = "d17bc402-7461-48fb-8b75-f2f3b02eb1b1";
const SALES_AGENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_AGENT_ID = "22222222-2222-4222-8222-222222222222";
const FB_COMMENT_ID = "33333333-3333-4333-8333-333333333333";
const FB_DM_ID = "44444444-4444-4444-8444-444444444444";

function makeReq(body: unknown): { json: () => Promise<unknown>; headers: Headers } {
  return {
    json: async () => body,
    headers: new Headers()
  };
}

function baseInstagramPayload(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT_ID,
    leadId: LEAD_ID,
    conversationId: CONVERSATION_ID,
    channel: "INSTAGRAM" as const,
    channelThreadId: "ig:user:12345",
    type: "image" as const,
    content: "caption",
    mediaUrl: "https://cdn.example.com/picture.jpg",
    mediaMimeType: "image/jpeg" as const,
    fileSizeBytes: 1024,
    ...overrides
  };
}

function instagramConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONVERSATION_ID,
    tenantId: TENANT_ID,
    leadId: LEAD_ID,
    channelType: "INSTAGRAM",
    channelThreadId: "ig:user:12345",
    providerThreadType: "INSTAGRAM_DM",
    status: "OPEN",
    lastMessageAt: new Date(),
    ...overrides
  };
}

const enqueueBindingDeps = {
  channelConnectionRepository: {
    findById: async () => null,
    findByTenantAndProvider: async () => null
  },
  instagramOAuthCredentialRepository: {
    findByConnection: async () => []
  },
  channelSettingRepository: {
    findByTenantAndChannel: async () => ({ configured: false }),
    getRuntimeConfigForConnectionTest: async () => null
  }
};

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
  if (!parsed.success) {
    const handler = createMessagesSendPostHandler({
      requireAuth: async () =>
        ({
          tenantId: TENANT_ID,
          userId: "u-1",
          email: "qa@example.com",
          role: "ADMIN",
          salesAgentId: null
        }) as any,
      apiBootstrap: () =>
        ({
          conversationRepository: {
            findById: async () => instagramConversation({ assignedAgentId: OTHER_AGENT_ID })
          },
          ...enqueueBindingDeps,
        outboundCommandRepository: {
            createOutboundMessageAndOutbox: async () => ({ messageId: "msg-should-not-create" })
          }
        }) as any
    });

    const response = await handler(makeReq(payload) as any);
    assert.equal(response.status, 400);
    const body = JSON.parse(await response.text());
    assert.deepEqual(body, { error: parsed.error.message });
  }
});

test("POST /api/messages/send returns 202 with exact success body (ADMIN)", async () => {
  let capturedInput: any = null;
  const payload = {
    ...baseInstagramPayload(),
    conversationIds: [CONVERSATION_ID]
  };
  const handler = createMessagesSendPostHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u-1",
        email: "qa@example.com",
        role: "ADMIN",
        salesAgentId: null
      }) as any,
    apiBootstrap: () =>
      ({
        conversationRepository: {
          findById: async () => instagramConversation({ assignedAgentId: OTHER_AGENT_ID })
        },
        ...enqueueBindingDeps,
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

test("MANAGER can reply to same-tenant conversation regardless of assignee", async () => {
  let called = false;
  const handler = createMessagesSendPostHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u-1",
        email: "m@example.com",
        role: "MANAGER",
        salesAgentId: null
      }) as any,
    apiBootstrap: () =>
      ({
        conversationRepository: {
          findById: async () => instagramConversation({ assignedAgentId: OTHER_AGENT_ID })
        },
        ...enqueueBindingDeps,
        outboundCommandRepository: {
          createOutboundMessageAndOutbox: async () => {
            called = true;
            return { messageId: "mgr-1" };
          }
        }
      }) as any
  });
  const res = await handler(makeReq(baseInstagramPayload()) as any);
  assert.equal(res.status, 202);
  assert.equal(called, true);
});

test("SALES can reply when assignedAgentId matches auth.salesAgentId", async () => {
  let called = false;
  const handler = createMessagesSendPostHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u-1",
        email: "s@example.com",
        role: "SALES",
        salesAgentId: SALES_AGENT_ID
      }) as any,
    apiBootstrap: () =>
      ({
        conversationRepository: {
          findById: async () => instagramConversation({ assignedAgentId: SALES_AGENT_ID })
        },
        ...enqueueBindingDeps,
        outboundCommandRepository: {
          createOutboundMessageAndOutbox: async () => {
            called = true;
            return { messageId: "s-1" };
          }
        }
      }) as any
  });
  const res = await handler(makeReq(baseInstagramPayload()) as any);
  assert.equal(res.status, 202);
  assert.equal(called, true);
});

test("SALES cannot reply to unassigned conversation", async () => {
  let called = false;
  const handler = createMessagesSendPostHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u-1",
        email: "s@example.com",
        role: "SALES",
        salesAgentId: SALES_AGENT_ID
      }) as any,
    apiBootstrap: () =>
      ({
        conversationRepository: {
          findById: async () => instagramConversation({ assignedAgentId: null })
        },
        ...enqueueBindingDeps,
        outboundCommandRepository: {
          createOutboundMessageAndOutbox: async () => {
            called = true;
            return { messageId: "x" };
          }
        }
      }) as any
  });
  const res = await handler(makeReq(baseInstagramPayload()) as any);
  assert.equal(res.status, 403);
  const body = JSON.parse(await res.text());
  assert.equal(body.error, "You can only reply to conversations assigned to you.");
  assert.equal(called, false);
});

test("SALES cannot reply when assigned to another agent", async () => {
  let called = false;
  const handler = createMessagesSendPostHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u-1",
        email: "s@example.com",
        role: "SALES",
        salesAgentId: SALES_AGENT_ID
      }) as any,
    apiBootstrap: () =>
      ({
        conversationRepository: {
          findById: async () => instagramConversation({ assignedAgentId: OTHER_AGENT_ID })
        },
        ...enqueueBindingDeps,
        outboundCommandRepository: {
          createOutboundMessageAndOutbox: async () => {
            called = true;
            return { messageId: "x" };
          }
        }
      }) as any
  });
  const res = await handler(makeReq(baseInstagramPayload()) as any);
  assert.equal(res.status, 403);
  const body = JSON.parse(await res.text());
  assert.equal(body.error, "This conversation is assigned to another sales agent.");
  assert.equal(called, false);
});

test("SALES with missing salesAgentId cannot reply", async () => {
  let called = false;
  const handler = createMessagesSendPostHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u-1",
        email: "s@example.com",
        role: "SALES",
        salesAgentId: null
      }) as any,
    apiBootstrap: () =>
      ({
        conversationRepository: {
          findById: async () => instagramConversation({ assignedAgentId: SALES_AGENT_ID })
        },
        ...enqueueBindingDeps,
        outboundCommandRepository: {
          createOutboundMessageAndOutbox: async () => {
            called = true;
            return { messageId: "x" };
          }
        }
      }) as any
  });
  const res = await handler(makeReq(baseInstagramPayload()) as any);
  assert.equal(res.status, 403);
  const body = JSON.parse(await res.text());
  assert.equal(body.error, "Your sales agent profile is not active for this tenant; you cannot send replies.");
  assert.equal(called, false);
});

test("cross-tenant conversation still returns Conversation not found", async () => {
  let called = false;
  const handler = createMessagesSendPostHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u-1",
        email: "a@example.com",
        role: "ADMIN",
        salesAgentId: null
      }) as any,
    apiBootstrap: () =>
      ({
        conversationRepository: {
          findById: async () => null
        },
        ...enqueueBindingDeps,
        outboundCommandRepository: {
          createOutboundMessageAndOutbox: async () => {
            called = true;
            return { messageId: "x" };
          }
        }
      }) as any
  });
  const res = await handler(makeReq(baseInstagramPayload()) as any);
  assert.equal(res.status, 400);
  const body = JSON.parse(await res.text());
  assert.equal(body.error, "Conversation not found");
  assert.equal(called, false);
});

test("FACEBOOK dual conversation: SALES owns primary but resolved DM is unassigned โ’ 403, no outbox", async () => {
  let called = false;
  const payload = {
    tenantId: TENANT_ID,
    leadId: LEAD_ID,
    conversationId: FB_COMMENT_ID,
    conversationIds: [FB_COMMENT_ID, FB_DM_ID],
    channel: "FACEBOOK" as const,
    channelThreadId: "comment:999",
    type: "text" as const,
    content: "hello"
  };
  const handler = createMessagesSendPostHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u-1",
        email: "s@example.com",
        role: "SALES",
        salesAgentId: SALES_AGENT_ID
      }) as any,
    apiBootstrap: () =>
      ({
        conversationRepository: {
          findById: async (_tid: string, cid: string) => {
            if (cid === FB_COMMENT_ID) {
              return {
                id: FB_COMMENT_ID,
                tenantId: TENANT_ID,
                leadId: LEAD_ID,
                channelType: "FACEBOOK",
                channelThreadId: "comment:999",
                providerThreadType: "FACEBOOK_COMMENT",
                status: "OPEN",
                lastMessageAt: new Date(),
                assignedAgentId: SALES_AGENT_ID
              };
            }
            if (cid === FB_DM_ID) {
              return {
                id: FB_DM_ID,
                tenantId: TENANT_ID,
                leadId: LEAD_ID,
                channelType: "FACEBOOK",
                channelThreadId: "user:psid",
                providerThreadType: "MESSENGER_DM",
                status: "OPEN",
                lastMessageAt: new Date(),
                assignedAgentId: null
              };
            }
            return null;
          }
        },
        ...enqueueBindingDeps,
        outboundCommandRepository: {
          createOutboundMessageAndOutbox: async () => {
            called = true;
            return { messageId: "fb-bad" };
          }
        }
      }) as any
  });
  const res = await handler(makeReq(payload) as any);
  assert.equal(res.status, 403);
  assert.equal(called, false);
});

test("FACEBOOK dual conversation: SALES owns both primary and resolved DM โ’ 202", async () => {
  let called = false;
  const payload = {
    tenantId: TENANT_ID,
    leadId: LEAD_ID,
    conversationId: FB_COMMENT_ID,
    conversationIds: [FB_COMMENT_ID, FB_DM_ID],
    channel: "FACEBOOK" as const,
    channelThreadId: "comment:999",
    type: "text" as const,
    content: "hello"
  };
  const handler = createMessagesSendPostHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u-1",
        email: "s@example.com",
        role: "SALES",
        salesAgentId: SALES_AGENT_ID
      }) as any,
    apiBootstrap: () =>
      ({
        conversationRepository: {
          findById: async (_tid: string, cid: string) => {
            if (cid === FB_COMMENT_ID) {
              return {
                id: FB_COMMENT_ID,
                tenantId: TENANT_ID,
                leadId: LEAD_ID,
                channelType: "FACEBOOK",
                channelThreadId: "comment:999",
                providerThreadType: "FACEBOOK_COMMENT",
                status: "OPEN",
                lastMessageAt: new Date(),
                assignedAgentId: SALES_AGENT_ID
              };
            }
            if (cid === FB_DM_ID) {
              return {
                id: FB_DM_ID,
                tenantId: TENANT_ID,
                leadId: LEAD_ID,
                channelType: "FACEBOOK",
                channelThreadId: "user:psid",
                providerThreadType: "MESSENGER_DM",
                status: "OPEN",
                lastMessageAt: new Date(),
                assignedAgentId: SALES_AGENT_ID
              };
            }
            return null;
          }
        },
        ...enqueueBindingDeps,
        outboundCommandRepository: {
          createOutboundMessageAndOutbox: async () => {
            called = true;
            return { messageId: "fb-ok" };
          }
        }
      }) as any
  });
  const res = await handler(makeReq(payload) as any);
  assert.equal(res.status, 202);
  assert.equal(called, true);
});

test("POST /api/messages/send rejects Instagram PDF before outbox enqueue", async () => {
  let called = false;
  const payload = {
    tenantId: TENANT_ID,
    leadId: LEAD_ID,
    conversationId: CONVERSATION_ID,
    channel: "INSTAGRAM" as const,
    channelThreadId: "ig:user:12345",
    type: "document_pdf" as const,
    content: "see attached",
    mediaUrl: "https://cdn.example.com/doc.pdf",
    mediaMimeType: "application/pdf" as const,
    fileName: "doc.pdf",
    fileSizeBytes: 1024
  };
  const handler = createMessagesSendPostHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u-1",
        email: "qa@example.com",
        role: "ADMIN",
        salesAgentId: null
      }) as any,
    apiBootstrap: () =>
      ({
        conversationRepository: {
          findById: async () => instagramConversation({ assignedAgentId: OTHER_AGENT_ID })
        },
        ...enqueueBindingDeps,
        outboundCommandRepository: {
          createOutboundMessageAndOutbox: async () => {
            called = true;
            return { messageId: "should-not-create" };
          }
        }
      }) as any
  });
  const res = await handler(makeReq(payload) as any);
  assert.equal(res.status, 400);
  const body = JSON.parse(await res.text());
  assert.match(body.error, /Instagram DM does not support PDF/);
  assert.equal(called, false);
});

test("POST /api/messages/send rejects unsupported channel before outbox enqueue", async () => {
  let called = false;
  const payload = {
    tenantId: TENANT_ID,
    leadId: LEAD_ID,
    conversationId: CONVERSATION_ID,
    channel: "TIKTOK" as const,
    channelThreadId: "tiktok:thread:1",
    type: "text" as const,
    content: "hello"
  };
  const handler = createMessagesSendPostHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u-1",
        email: "qa@example.com",
        role: "ADMIN",
        salesAgentId: null
      }) as any,
    apiBootstrap: () =>
      ({
        conversationRepository: {
          findById: async () => ({
            id: CONVERSATION_ID,
            tenantId: TENANT_ID,
            leadId: LEAD_ID,
            channelType: "TIKTOK",
            channelThreadId: "tiktok:thread:1",
            status: "OPEN",
            lastMessageAt: new Date()
          })
        },
        ...enqueueBindingDeps,
        outboundCommandRepository: {
          createOutboundMessageAndOutbox: async () => {
            called = true;
            return { messageId: "should-not-create" };
          }
        }
      }) as any
  });
  const res = await handler(makeReq(payload) as any);
  assert.equal(res.status, 400);
  const body = JSON.parse(await res.text());
  assert.match(body.error, /not supported for this channel/);
  assert.equal(called, false);
});

test("POST /api/messages/send maintenance gate ON returns 503 after auth without outbound write", async () => {
  const previous = process.env.HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED;
  process.env.HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED = "true";
  try {
    let outboundCalled = false;
    const handler = createMessagesSendPostHandler({
      requireAuth: async () =>
        ({
          tenantId: TENANT_ID,
          userId: "u-1",
          email: "qa@example.com",
          role: "ADMIN",
          salesAgentId: null
        }) as any,
      apiBootstrap: () => {
        outboundCalled = true;
        return {
          conversationRepository: { findById: async () => instagramConversation() },
          ...enqueueBindingDeps,
          outboundCommandRepository: {
            createOutboundMessageAndOutbox: async () => ({ messageId: "should-not-create" })
          }
        } as any;
      }
    });
    const res = await handler(makeReq(baseInstagramPayload()) as any);
    assert.equal(res.status, 503);
    assert.equal(outboundCalled, false);
    const body = JSON.parse(await res.text());
    assert.equal(body.code, "CHAT_INGRESS_MAINTENANCE");
    assert.equal(res.headers.get("Retry-After"), "60");
  } finally {
    if (previous === undefined) delete process.env.HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED;
    else process.env.HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED = previous;
  }
});

test("POST /api/messages/send unauthenticated callers still receive 401 when maintenance gate ON", async () => {
  const previous = process.env.HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED;
  process.env.HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED = "true";
  try {
    const handler = createMessagesSendPostHandler({
      requireAuth: async () => {
        throw new Error("Unauthorized");
      },
      apiBootstrap: () => {
        throw new Error("should not bootstrap");
      }
    });
    const res = await handler(makeReq(baseInstagramPayload()) as any);
    assert.equal(res.status, 401);
  } finally {
    if (previous === undefined) delete process.env.HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED;
    else process.env.HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED = previous;
  }
});

