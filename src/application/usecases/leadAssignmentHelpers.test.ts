import test from "node:test";
import assert from "node:assert/strict";
import {
  assignLead,
  closeLead,
  createLeadEvent,
  ensureLeadForConversation,
  reassignLead,
  unassignLead
} from "./leadAssignmentHelpers.js";

test("ensureLeadForConversation creates UNASSIGNED lead and emits lead.created", async () => {
  const events: Array<{ eventName: string; leadId: string }> = [];
  const result = await ensureLeadForConversation({
    tenantId: "t1",
    sourceChannel: "LINE",
    externalUserId: "U100",
    leadRepository: {
      findByExternalUser: async () => null,
      create: async (input) => ({
        id: "lead-1",
        ...input,
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      updateStatus: async () => {},
      assign: async () => {},
      list: async () => ({ items: [], nextCursor: null })
    },
    leadEventRepository: {
      create: async (input) => {
        events.push({ eventName: input.eventName, leadId: input.leadId });
      }
    }
  });

  assert.equal(result.created, true);
  assert.equal(result.lead.status, "UNASSIGNED");
  assert.deepEqual(events, [{ eventName: "hubchat.lead.created", leadId: "lead-1" }]);
});

test("ensureLeadForConversation reuses existing lead without creating event", async () => {
  let createCalls = 0;
  let eventCalls = 0;
  const result = await ensureLeadForConversation({
    tenantId: "t1",
    sourceChannel: "FACEBOOK",
    externalUserId: "fb-1",
    leadRepository: {
      findByExternalUser: async () => ({
        id: "lead-existing",
        tenantId: "t1",
        sourceChannel: "FACEBOOK",
        externalUserId: "fb-1",
        name: null,
        phone: null,
        email: null,
        status: "UNASSIGNED",
        assignedSalesId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastContactAt: null,
        tags: []
      }),
      create: async () => {
        createCalls += 1;
        throw new Error("not expected");
      },
      updateStatus: async () => {},
      assign: async () => {},
      list: async () => ({ items: [], nextCursor: null })
    },
    leadEventRepository: {
      create: async () => {
        eventCalls += 1;
      }
    }
  });

  assert.equal(result.created, false);
  assert.equal(createCalls, 0);
  assert.equal(eventCalls, 0);
});

test("assign/reassign/unassign/close write history and lead events", async () => {
  const updatedStatuses: string[] = [];
  const assignedUsers: string[] = [];
  const assignmentRows: Array<{ fromUserId: string | null | undefined; toUserId: string | null | undefined }> = [];
  const eventNames: string[] = [];
  const leadRepository = {
    findByExternalUser: async () => null,
    create: async () => {
      throw new Error("not used");
    },
    updateStatus: async (_leadId: string, status: any) => {
      updatedStatuses.push(String(status));
    },
    assign: async (_leadId: string, salesAgentId: string) => {
      assignedUsers.push(salesAgentId);
    },
    list: async () => ({ items: [], nextCursor: null })
  };
  const leadAssignmentRepository = {
    create: async (input: any) => {
      assignmentRows.push({ fromUserId: input.fromUserId, toUserId: input.toUserId });
    }
  };
  const leadEventRepository = {
    create: async (input: any) => {
      eventNames.push(input.eventName);
    }
  };

  await assignLead({
    leadRepository: leadRepository as any,
    leadAssignmentRepository: leadAssignmentRepository as any,
    leadEventRepository: leadEventRepository as any,
    tenantId: "t1",
    leadId: "lead-1",
    toUserId: "sales-1",
    assignedByUserId: "mgr-1"
  });
  await reassignLead({
    leadRepository: leadRepository as any,
    leadAssignmentRepository: leadAssignmentRepository as any,
    leadEventRepository: leadEventRepository as any,
    tenantId: "t1",
    leadId: "lead-1",
    fromUserId: "sales-1",
    toUserId: "sales-2",
    assignedByUserId: "mgr-1"
  });
  await unassignLead({
    leadRepository: leadRepository as any,
    leadAssignmentRepository: leadAssignmentRepository as any,
    leadEventRepository: leadEventRepository as any,
    tenantId: "t1",
    leadId: "lead-1",
    fromUserId: "sales-2",
    assignedByUserId: "mgr-1"
  });
  await closeLead({
    leadRepository: leadRepository as any,
    leadEventRepository: leadEventRepository as any,
    tenantId: "t1",
    leadId: "lead-1",
    closedByUserId: "mgr-1"
  });

  assert.deepEqual(assignedUsers, ["sales-1", "sales-2"]);
  assert.deepEqual(updatedStatuses, ["ASSIGNED", "ASSIGNED", "UNASSIGNED", "CLOSED"]);
  assert.deepEqual(assignmentRows, [
    { fromUserId: null, toUserId: "sales-1" },
    { fromUserId: "sales-1", toUserId: "sales-2" },
    { fromUserId: "sales-2", toUserId: null }
  ]);
  assert.deepEqual(eventNames, [
    "hubchat.lead.assigned",
    "hubchat.lead.reassigned",
    "hubchat.lead.unassigned",
    "hubchat.lead.closed"
  ]);
});

test("createLeadEvent no-ops when repository is absent", async () => {
  await createLeadEvent(undefined, {
    tenantId: "t1",
    leadId: "lead-1",
    eventName: "hubchat.message.sent"
  });
  assert.equal(true, true);
});
