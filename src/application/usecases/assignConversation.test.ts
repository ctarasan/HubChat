import test from "node:test";
import assert from "node:assert/strict";
import { AssignConversationUseCase } from "./assignConversation.js";
import type { ConversationForAssignment } from "../../domain/ports.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const OTHER_TENANT = "ca92d847-53cd-4b60-9e4d-5fd3f8ad8650";
const CONV = "3b241101-e2bb-4955-9933-fd6a836e82f8";
const AGENT_A = "4b241101-e2bb-4955-9933-fd6a836e82f9";
const AGENT_B = "5b241101-e2bb-4955-9933-fd6a836e82fa";
const LEAD = "6b241101-e2bb-4955-9933-fd6a836e82fb";

function baseConv(overrides?: Partial<ConversationForAssignment>): ConversationForAssignment {
  return {
    id: CONV,
    tenantId: TENANT,
    leadId: LEAD,
    assignedAgentId: null,
    assignmentStatus: "UNASSIGNED",
    status: "OPEN",
    ...overrides
  };
}

function makeUseCase(opts: {
  initial: ConversationForAssignment;
  salesAgentOk?: boolean;
  eventFail?: boolean;
}) {
  let conv = { ...opts.initial };
  const events: Array<Record<string, unknown>> = [];
  let leadAssignCalls: Array<{ leadId: string; salesAgentId: string }> = [];

  const useCase = new AssignConversationUseCase({
    conversationAssignmentStore: {
      findByIdForAssignment: async (tenantId, conversationId) => {
        if (tenantId !== conv.tenantId || conversationId !== conv.id) return null;
        return { ...conv };
      },
      updateAssignment: async (input) => {
        conv = {
          ...conv,
          assignedAgentId: input.assignedAgentId,
          assignmentStatus: input.assignmentStatus
        };
      }
    },
    leadRepository: {
      findById: async () => null,
      findByExternalUser: async () => null,
      create: async () => {
        throw new Error("unused");
      },
      updateStatus: async () => {},
      assign: async (leadId, salesAgentId) => {
        leadAssignCalls.push({ leadId, salesAgentId });
      },
      list: async () => ({ items: [], nextCursor: null })
    },
    conversationEventRepository: {
      create: async (input) => {
        if (opts.eventFail) throw new Error("db event failure");
        events.push({ ...input });
      }
    },
    salesAgentRepository: {
      findActiveByIdInTenant: async () => opts.salesAgentOk !== false
    }
  });

  return { useCase, getConv: () => ({ ...conv }), events, getLeadAssignCalls: () => leadAssignCalls };
}

test("MANAGER can assign unassigned conversation", async () => {
  const { useCase, getConv, events } = makeUseCase({ initial: baseConv() });
  const out = await useCase.assignOrReassign({
    tenantId: TENANT,
    actorAuthUserId: "7b241101-e2bb-4955-9933-fd6a836e82fc",
    actorSalesAgentId: AGENT_B,
    actorRole: "MANAGER",
    conversationId: CONV,
    targetSalesAgentId: AGENT_A
  });
  assert.equal(out.assignedAgentId, AGENT_A);
  assert.equal(out.assignmentStatus, "ASSIGNED");
  assert.equal(getConv().assignedAgentId, AGENT_A);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventType, "CONVERSATION_ASSIGNED");
});

test("ADMIN can assign unassigned conversation", async () => {
  const { useCase, events } = makeUseCase({ initial: baseConv() });
  await useCase.assignOrReassign({
    tenantId: TENANT,
    actorAuthUserId: "7b241101-e2bb-4955-9933-fd6a836e82fc",
    actorSalesAgentId: AGENT_B,
    actorRole: "ADMIN",
    conversationId: CONV,
    targetSalesAgentId: AGENT_A
  });
  assert.equal(events[0]?.eventType, "CONVERSATION_ASSIGNED");
});

test("MANAGER can reassign conversation", async () => {
  const { useCase, events } = makeUseCase({
    initial: baseConv({ assignedAgentId: AGENT_A, assignmentStatus: "ASSIGNED" })
  });
  await useCase.assignOrReassign({
    tenantId: TENANT,
    actorAuthUserId: "7b241101-e2bb-4955-9933-fd6a836e82fc",
    actorSalesAgentId: AGENT_B,
    actorRole: "MANAGER",
    conversationId: CONV,
    targetSalesAgentId: AGENT_B
  });
  assert.equal(events[0]?.eventType, "CONVERSATION_REASSIGNED");
  assert.deepEqual(events[0]?.oldValue, { assignedAgentId: AGENT_A });
  assert.deepEqual(events[0]?.newValue, { assignedAgentId: AGENT_B });
});

test("MANAGER can unassign conversation", async () => {
  const { useCase, getConv, events, getLeadAssignCalls } = makeUseCase({
    initial: baseConv({ assignedAgentId: AGENT_A, assignmentStatus: "ASSIGNED" })
  });
  const out = await useCase.unassign({
    tenantId: TENANT,
    actorAuthUserId: "7b241101-e2bb-4955-9933-fd6a836e82fc",
    actorSalesAgentId: AGENT_B,
    actorRole: "MANAGER",
    conversationId: CONV
  });
  assert.equal(out.assignedAgentId, null);
  assert.equal(out.assignmentStatus, "UNASSIGNED_AGAIN");
  assert.equal(getConv().assignedAgentId, null);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventType, "CONVERSATION_UNASSIGNED");
  assert.deepEqual(getLeadAssignCalls(), []);
});

test("SALES cannot assign conversation", async () => {
  const { useCase } = makeUseCase({ initial: baseConv() });
  await assert.rejects(
    () =>
      useCase.assignOrReassign({
        tenantId: TENANT,
        actorAuthUserId: "7b241101-e2bb-4955-9933-fd6a836e82fc",
        actorSalesAgentId: AGENT_A,
        actorRole: "SALES",
        conversationId: CONV,
        targetSalesAgentId: AGENT_B
      }),
    /Forbidden assign/
  );
});

test("invalid target sales agent is rejected", async () => {
  const { useCase } = makeUseCase({ initial: baseConv(), salesAgentOk: false });
  await assert.rejects(
    () =>
      useCase.assignOrReassign({
        tenantId: TENANT,
        actorAuthUserId: "7b241101-e2bb-4955-9933-fd6a836e82fc",
        actorSalesAgentId: AGENT_B,
        actorRole: "MANAGER",
        conversationId: CONV,
        targetSalesAgentId: AGENT_A
      }),
    /Invalid target sales agent/
  );
});

test("cross-tenant conversation is rejected", async () => {
  const { useCase } = makeUseCase({ initial: baseConv() });
  await assert.rejects(
    () =>
      useCase.assignOrReassign({
        tenantId: OTHER_TENANT,
        actorAuthUserId: "7b241101-e2bb-4955-9933-fd6a836e82fc",
        actorSalesAgentId: AGENT_B,
        actorRole: "MANAGER",
        conversationId: CONV,
        targetSalesAgentId: AGENT_A
      }),
    /Conversation not found/
  );
});

test("assign writes conversation event with actors and note", async () => {
  const { useCase, events } = makeUseCase({ initial: baseConv() });
  await useCase.assignOrReassign({
    tenantId: TENANT,
    actorAuthUserId: "7b241101-e2bb-4955-9933-fd6a836e82fc",
    actorSalesAgentId: AGENT_B,
    actorRole: "MANAGER",
    conversationId: CONV,
    targetSalesAgentId: AGENT_A,
    note: "  handoff  "
  });
  const ev = events[0]!;
  assert.equal(ev.actorSalesAgentId, AGENT_B);
  assert.equal(ev.actorAuthUserId, "7b241101-e2bb-4955-9933-fd6a836e82fc");
  assert.equal(ev.note, "handoff");
});

test("reassign writes conversation event", async () => {
  const { useCase, events } = makeUseCase({
    initial: baseConv({ assignedAgentId: AGENT_A, assignmentStatus: "ASSIGNED" })
  });
  await useCase.assignOrReassign({
    tenantId: TENANT,
    actorAuthUserId: "not-a-uuid",
    actorSalesAgentId: null,
    actorRole: "MANAGER",
    conversationId: CONV,
    targetSalesAgentId: AGENT_B
  });
  assert.equal(events[0]?.eventType, "CONVERSATION_REASSIGNED");
  assert.equal(events[0]?.actorAuthUserId, null);
});

test("unassign writes conversation event", async () => {
  const { useCase, events } = makeUseCase({
    initial: baseConv({ assignedAgentId: AGENT_A, assignmentStatus: "ASSIGNED" })
  });
  await useCase.unassign({
    tenantId: TENANT,
    actorAuthUserId: "7b241101-e2bb-4955-9933-fd6a836e82fc",
    actorSalesAgentId: AGENT_B,
    actorRole: "ADMIN",
    conversationId: CONV
  });
  assert.equal(events[0]?.eventType, "CONVERSATION_UNASSIGNED");
});

test("assign syncs leads.assigned_sales_id when lead_id exists", async () => {
  const { useCase, getLeadAssignCalls } = makeUseCase({ initial: baseConv({ leadId: LEAD }) });
  await useCase.assignOrReassign({
    tenantId: TENANT,
    actorAuthUserId: "7b241101-e2bb-4955-9933-fd6a836e82fc",
    actorSalesAgentId: AGENT_B,
    actorRole: "MANAGER",
    conversationId: CONV,
    targetSalesAgentId: AGENT_A
  });
  assert.deepEqual(getLeadAssignCalls(), [{ leadId: LEAD, salesAgentId: AGENT_A }]);
});

test("assign does not call lead assign when lead_id is null", async () => {
  const { useCase, getLeadAssignCalls } = makeUseCase({ initial: baseConv({ leadId: null }) });
  await useCase.assignOrReassign({
    tenantId: TENANT,
    actorAuthUserId: "7b241101-e2bb-4955-9933-fd6a836e82fc",
    actorSalesAgentId: AGENT_B,
    actorRole: "MANAGER",
    conversationId: CONV,
    targetSalesAgentId: AGENT_A
  });
  assert.deepEqual(getLeadAssignCalls(), []);
});

test("reassign syncs leads.assigned_sales_id when lead_id exists", async () => {
  const { useCase, getLeadAssignCalls } = makeUseCase({
    initial: baseConv({ assignedAgentId: AGENT_A, assignmentStatus: "ASSIGNED", leadId: LEAD })
  });
  await useCase.assignOrReassign({
    tenantId: TENANT,
    actorAuthUserId: "7b241101-e2bb-4955-9933-fd6a836e82fc",
    actorSalesAgentId: AGENT_B,
    actorRole: "MANAGER",
    conversationId: CONV,
    targetSalesAgentId: AGENT_B
  });
  assert.deepEqual(getLeadAssignCalls(), [{ leadId: LEAD, salesAgentId: AGENT_B }]);
});

test("unassign does not clear leads via repository", async () => {
  const { useCase, getLeadAssignCalls } = makeUseCase({
    initial: baseConv({ assignedAgentId: AGENT_A, assignmentStatus: "ASSIGNED", leadId: LEAD })
  });
  await useCase.unassign({
    tenantId: TENANT,
    actorAuthUserId: "7b241101-e2bb-4955-9933-fd6a836e82fc",
    actorSalesAgentId: AGENT_B,
    actorRole: "MANAGER",
    conversationId: CONV
  });
  assert.deepEqual(getLeadAssignCalls(), []);
});

test("event insert failure after assignment surfaces as error", async () => {
  const { useCase } = makeUseCase({ initial: baseConv(), eventFail: true });
  await assert.rejects(
    () =>
      useCase.assignOrReassign({
        tenantId: TENANT,
        actorAuthUserId: "7b241101-e2bb-4955-9933-fd6a836e82fc",
        actorSalesAgentId: AGENT_B,
        actorRole: "MANAGER",
        conversationId: CONV,
        targetSalesAgentId: AGENT_A
      }),
    /conversation_events insert failed after assignment update/
  );
});
