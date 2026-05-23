import test from "node:test";
import assert from "node:assert/strict";
import { UpdateConversationLeadStatusUseCase } from "./updateConversationLeadStatus.js";
import type { AuthContext } from "../../interfaces/api/auth.js";
import type { LeadStatus } from "../../domain/entities.js";

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
    followUpNote: "reminder" as string | null,
    ...overrides
  };
}

function baseLead(status: LeadStatus = "CONTACTED") {
  return {
    id: LEAD,
    tenantId: TENANT,
    sourceChannel: "LINE" as const,
    externalUserId: "u1",
    name: null,
    phone: null,
    email: null,
    status,
    assignedSalesId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastContactAt: null,
    tags: [] as string[]
  };
}

function makeDeps(opts: {
  conv?: ReturnType<typeof baseConv> | null;
  lead?: ReturnType<typeof baseLead> | null;
  forbidLeadPatch?: boolean;
}) {
  const leadPatches: unknown[] = [];
  const followUpPatches: unknown[] = [];
  const events: unknown[] = [];
  const activity: unknown[] = [];
  const conv = opts.conv === undefined ? baseConv() : opts.conv;
  const lead = opts.lead === undefined ? baseLead() : opts.lead;

  return {
    leadPatches,
    followUpPatches,
    events,
    activity,
    useCase: new UpdateConversationLeadStatusUseCase({
      conversationRepository: {
        findById: async (tenantId: string, conversationId: string) => {
          if (!conv || tenantId !== TENANT || conversationId !== CONV) return null;
          return { ...conv };
        },
        updateConversationFollowUp: async (input: { patch: { followUpAt?: Date | null } }) => {
          followUpPatches.push(input);
        }
      },
      leadRepository: {
        findById: async (tenantId: string, leadId: string) => {
          if (!lead || tenantId !== TENANT || leadId !== LEAD) return null;
          return { ...lead };
        },
        patch: async (tenantId: string, leadId: string, patch: unknown) => {
          if (opts.forbidLeadPatch) throw new Error("db failure");
          if (tenantId !== TENANT || leadId !== LEAD) throw new Error("cross-tenant");
          leadPatches.push({ tenantId, leadId, patch });
        }
      },
      conversationEventRepository: {
        create: async (input: unknown) => {
          events.push(input);
        }
      },
      activityLogRepository: {
        create: async (input: unknown) => {
          activity.push(input);
        }
      }
    })
  };
}

test("ADMIN can update lead status to WON and clears follow_up_at", async () => {
  const { useCase, leadPatches, followUpPatches, events } = makeDeps({});
  const out = await useCase.execute({
    auth: auth({ role: "ADMIN" }),
    conversationId: CONV,
    nextLeadStatus: "WON"
  });
  assert.equal(out.leadStatus, "WON");
  assert.equal(out.lead_status, "WON");
  assert.equal(out.followUpAt, null);
  assert.equal(out.followUpNote, "reminder");
  assert.equal(leadPatches.length, 1);
  assert.equal((leadPatches[0] as { patch: { status: string } }).patch.status, "WON");
  assert.equal(followUpPatches.length, 1);
  assert.equal((followUpPatches[0] as { patch: { followUpAt: null } }).patch.followUpAt, null);
  assert.equal((events[0] as { eventType: string }).eventType, "CONVERSATION_LEAD_STATUS_CHANGED");
});

test("MANAGER can update lead status", async () => {
  const { useCase, leadPatches } = makeDeps({ lead: baseLead("NEW") });
  const out = await useCase.execute({
    auth: auth({ role: "MANAGER" }),
    conversationId: CONV,
    nextLeadStatus: "IN_PROGRESS"
  });
  assert.equal(out.lead_status, "CONTACTED");
  assert.equal(leadPatches.length, 1);
});

test("assigned SALES can update", async () => {
  const { useCase } = makeDeps({ conv: baseConv({ assignedAgentId: AGENT_SELF }) });
  await useCase.execute({
    auth: auth({ role: "SALES", salesAgentId: AGENT_SELF }),
    conversationId: CONV,
    nextLeadStatus: "LOST"
  });
});

test("SALES cannot update unassigned conversation", async () => {
  const { useCase } = makeDeps({});
  await assert.rejects(
    useCase.execute({
      auth: auth({ role: "SALES", salesAgentId: AGENT_SELF }),
      conversationId: CONV,
      nextLeadStatus: "WON"
    }),
    /Forbidden conversation lead status update/
  );
});

test("SALES cannot update conversation assigned to another agent", async () => {
  const { useCase } = makeDeps({ conv: baseConv({ assignedAgentId: AGENT_OTHER }) });
  await assert.rejects(
    useCase.execute({
      auth: auth({ role: "SALES", salesAgentId: AGENT_SELF }),
      conversationId: CONV,
      nextLeadStatus: "WON"
    }),
    /Forbidden conversation lead status update/
  );
});

test("invalid management transition rejected", async () => {
  const { useCase } = makeDeps({ lead: baseLead("WON") });
  await assert.rejects(
    useCase.execute({
      auth: auth({ role: "MANAGER" }),
      conversationId: CONV,
      nextLeadStatus: "IN_PROGRESS"
    }),
    /Invalid lead management status transition/
  );
});

test("CLOSED clears follow_up_at", async () => {
  const { useCase, followUpPatches } = makeDeps({});
  await useCase.execute({
    auth: auth({ role: "MANAGER" }),
    conversationId: CONV,
    nextLeadStatus: "CLOSED"
  });
  assert.equal(followUpPatches.length, 1);
  assert.equal((followUpPatches[0] as { patch: { followUpAt: null } }).patch.followUpAt, null);
});

test("conversation not found", async () => {
  const { useCase } = makeDeps({ conv: null });
  await assert.rejects(
    useCase.execute({
      auth: auth({ role: "MANAGER" }),
      conversationId: CONV,
      nextLeadStatus: "WON"
    }),
    /Conversation not found/
  );
});
