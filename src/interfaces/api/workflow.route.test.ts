import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createWorkflowSummaryGetHandler } from "../../../app/api/workflow/summary/route.js";
import { createWorkflowItemsGetHandler } from "../../../app/api/workflow/items/route.js";
import { GetWorkflowSummaryUseCase } from "../../application/usecases/getWorkflowSummary.js";
import { ListWorkflowItemsUseCase } from "../../application/usecases/listWorkflowItems.js";
import type { WorkflowItemsPageDto, WorkflowSummaryDto } from "../../domain/workflow.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

function summaryDto(): WorkflowSummaryDto {
  return {
    generatedAt: "2026-06-01T12:00:00.000Z",
    scope: "team",
    followUp: { scheduled: 1, overdue: 1, dueToday: 0, upcoming: 0 },
    meta: { version: 1 }
  };
}

function itemsDto(): WorkflowItemsPageDto {
  return {
    generatedAt: "2026-06-01T12:00:00.000Z",
    scope: "team",
    kind: "follow_up",
    items: [
      {
        id: "follow_up:c1",
        kind: "FOLLOW_UP",
        status: "overdue",
        priority: "critical",
        conversationId: "c1",
        leadId: "l1",
        channelType: "LINE",
        assignedAgentId: "a1",
        assignedAgentDisplayName: "Sam",
        customerDisplayName: "Customer",
        dueAt: "2026-05-14T10:00:00.000Z",
        leadManagementStatus: "FOLLOW_UP",
        conversationStatus: "OPEN",
        flags: { customerRepliedAfterFollowUp: false },
        reasonCode: "FOLLOW_UP_OVERDUE",
        reasonLabel: "Follow-up overdue",
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-02T00:00:00.000Z"
      }
    ],
    pageInfo: { nextCursor: null, hasNextPage: false },
    sections: { followUp: { scheduled: 1, overdue: 1, dueToday: 0, upcoming: 0 } },
    meta: { version: 1 }
  };
}

test("GET /api/workflow/summary MANAGER 200", async () => {
  const handler = createWorkflowSummaryGetHandler({
    requireAuth: async (_req, allowed) => {
      if (!allowed.includes("MANAGER")) throw new Error("Forbidden");
      return {
        tenantId: TENANT_ID,
        role: "MANAGER",
        userId: "u1",
        email: "m@example.com",
        salesAgentId: null
      };
    },
    apiBootstrap: () => ({}) as ReturnType<typeof import("./bootstrap.js").apiBootstrap>,
    createUseCase: () =>
      ({
        execute: async () => summaryDto()
      }) as unknown as GetWorkflowSummaryUseCase
  });
  const res = await handler(new NextRequest("http://local/api/workflow/summary"));
  assert.equal(res.status, 200);
});

test("GET /api/workflow/items SALES 200 and no forbidden fields", async () => {
  const handler = createWorkflowItemsGetHandler({
    requireAuth: async () => ({
      tenantId: TENANT_ID,
      role: "SALES",
      userId: "u1",
      email: "s@example.com",
      salesAgentId: "agent-1"
    }),
    apiBootstrap: () => ({}) as ReturnType<typeof import("./bootstrap.js").apiBootstrap>,
    createUseCase: () =>
      ({
        execute: async () => itemsDto()
      }) as unknown as ListWorkflowItemsUseCase
  });
  const res = await handler(
    new NextRequest("http://local/api/workflow/items?kind=follow_up&limit=50")
  );
  assert.equal(res.status, 200);
  const json = (await res.json()) as { data: WorkflowItemsPageDto };
  const blob = JSON.stringify(json.data);
  assert.equal(blob.includes("follow_up_note"), false);
  assert.equal(blob.includes("metadata_json"), false);
  assert.equal(blob.includes("media_url"), false);
  assert.equal(blob.includes("token"), false);
});

test("GET /api/workflow/items missing kind 400", async () => {
  const handler = createWorkflowItemsGetHandler({
    requireAuth: async () => ({
      tenantId: TENANT_ID,
      role: "ADMIN",
      userId: "u1",
      email: "a@example.com",
      salesAgentId: null
    }),
    apiBootstrap: () => ({}) as ReturnType<typeof import("./bootstrap.js").apiBootstrap>,
    createUseCase: () =>
      ({
        execute: async () => itemsDto()
      }) as unknown as ListWorkflowItemsUseCase
  });
  const res = await handler(new NextRequest("http://local/api/workflow/items"));
  assert.equal(res.status, 400);
});
