import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import type { AnalyticsOverviewDto } from "../../domain/analyticsOverview.js";
import { createAnalyticsOverviewGetHandler } from "../../../app/api/analytics/overview/route.js";
import { GetAnalyticsOverviewUseCase } from "../../application/usecases/getAnalyticsOverview.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

function makeReq(search = ""): NextRequest {
  return new NextRequest(`http://local/api/analytics/overview${search}`, {
    headers: new Headers({
      Authorization: "Bearer test-token",
      "x-tenant-id": TENANT_ID
    })
  });
}

function sampleDto(range: AnalyticsOverviewDto["range"] = "7d"): AnalyticsOverviewDto {
  return {
    range,
    period: { startAt: "2026-05-25T00:00:00.000Z", endAt: "2026-06-01T00:00:00.000Z" },
    generatedAt: "2026-06-01T00:00:00.000Z",
    slaPolicy: { warningBeforeBreachMinutes: 60, enabled: true },
    summaryCards: [{ id: "sla_overdue", label: "SLA overdue", value: 0, unit: "count" }],
    conversations: {
      snapshot: {
        total: 0,
        open: 0,
        pending: 0,
        resolved: 0,
        archived: 0,
        legacyClosed: 0
      },
      period: { newCount: 0 },
      byChannel: [
        { channel: "LINE", open: 0, total: 0 },
        { channel: "FACEBOOK", open: 0, total: 0 },
        { channel: "INSTAGRAM", open: 0, total: 0 }
      ]
    },
    sla: {
      snapshot: { active: 0, overdue: 0, dueSoon: 0, onTrack: 0, none: 0 },
      rates: { breachRate: 0 }
    },
    leadPipeline: {
      byStatus: {},
      managementRollup: {
        NEW: 0,
        IN_PROGRESS: 0,
        FOLLOW_UP: 0,
        WON: 0,
        LOST: 0,
        CLOSED: 0
      },
      highlights: { qualified: 0, won: 0, lost: 0, unassigned: 0 },
      byOwner: []
    },
    channelBreakdown: {
      period: {
        inboundMessages: { LINE: 0, FACEBOOK: 0, INSTAGRAM: 0 },
        outboundMessages: { LINE: 0, FACEBOOK: 0, INSTAGRAM: 0 }
      }
    },
    teamWorkload: [],
    followUps: { snapshot: { scheduled: 0, overdue: 0, dueToday: 0, none: 0 } },
    meta: { queryCount: 1, version: 1 }
  };
}

function makeHandler(role: "ADMIN" | "MANAGER" | "SALES", dto = sampleDto()) {
  return createAnalyticsOverviewGetHandler({
    requireAuth: async (_req, allowed) => {
      if (!allowed.includes(role)) throw new Error("Forbidden");
      return {
        tenantId: TENANT_ID,
        role,
        userId: "u1",
        email: "u@example.com",
        salesAgentId: role === "SALES" ? "agent-1" : null
      };
    },
    apiBootstrap: () => ({}) as ReturnType<typeof import("./bootstrap.js").apiBootstrap>,
    createUseCase: () =>
      ({
        execute: async (input: { range: AnalyticsOverviewDto["range"] }) => ({
          ...dto,
          range: input.range
        })
      }) as unknown as GetAnalyticsOverviewUseCase
  });
}

test("GET /api/analytics/overview ADMIN 200", async () => {
  const res = await makeHandler("ADMIN")(makeReq("?range=7d"));
  assert.equal(res.status, 200);
  const json = (await res.json()) as { data: AnalyticsOverviewDto };
  assert.equal(json.data.range, "7d");
  assert.equal(json.data.meta.version, 1);
});

test("GET /api/analytics/overview MANAGER 200", async () => {
  const res = await makeHandler("MANAGER")(makeReq());
  assert.equal(res.status, 200);
});

test("GET /api/analytics/overview SALES 403", async () => {
  const res = await makeHandler("SALES")(makeReq());
  assert.equal(res.status, 403);
});

test("GET /api/analytics/overview invalid range 400", async () => {
  const res = await makeHandler("ADMIN")(makeReq("?range=90d"));
  assert.equal(res.status, 400);
});

test("GET /api/analytics/overview omitted range defaults to 7d", async () => {
  const res = await makeHandler("ADMIN", sampleDto("7d"))(makeReq());
  assert.equal(res.status, 200);
  const json = (await res.json()) as { data: { range: string } };
  assert.equal(json.data.range, "7d");
});

test("GET /api/analytics/overview response has no message content fields", async () => {
  const res = await makeHandler("ADMIN")(makeReq());
  const text = await res.text();
  assert.equal(text.includes("content"), false);
  assert.equal(text.includes("raw_payload"), false);
  assert.equal(text.includes("mediaUrl"), false);
  assert.equal(text.includes("follow_up_note"), false);
});
