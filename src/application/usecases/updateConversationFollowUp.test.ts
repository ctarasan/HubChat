import test from "node:test";
import assert from "node:assert/strict";
import { UpdateConversationFollowUpUseCase } from "./updateConversationFollowUp.js";
import type { AuthContext } from "../../interfaces/api/auth.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const CONV = "3b241101-e2bb-4955-9933-fd6a836e82f8";
const LEAD = "6b241101-e2bb-4955-9933-fd6a836e82fb";
const AGENT_SELF = "11111111-1111-4111-8111-111111111111";
const AGENT_OTHER = "22222222-2222-4222-8222-222222222222";

function auth(overrides: Partial<AuthContext>): AuthContext {
  return {
    tenantId: TENANT,
    userId: "00000000-0000-4000-8000-000000000001",
    email: "a@x.com",
    role: "MANAGER",
    salesAgentId: AGENT_OTHER,
    ...overrides
  };
}

function baseConv(overrides?: Record<string, unknown>) {
  return {
    id: CONV,
    tenantId: TENANT,
    leadId: LEAD,
    channelType: "LINE" as const,
    channelThreadId: "t1",
    status: "OPEN" as const,
    lastMessageAt: new Date(),
    assignedAgentId: null as string | null,
    followUpAt: new Date("2026-05-10T00:00:00.000Z") as Date | null,
    followUpNote: "old" as string | null,
    ...overrides
  };
}

test("MANAGER can update follow-up", async () => {
  let patchIn: any = null;
  const uc = new UpdateConversationFollowUpUseCase({
    conversationRepository: {
      findById: async () => baseConv(),
      updateConversationFollowUp: async (input) => {
        patchIn = input.patch;
      }
    }
  });
  const out = await uc.execute({
    auth: auth({ role: "MANAGER" }),
    conversationId: CONV,
    patch: { followUpAt: "2026-05-15T09:00:00.000Z" }
  });
  assert.equal(out.followUpAt, "2026-05-15T09:00:00.000Z");
  assert.equal(out.followUpNote, "old");
  assert.equal(patchIn.followUpAt?.toISOString(), "2026-05-15T09:00:00.000Z");
});

test("ADMIN can update follow-up", async () => {
  let called = false;
  const uc = new UpdateConversationFollowUpUseCase({
    conversationRepository: {
      findById: async () => baseConv(),
      updateConversationFollowUp: async () => {
        called = true;
      }
    }
  });
  await uc.execute({
    auth: auth({ role: "ADMIN" }),
    conversationId: CONV,
    patch: { followUpNote: "n" }
  });
  assert.equal(called, true);
});

test("assigned SALES can update", async () => {
  const uc = new UpdateConversationFollowUpUseCase({
    conversationRepository: {
      findById: async () => baseConv({ assignedAgentId: AGENT_SELF }),
      updateConversationFollowUp: async () => {}
    }
  });
  await uc.execute({
    auth: auth({ role: "SALES", salesAgentId: AGENT_SELF }),
    conversationId: CONV,
    patch: { followUpNote: "ok" }
  });
});

test("unassigned SALES gets forbidden", async () => {
  const uc = new UpdateConversationFollowUpUseCase({
    conversationRepository: {
      findById: async () => baseConv({ assignedAgentId: null }),
      updateConversationFollowUp: async () => {}
    }
  });
  await assert.rejects(
    uc.execute({
      auth: auth({ role: "SALES", salesAgentId: AGENT_SELF }),
      conversationId: CONV,
      patch: { followUpNote: "x" }
    }),
    /Forbidden conversation follow-up update/
  );
});

test("wrong assignee SALES gets forbidden", async () => {
  const uc = new UpdateConversationFollowUpUseCase({
    conversationRepository: {
      findById: async () => baseConv({ assignedAgentId: AGENT_OTHER }),
      updateConversationFollowUp: async () => {}
    }
  });
  await assert.rejects(
    uc.execute({
      auth: auth({ role: "SALES", salesAgentId: AGENT_SELF }),
      conversationId: CONV,
      patch: { followUpNote: "x" }
    }),
    /Forbidden conversation follow-up update/
  );
});

test("missing conversation throws", async () => {
  const uc = new UpdateConversationFollowUpUseCase({
    conversationRepository: {
      findById: async () => null,
      updateConversationFollowUp: async () => {}
    }
  });
  await assert.rejects(
    uc.execute({ auth: auth({ role: "MANAGER" }), conversationId: CONV, patch: { followUpNote: "x" } }),
    /Conversation not found/
  );
});

test("null clears followUpAt in repository patch", async () => {
  let patchIn: any = null;
  const uc = new UpdateConversationFollowUpUseCase({
    conversationRepository: {
      findById: async () => baseConv(),
      updateConversationFollowUp: async (input) => {
        patchIn = input.patch;
      }
    }
  });
  const out = await uc.execute({
    auth: auth({ role: "MANAGER" }),
    conversationId: CONV,
    patch: { followUpAt: null }
  });
  assert.equal(patchIn.followUpAt, null);
  assert.equal(out.followUpAt, null);
  assert.equal(out.followUpNote, "old");
});

test("null clears followUpNote", async () => {
  let patchIn: any = null;
  const uc = new UpdateConversationFollowUpUseCase({
    conversationRepository: {
      findById: async () => baseConv(),
      updateConversationFollowUp: async (input) => {
        patchIn = input.patch;
      }
    }
  });
  const out = await uc.execute({
    auth: auth({ role: "MANAGER" }),
    conversationId: CONV,
    patch: { followUpNote: null }
  });
  assert.equal(patchIn.followUpNote, null);
  assert.equal(out.followUpNote, null);
});

test("omitted followUpNote does not change output note", async () => {
  let patchIn: any = null;
  const uc = new UpdateConversationFollowUpUseCase({
    conversationRepository: {
      findById: async () => baseConv(),
      updateConversationFollowUp: async (input) => {
        patchIn = input.patch;
      }
    }
  });
  const out = await uc.execute({
    auth: auth({ role: "MANAGER" }),
    conversationId: CONV,
    patch: { followUpAt: "2026-05-20T12:00:00.000Z" }
  });
  assert.equal(Object.prototype.hasOwnProperty.call(patchIn, "followUpNote"), false);
  assert.equal(out.followUpNote, "old");
});
