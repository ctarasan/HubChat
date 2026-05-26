import test from "node:test";
import assert from "node:assert/strict";
import { ListMarketingEventsUseCase } from "./listMarketingEvents.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const CONV_ID = "3b241101-e2bb-4955-9933-fd6a836e82f8";
const CONV_OTHER = "4b241101-e2bb-4955-9933-fd6a836e82f9";
const LEAD_ID = "6b241101-e2bb-4955-9933-fd6a836e82fb";
const LEAD_OTHER = "7b241101-e2bb-4955-9933-fd6a836e82fc";
const AGENT_SELF = "11111111-1111-4111-8111-111111111111";
const AGENT_OTHER = "22222222-2222-4222-8222-222222222222";

function makeUseCase() {
  let listCalled = false;
  const useCase = new ListMarketingEventsUseCase({
    marketingEventRepository: {
      insert: async () => {},
      list: async () => {
        listCalled = true;
        return { items: [], nextCursor: null };
      }
    },
    conversationRepository: {
      findById: (async (_tenantId: string, conversationId: string) => {
        if (conversationId === CONV_ID) {
          return {
            id: CONV_ID,
            tenantId: TENANT_ID,
            leadId: LEAD_ID,
            channelType: "LINE",
            assignedAgentId: AGENT_SELF
          };
        }
        if (conversationId === CONV_OTHER) {
          return {
            id: CONV_OTHER,
            tenantId: TENANT_ID,
            leadId: LEAD_OTHER,
            channelType: "LINE",
            assignedAgentId: AGENT_SELF
          };
        }
        return null;
      }) as any
    },
    leadRepository: {
      findById: (async (_tenantId: string, leadId: string) => {
        if (leadId === LEAD_ID) {
          return { id: LEAD_ID, tenantId: TENANT_ID, assignedSalesId: AGENT_SELF };
        }
        if (leadId === LEAD_OTHER) {
          return { id: LEAD_OTHER, tenantId: TENANT_ID, assignedSalesId: AGENT_OTHER };
        }
        return null;
      }) as any
    }
  });
  return { useCase, wasListed: () => listCalled };
}

test("ListMarketingEventsUseCase rejects SALES forbidden lead even with allowed conversation", async () => {
  const { useCase, wasListed } = makeUseCase();
  await assert.rejects(
    () =>
      useCase.execute({
        auth: {
          tenantId: TENANT_ID,
          userId: "u",
          email: "s@x.com",
          role: "SALES",
          salesAgentId: AGENT_SELF
        },
        query: { conversationId: CONV_ID, leadId: LEAD_OTHER }
      }),
    /Forbidden/
  );
  assert.equal(wasListed(), false);
});

test("ListMarketingEventsUseCase rejects mismatched leadId and conversationId for MANAGER", async () => {
  const { useCase, wasListed } = makeUseCase();
  await assert.rejects(
    () =>
      useCase.execute({
        auth: {
          tenantId: TENANT_ID,
          userId: "u",
          email: "m@x.com",
          role: "MANAGER",
          salesAgentId: AGENT_OTHER
        },
        query: { conversationId: CONV_OTHER, leadId: LEAD_ID }
      }),
    /Forbidden/
  );
  assert.equal(wasListed(), false);
});

test("ListMarketingEventsUseCase allows SALES with matching assigned lead and conversation", async () => {
  const { useCase, wasListed } = makeUseCase();
  const result = await useCase.execute({
    auth: {
      tenantId: TENANT_ID,
      userId: "u",
      email: "s@x.com",
      role: "SALES",
      salesAgentId: AGENT_SELF
    },
    query: { conversationId: CONV_ID, leadId: LEAD_ID }
  });
  assert.equal(wasListed(), true);
  assert.deepEqual(result.pageInfo, { nextCursor: null, hasNextPage: false });
});
