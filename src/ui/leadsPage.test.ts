import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildDashboardConversationHref,
  buildLeadsListUrl,
  DEFAULT_LEADS_LIST_FILTERS,
  filtersAreDefault,
  getLeadStatusBadgeLabel,
  parseLeadsListResponse,
  resolveLeadRowFollowUpBadge,
  resolveLeadRowSlaBadge,
  type LeadPipelineRow
} from "./leadsPageModel.js";

const leadsPageSource = readFileSync(new URL("./LeadsPage.tsx", import.meta.url), "utf8");
const globalsCss = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

test("Leads page exposes nav item and read-only shell markers", () => {
  assert.equal(leadsPageSource.includes('data-testid="nav-leads"'), true);
  assert.equal(leadsPageSource.includes('data-testid="leads-page"'), true);
  assert.equal(leadsPageSource.includes('href="/dashboard/leads"'), true);
  assert.equal(leadsPageSource.includes("Read-only lead pipeline"), true);
});

test("Leads page renders loading, empty, and error state test ids", () => {
  assert.equal(leadsPageSource.includes('data-testid="leads-loading"'), true);
  assert.equal(leadsPageSource.includes('data-testid="leads-empty"'), true);
  assert.equal(leadsPageSource.includes('data-testid="leads-error"'), true);
  assert.equal(leadsPageSource.includes('data-testid="leads-table-wrap"'), true);
});

test("Leads page has filter controls and explicit apply search", () => {
  assert.equal(leadsPageSource.includes('data-testid="leads-filter-status"'), true);
  assert.equal(leadsPageSource.includes('data-testid="leads-filter-channel"'), true);
  assert.equal(leadsPageSource.includes('data-testid="leads-filter-owner"'), true);
  assert.equal(leadsPageSource.includes('data-testid="leads-filter-follow-up"'), true);
  assert.equal(leadsPageSource.includes('data-testid="leads-filter-sla"'), true);
  assert.equal(leadsPageSource.includes('data-testid="leads-filter-search"'), true);
  assert.equal(leadsPageSource.includes('data-testid="leads-filter-apply"'), true);
  assert.equal(leadsPageSource.includes('data-testid="leads-load-more"'), true);
});

test("Leads page does not include write actions", () => {
  assert.equal(leadsPageSource.includes("applyConversationLeadStatus"), false);
  assert.equal(leadsPageSource.includes("/api/messages/send"), false);
  assert.equal(leadsPageSource.includes("PATCH"), false);
});

test("buildLeadsListUrl encodes filter query per pipeline contract", () => {
  const url = buildLeadsListUrl({
    ...DEFAULT_LEADS_LIST_FILTERS,
    status: "QUALIFIED",
    channel: "INSTAGRAM",
    owner: "me",
    followUp: "overdue",
    sla: "overdue",
    search: "hello"
  });
  assert.match(url, /^\/api\/leads\?/);
  assert.match(url, /limit=25/);
  assert.match(url, /status=QUALIFIED/);
  assert.match(url, /channel=INSTAGRAM/);
  assert.match(url, /owner=me/);
  assert.match(url, /followUp=overdue/);
  assert.match(url, /sla=overdue/);
  assert.match(url, /search=hello/);
});

test("buildLeadsListUrl adds cursor for load more", () => {
  const url = buildLeadsListUrl(DEFAULT_LEADS_LIST_FILTERS, "cursor-abc");
  assert.match(url, /cursor=cursor-abc/);
});

test("parseLeadsListResponse accepts pipeline DTO and legacy lead rows", () => {
  const pipeline = parseLeadsListResponse({
    data: [
      {
        leadId: "l1",
        conversationId: "c1",
        displayName: "Customer",
        channel: "LINE",
        leadStatus: "QUALIFIED",
        ownerName: "Sales",
        lastMessagePreview: "Hi",
        lastMessageAt: "2026-05-29T10:00:00.000Z",
        createdAt: "2026-05-29T09:00:00.000Z"
      }
    ],
    pageInfo: { nextCursor: "next-1" }
  });
  assert.equal(pipeline.ok, true);
  if (pipeline.ok) {
    assert.equal(pipeline.items.length, 1);
    assert.equal(pipeline.items[0]?.leadId, "l1");
    assert.equal(pipeline.items[0]?.conversationId, "c1");
    assert.equal(pipeline.pageInfo.nextCursor, "next-1");
  }

  const legacy = parseLeadsListResponse({
    data: [{ id: "l2", name: "Legacy", status: "CONTACTED", sourceChannel: "FACEBOOK" }],
    pageInfo: { nextCursor: null }
  });
  assert.equal(legacy.ok, true);
  if (legacy.ok) {
    assert.equal(legacy.items[0]?.leadId, "l2");
    assert.equal(legacy.items[0]?.channel, "FACEBOOK");
  }
});

test("badge helpers and status labels render safely", () => {
  const row: LeadPipelineRow = {
    leadId: "l1",
    conversationId: null,
    displayName: "A",
    profileImageUrl: null,
    channel: "LINE",
    leadStatus: "QUALIFIED",
    conversationStatus: "OPEN",
    ownerName: "",
    ownerId: null,
    lastMessagePreview: "",
    lastMessageAt: null,
    followUpAt: "2020-01-01T00:00:00.000Z",
    slaDueAt: "2020-01-01T00:00:00.000Z",
    isFollowUpOverdue: true,
    isSlaOverdue: true,
    createdAt: "2020-01-01T00:00:00.000Z"
  };
  assert.equal(getLeadStatusBadgeLabel("QUALIFIED"), "Qualified");
  assert.equal(resolveLeadRowFollowUpBadge(row)?.label, "Follow-up overdue");
  assert.equal(resolveLeadRowSlaBadge(row)?.label, "SLA overdue");
});

test("buildDashboardConversationHref points to dashboard with conversationId", () => {
  assert.equal(buildDashboardConversationHref("conv-1"), "/dashboard?conversationId=conv-1");
  assert.equal(buildDashboardConversationHref(null), null);
});

test("filtersAreDefault detects cleared filter state", () => {
  assert.equal(filtersAreDefault(DEFAULT_LEADS_LIST_FILTERS), true);
  assert.equal(filtersAreDefault({ ...DEFAULT_LEADS_LIST_FILTERS, status: "QUALIFIED" }), false);
});

test("globals.css includes leads-root using theme variables", () => {
  assert.match(globalsCss, /\.leads-root\s*\{[^}]*grid-template-columns:\s*var\(--app-rail-width\)/s);
  assert.match(globalsCss, /\.leads-root\s*\{/s);
  assert.doesNotMatch(globalsCss, /\.leads-table\s*\{[^}]*#0f0f0f/s);
});

test("Dashboard enables Leads nav link for authorized users", () => {
  const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
  assert.equal(dashboardSource.includes('data-testid="nav-leads"'), true);
  assert.equal(dashboardSource.includes('href="/dashboard/leads"'), true);
  assert.equal(dashboardSource.includes('app-rail-nav-item-disabled" disabled aria-disabled="true" title="Coming soon">\n            <span className="app-rail-nav-icon" aria-hidden="true">\n              LD'), false);
});
