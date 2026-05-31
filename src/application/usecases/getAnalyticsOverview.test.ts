import test from "node:test";
import assert from "node:assert/strict";
import { utcInboxFilterClock } from "../../interfaces/api/conversationListInboxFilters.js";
import {
  buildManagementRollupFromLeadCounts,
  type AnalyticsOverviewRawCounts
} from "../../infrastructure/adapters/repositories/supabaseAnalyticsOverviewRepository.js";
import { GetAnalyticsOverviewUseCase } from "./getAnalyticsOverview.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const NOW = new Date("2026-06-01T12:00:00.000Z");

function emptyRaw(overrides: Partial<AnalyticsOverviewRawCounts> = {}): AnalyticsOverviewRawCounts {
  return {
    conversations: {
      total: 0,
      open: 0,
      pending: 0,
      resolved: 0,
      archived: 0,
      legacyClosed: 0,
      newInPeriod: 0,
      byChannel: [
        { channel: "LINE", open: 0, total: 0 },
        { channel: "FACEBOOK", open: 0, total: 0 },
        { channel: "INSTAGRAM", open: 0, total: 0 }
      ]
    },
    sla: { active: 0, overdue: 0, dueSoon: 0, onTrack: 0, none: 0 },
    followUps: { scheduled: 0, overdue: 0, dueToday: 0, none: 0 },
    leads: { byStatus: {}, unassigned: 0 },
    messages: {
      inbound: { LINE: 0, FACEBOOK: 0, INSTAGRAM: 0 },
      outbound: { LINE: 0, FACEBOOK: 0, INSTAGRAM: 0 }
    },
    agents: [],
    teamByAgent: [],
    queryCount: 0,
    ...overrides
  };
}

test("GetAnalyticsOverviewUseCase returns full contract with zeros", async () => {
  const useCase = new GetAnalyticsOverviewUseCase({
    loadSlaPolicy: async () => ({ warningBeforeBreachMinutes: 60, enabled: true }),
    fetchCounts: async () =>
      emptyRaw({
        leads: {
          byStatus: { NEW: 0, QUALIFIED: 0, WON: 0, LOST: 0, UNQUALIFIED: 0 },
          unassigned: 0
        }
      })
  });
  const data = await useCase.execute({ tenantId: TENANT_ID, range: "7d", now: NOW });
  assert.equal(data.range, "7d");
  assert.equal(data.meta.version, 1);
  assert.equal(data.sla.rates.breachRate, 0);
  assert.equal(data.conversations.byChannel.length, 3);
  assert.deepEqual(
    data.conversations.byChannel.map((r) => r.channel),
    ["LINE", "FACEBOOK", "INSTAGRAM"]
  );
  assert.equal(data.channelBreakdown.period.inboundMessages.LINE, 0);
});

test("breachRate is overdue/active when active > 0", async () => {
  const useCase = new GetAnalyticsOverviewUseCase({
    loadSlaPolicy: async () => ({ warningBeforeBreachMinutes: 120, enabled: true }),
    fetchCounts: async () => emptyRaw({ sla: { active: 10, overdue: 2, dueSoon: 3, onTrack: 5, none: 1 } })
  });
  const data = await useCase.execute({ tenantId: TENANT_ID, range: "30d", now: NOW });
  assert.equal(data.sla.rates.breachRate, 0.2);
  assert.equal(data.slaPolicy.warningBeforeBreachMinutes, 120);
});

test("buildManagementRollupFromLeadCounts maps statuses and follow-up scheduled", () => {
  const rollup = buildManagementRollupFromLeadCounts(
    {
      NEW: 1,
      ASSIGNED: 2,
      CONTACTED: 1,
      QUALIFIED: 3,
      WON: 4,
      LOST: 1,
      UNQUALIFIED: 2
    },
    5
  );
  assert.equal(rollup.NEW, 1);
  assert.equal(rollup.IN_PROGRESS, 6);
  assert.equal(rollup.FOLLOW_UP, 5);
  assert.equal(rollup.WON, 4);
  assert.equal(rollup.LOST, 1);
  assert.equal(rollup.CLOSED, 2);
});

test("fetchCounts receives policy-derived inbox clock", async () => {
  let capturedClock: ReturnType<typeof utcInboxFilterClock> | null = null;
  const useCase = new GetAnalyticsOverviewUseCase({
    loadSlaPolicy: async () => ({ warningBeforeBreachMinutes: 45, enabled: true }),
    fetchCounts: async ({ clock }) => {
      capturedClock = clock;
      return emptyRaw({
        sla: { active: 4, overdue: 1, dueSoon: 2, onTrack: 1, none: 0 }
      });
    }
  });
  await useCase.execute({ tenantId: TENANT_ID, range: "today", now: NOW });
  assert.deepEqual(capturedClock, utcInboxFilterClock(NOW, 45));
});
