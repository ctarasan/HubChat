import test from "node:test";
import assert from "node:assert/strict";
import { ListWorkflowItemsUseCase } from "./listWorkflowItems.js";
import type { WorkflowFollowUpListInput } from "../../infrastructure/adapters/repositories/supabaseWorkflowRepository.js";
import { assertWorkflowListItemSafe } from "../../interfaces/api/workflowDtos.js";

const NOW = new Date("2026-05-15T12:00:00.000Z");

test("ListWorkflowItemsUseCase maps rows and sections counts", async () => {
  const useCase = new ListWorkflowItemsUseCase({
    workflowRepository: {
      fetchFollowUpCounts: async () => ({
        scheduled: 3,
        overdue: 1,
        dueToday: 1,
        upcoming: 1
      }),
      listFollowUpItems: async () => ({
        rows: [
          {
            id: "c1",
            lead_id: "l1",
            channel_type: "LINE",
            status: "OPEN",
            follow_up_at: "2026-05-14T10:00:00.000Z",
            assigned_agent_id: "a1",
            last_customer_message_at: null,
            last_agent_message_at: null,
            created_at: "2026-05-01T00:00:00.000Z",
            updated_at: "2026-05-02T00:00:00.000Z",
            participant_display_name: "A"
          }
        ],
        nextCursor: "cur"
      })
    } as never
  });

  const data = await useCase.execute({
    auth: {
      tenantId: "t1",
      role: "MANAGER",
      userId: "u1",
      email: "m@example.com",
      salesAgentId: null
    },
    query: { kind: "follow_up", limit: 25 },
    now: NOW
  });

  assert.equal(data.items.length, 1);
  assert.equal(data.pageInfo.hasNextPage, true);
  assert.equal(data.sections.followUp.scheduled, 3);
  for (const item of data.items) {
    assertWorkflowListItemSafe(item);
    assert.equal(JSON.stringify(item).includes("content"), false);
  }
});

test("ListWorkflowItemsUseCase status filter forwarded", async () => {
  let status: string | undefined;
  const useCase = new ListWorkflowItemsUseCase({
    workflowRepository: {
      fetchFollowUpCounts: async () => ({
        scheduled: 0,
        overdue: 0,
        dueToday: 0,
        upcoming: 0
      }),
      listFollowUpItems: async (input: WorkflowFollowUpListInput) => {
        status = input.status;
        return { rows: [], nextCursor: null };
      }
    } as never
  });

  await useCase.execute({
    auth: {
      tenantId: "t1",
      role: "ADMIN",
      userId: "u1",
      email: "a@example.com",
      salesAgentId: null
    },
    query: { kind: "follow_up", status: "overdue", limit: 50 },
    now: NOW
  });
  assert.equal(status, "overdue");
});
