import test from "node:test";
import assert from "node:assert/strict";
import { defaultInboxFilterClock } from "../../../interfaces/api/conversationListInboxFilters.js";
import { SupabaseWorkflowRepository, WORKFLOW_LIST_SELECT } from "./supabaseWorkflowRepository.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const CLOCK = defaultInboxFilterClock(new Date("2026-06-01T12:00:00.000Z"));

function makeCountClient(counts: number[]) {
  let i = 0;
  return {
    from() {
      return {
        select() {
          const chain: Record<string, unknown> = {};
          const self = () => chain;
          chain.eq = self;
          chain.gte = self;
          chain.lt = self;
          chain.lte = self;
          chain.gt = self;
          chain.in = self;
          chain.is = self;
          chain.not = self;
          chain.then = (resolve: (v: { count: number; error: null }) => void) => {
            resolve({ count: counts[i++] ?? 0, error: null });
            return Promise.resolve({ count: counts[i - 1], error: null });
          };
          return chain;
        }
      };
    }
  };
}

test("WORKFLOW_LIST_SELECT includes avatar fields but omits notes and message bodies", () => {
  assert.equal(WORKFLOW_LIST_SELECT.includes("follow_up_note"), false);
  assert.equal(WORKFLOW_LIST_SELECT.includes("last_message_preview"), false);
  assert.equal(WORKFLOW_LIST_SELECT.includes("participant_profile_image_url"), true);
  assert.equal(WORKFLOW_LIST_SELECT.includes("contacts(display_name,profile_image_url"), true);
  assert.equal(WORKFLOW_LIST_SELECT.includes("contact_identities(profile_image_url"), true);
  assert.equal(WORKFLOW_LIST_SELECT.includes("sales_agents(name)"), true);
});

test("fetchFollowUpCounts issues four head-count queries", async () => {
  const repo = new SupabaseWorkflowRepository(makeCountClient([5, 2, 1, 2]) as never);
  const counts = await repo.fetchFollowUpCounts({
    tenantId: TENANT,
    scopeFilter: { assignedAgentId: "agent-1" },
    clock: CLOCK
  });
  assert.deepEqual(counts, { scheduled: 5, overdue: 2, dueToday: 1, upcoming: 2 });
});

test("listFollowUpItems orders by follow_up_at ascending", async () => {
  const calls: string[] = [];
  const client = {
    from() {
      return {
        select() {
          const chain: Record<string, unknown> = {};
          const self = () => chain;
          chain.eq = self;
          chain.in = self;
          chain.not = self;
          chain.gte = self;
          chain.order = (col: string, opts: { ascending: boolean }) => {
            calls.push(`order:${col}:${opts.ascending}`);
            return chain;
          };
          chain.limit = self;
          chain.or = self;
          chain.then = (resolve: (v: { data: []; error: null }) => void) => {
            resolve({ data: [], error: null });
          };
          return chain;
        }
      };
    }
  };
  const repo = new SupabaseWorkflowRepository(client as never);
  await repo.listFollowUpItems({
    tenantId: TENANT,
    scopeFilter: { assignedAgentId: null },
    clock: CLOCK,
    limit: 25
  });
  assert.ok(calls.some((c) => c === "order:follow_up_at:true"));
});
