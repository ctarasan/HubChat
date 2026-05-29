import test from "node:test";
import assert from "node:assert/strict";
import { ListLeadsForMenuUseCase } from "./listLeadsForMenu.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const AGENT_SELF = "11111111-1111-4111-8111-111111111111";

const sampleRow = {
  id: "conv-1",
  lead_id: "lead-1",
  channel_type: "LINE",
  status: "OPEN",
  participant_display_name: "A",
  last_message_at: "2026-05-29T10:00:00.000Z",
  last_message_preview: "hi",
  follow_up_at: null,
  sla_due_at: null,
  assigned_agent_id: AGENT_SELF,
  leads: { status: "QUALIFIED", created_at: "2026-05-29T09:00:00.000Z" },
  sales_agents: { id: AGENT_SELF, name: "Agent" }
};

test("ListLeadsForMenuUseCase passes tenant and QUALIFIED filter to repository", async () => {
  let lastInput: unknown = null;
  const useCase = new ListLeadsForMenuUseCase({
    conversationRepository: {
      listForLeadsMenu: async (input) => {
        lastInput = input;
        return { items: [sampleRow], nextCursor: "next-1" };
      }
    }
  });
  const out = await useCase.execute({
    auth: {
      tenantId: TENANT,
      userId: "u",
      email: "m@x.com",
      role: "MANAGER",
      salesAgentId: AGENT_SELF
    },
    query: { status: "QUALIFIED", channel: "LINE" },
    limit: 25
  });
  assert.equal(out.data.length, 1);
  assert.equal(out.data[0]?.leadStatus, "QUALIFIED");
  assert.equal(out.pageInfo.nextCursor, "next-1");
  assert.equal((lastInput as { tenantId: string }).tenantId, TENANT);
  assert.equal((lastInput as { leadStatus: string }).leadStatus, "QUALIFIED");
});

test("ListLeadsForMenuUseCase blocks SALES without sales agent profile", async () => {
  const useCase = new ListLeadsForMenuUseCase({
    conversationRepository: {
      listForLeadsMenu: async () => ({ items: [], nextCursor: null })
    }
  });
  await assert.rejects(
    useCase.execute({
      auth: {
        tenantId: TENANT,
        userId: "u",
        email: "s@x.com",
        role: "SALES",
        salesAgentId: null
      },
      query: {},
      limit: 25
    }),
    /Sales agent profile required/
  );
});
