import test from "node:test";
import assert from "node:assert/strict";
import { GetWorkflowSummaryUseCase } from "./getWorkflowSummary.js";

const NOW = new Date("2026-06-01T12:00:00.000Z");

test("GetWorkflowSummaryUseCase returns follow-up counts for MANAGER team", async () => {
  const useCase = new GetWorkflowSummaryUseCase({
    workflowRepository: {
      fetchFollowUpCounts: async () => ({
        scheduled: 5,
        overdue: 2,
        dueToday: 1,
        upcoming: 2
      }),
      listFollowUpItems: async () => ({ rows: [], nextCursor: null })
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
    query: {},
    now: NOW
  });
  assert.equal(data.scope, "team");
  assert.equal(data.followUp.scheduled, 5);
  assert.equal(data.meta.version, 1);
});

test("GetWorkflowSummaryUseCase SALES uses mine scope", async () => {
  let capturedAgent: string | null = "unset";
  const useCase2 = new GetWorkflowSummaryUseCase({
    workflowRepository: {
      fetchFollowUpCounts: async (input: { scopeFilter: { assignedAgentId: string | null } }) => {
        capturedAgent = input.scopeFilter.assignedAgentId;
        return { scheduled: 1, overdue: 0, dueToday: 0, upcoming: 1 };
      },
      listFollowUpItems: async () => ({ rows: [], nextCursor: null })
    } as never
  });
  const data = await useCase2.execute({
    auth: {
      tenantId: "t1",
      role: "SALES",
      userId: "u1",
      email: "s@example.com",
      salesAgentId: "agent-1"
    },
    query: {},
    now: NOW
  });
  assert.equal(data.scope, "mine");
  assert.equal(capturedAgent, "agent-1");
});
