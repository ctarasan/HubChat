import test from "node:test";
import assert from "node:assert/strict";
import { utcInboxFilterClock } from "../../../interfaces/api/conversationListInboxFilters.js";
import { SupabaseAnalyticsOverviewRepository } from "./supabaseAnalyticsOverviewRepository.js";
import type { AnalyticsHeadCountClient } from "../../../lib/analyticsHeadCount.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const CLOCK = utcInboxFilterClock(new Date("2026-06-01T12:00:00.000Z"), 60);

function makeCountClient(counts: Record<string, number>) {
  const client = {
    from(table: string) {
      if (table === "sales_agents") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      limit: async () => ({
                        data: [{ id: "agent-1", name: "Agent One" }],
                        error: null
                      })
                    };
                  }
                };
              }
            };
          }
        };
      }
      return {
        select(_cols: string, _opts: { count: "exact"; head: true }) {
          const filters: string[] = [`table=${table}`];
          const query = {
            eq(column: string, value: string) {
              filters.push(`${column}=${value}`);
              return query;
            },
            gte(column: string, value: string) {
              filters.push(`${column}>=${value}`);
              return query;
            },
            lt(column: string, value: string) {
              filters.push(`${column}<${value}`);
              return query;
            },
            lte(column: string, value: string) {
              filters.push(`${column}<=${value}`);
              return query;
            },
            gt(column: string, value: string) {
              filters.push(`${column}>${value}`);
              return query;
            },
            in(column: string, values: string[]) {
              filters.push(`${column} in ${values.join(",")}`);
              return query;
            },
            is(column: string, value: null) {
              filters.push(`${column} is ${value}`);
              return query;
            },
            not(column: string, operator: string, value: null) {
              filters.push(`${column} not ${operator} ${value}`);
              return query;
            },
            async then(resolve: (v: { count: number; error: null }) => void) {
              resolve({ count: counts[filters.join("|")] ?? 0, error: null });
            }
          };
          return query;
        }
      };
    }
  };
  return client as unknown as ConstructorParameters<typeof SupabaseAnalyticsOverviewRepository>[0];
}

test("SupabaseAnalyticsOverviewRepository aggregates SLA and follow-up buckets", async () => {
  const counts: Record<string, number> = {};
  const mark = (parts: string[], n: number) => {
    counts[["table=conversations", ...parts].join("|")] = n;
  };
  mark(["tenant_id=" + TENANT_ID, "sla_due_at not is null"], 10);
  mark(
    [
      "tenant_id=" + TENANT_ID,
      "sla_due_at not is null",
      `sla_due_at<${CLOCK.nowIso}`
    ],
    2
  );
  mark(
    [
      "tenant_id=" + TENANT_ID,
      "sla_due_at not is null",
      `sla_due_at>${CLOCK.nowIso}`,
      `sla_due_at<=${CLOCK.slaDueSoonEndIso}`
    ],
    3
  );
  mark(["tenant_id=" + TENANT_ID, "follow_up_at not is null"], 4);
  mark(
    ["tenant_id=" + TENANT_ID, "follow_up_at not is null", `follow_up_at<${CLOCK.nowIso}`],
    1
  );
  const repo = new SupabaseAnalyticsOverviewRepository(makeCountClient(counts));
  const raw = await repo.fetchCounts({
    tenantId: TENANT_ID,
    period: { startAt: "2026-05-25T00:00:00.000Z", endAt: CLOCK.nowIso },
    clock: CLOCK
  });
  assert.equal(raw.sla.active, 10);
  assert.equal(raw.sla.overdue, 2);
  assert.equal(raw.sla.dueSoon, 3);
  assert.equal(raw.followUps.scheduled, 4);
  assert.equal(raw.followUps.overdue, 1);
  assert.ok(raw.queryCount > 0);
});

test("SupabaseAnalyticsOverviewRepository includes all analytics channels", async () => {
  const repo = new SupabaseAnalyticsOverviewRepository(makeCountClient({}));
  const raw = await repo.fetchCounts({
    tenantId: TENANT_ID,
    period: { startAt: "2026-05-25T00:00:00.000Z", endAt: CLOCK.nowIso },
    clock: CLOCK
  });
  assert.equal(raw.conversations.byChannel.length, 3);
  assert.equal(raw.messages.inbound.INSTAGRAM, 0);
});
