import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initialsAvatarFromDisplayName } from "./chatComposerModel.js";
import {
  buildDashboardConversationHref,
  buildLeadsListUrl,
  DEFAULT_LEADS_LIST_FILTERS,
  extractLeadsListPageInfo,
  filtersAreDefault,
  formatLeadsLoadedCount,
  getLeadStatusBadgeLabel,
  normalizeLeadsProfileImageUrl,
  parseLeadsListResponse,
  resolveLeadDisplayLabel,
  resolveLeadInboxActionState,
  resolveLeadRowFollowUpBadge,
  resolveLeadRowSlaBadge,
  shortenLeadIdentityPreview,
  type LeadPipelineRow
} from "./leadsPageModel.js";

function sampleLeadRow(overrides: Partial<LeadPipelineRow> = {}): LeadPipelineRow {
  return {
    leadId: "lead-1",
    conversationId: "conv-1",
    displayName: "Pat",
    profileImageUrl: null,
    channel: "LINE",
    leadStatus: "NEW",
    conversationStatus: "OPEN",
    ownerName: "",
    ownerId: null,
    lastMessagePreview: "",
    lastMessageAt: null,
    followUpAt: null,
    slaDueAt: null,
    isFollowUpOverdue: false,
    isSlaOverdue: false,
    createdAt: "2026-05-29T09:00:00.000Z",
    ...overrides
  };
}

const leadsPageSource = readFileSync(new URL("./LeadsPage.tsx", import.meta.url), "utf8");
const leadsPageModelSource = readFileSync(new URL("./leadsPageModel.ts", import.meta.url), "utf8");
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

test("Leads page shows load more only when nextCursor is set and uses cursor in fetch", () => {
  assert.equal(leadsPageSource.includes("const showLoadMore = showTable && Boolean(nextCursor)"), true);
  assert.equal(leadsPageSource.includes("buildLeadsListUrl(appliedFilters, cursor)"), true);
  assert.equal(leadsPageSource.includes("nextCursorRef"), true);
});

test("Leads page appends rows on load more instead of replacing list", () => {
  assert.match(leadsPageSource, /setLeads\(\(prev\) => \{[\s\S]*merged\.push\(row\)/);
  assert.equal(leadsPageSource.includes('data-testid="leads-table-body"'), true);
  assert.equal(leadsPageSource.includes("formatLeadsLoadedCount(leads.length)"), true);
});

test("formatLeadsLoadedCount renders singular and plural labels", () => {
  assert.equal(formatLeadsLoadedCount(1), "Showing 1 lead");
  assert.equal(formatLeadsLoadedCount(25), "Showing 25 leads");
  assert.equal(formatLeadsLoadedCount(50), "Showing 50 leads");
});

test("Leads page shows loaded count and all-loaded pagination feedback", () => {
  assert.equal(leadsPageSource.includes('data-testid="leads-loaded-count"'), true);
  assert.equal(leadsPageSource.includes('data-testid="leads-all-loaded"'), true);
  assert.equal(leadsPageSource.includes("All loaded"), true);
  assert.equal(leadsPageSource.includes("const showAllLoaded = showTable && !nextCursor && !loadingMore"), true);
});

test("Leads page keeps load more visible when nextCursor exists after append", () => {
  assert.equal(leadsPageSource.includes("const showLoadMore = showTable && Boolean(nextCursor)"), true);
  assert.equal(leadsPageSource.includes("setNextCursor(parsed.pageInfo.nextCursor)"), true);
});

test("Leads page keeps table visible when load more fails", () => {
  assert.equal(leadsPageSource.includes("loadMoreError"), true);
  assert.equal(leadsPageSource.includes('data-testid="leads-load-more-error"'), true);
  assert.equal(leadsPageSource.includes("setLoadMoreError"), true);
  assert.match(leadsPageSource, /const showTable = listPhase === "ready" && !listError && leads\.length > 0/);
});

test("Leads page resets pagination when filters are applied", () => {
  assert.equal(leadsPageSource.includes("setAppliedFilters"), true);
  assert.match(leadsPageSource, /setNextCursor\(null\)/);
  assert.match(leadsPageSource, /\[meContext\?\.userId, meError, appliedFilters/);
});

test("Leads table header uses Lead label instead of Customer", () => {
  assert.equal(leadsPageSource.includes("<th>Lead</th>"), true);
  assert.equal(leadsPageSource.includes("<th>Customer</th>"), false);
});

test("Leads row avatar renders profile image when profileImageUrl is present", () => {
  assert.equal(leadsPageSource.includes("leads-row-avatar-img"), true);
  assert.equal(leadsPageSource.includes("profileImageUrl={row.profileImageUrl}"), true);
  assert.match(leadsPageSource, /\$\{displayName\} profile/);
  assert.equal(leadsPageSource.includes("alt={alt}"), true);
});

test("Leads row avatar falls back to initials without profileImageUrl", () => {
  assert.equal(leadsPageSource.includes("leads-row-avatar-initials"), true);
  assert.equal(leadsPageSource.includes("initialsAvatarFromDisplayName(displayName)"), true);
});

test("Leads row avatar falls back to initials when image fails to load", () => {
  assert.equal(leadsPageSource.includes("onError={() => setImageBroken(true)}"), true);
  assert.equal(leadsPageSource.includes("imageBroken"), true);
});

test("normalizeLeadsProfileImageUrl treats empty values as missing", () => {
  assert.equal(normalizeLeadsProfileImageUrl("https://cdn.example/avatar.jpg"), "https://cdn.example/avatar.jpg");
  assert.equal(normalizeLeadsProfileImageUrl("  "), null);
  assert.equal(normalizeLeadsProfileImageUrl(null), null);
});

test("resolveLeadDisplayLabel prefers displayName when provided", () => {
  assert.equal(resolveLeadDisplayLabel({ displayName: "Pat Smith" }), "Pat Smith");
  const parsed = parseLeadsListResponse({
    data: [{ leadId: "l1", displayName: "Pat Smith", channel: "LINE", leadStatus: "NEW", createdAt: "2026-05-29T09:00:00.000Z" }],
    pageInfo: { nextCursor: null }
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.items[0]?.displayName, "Pat Smith");
});

test("resolveLeadDisplayLabel uses identity fallback when displayName is missing", () => {
  assert.equal(resolveLeadDisplayLabel({ displayName: null, identityLabel: "111" }), "111");
  assert.equal(resolveLeadDisplayLabel({ fallbackDisplayName: "LINE Guest" }), "LINE Guest");
  assert.equal(
    resolveLeadDisplayLabel({ externalUserId: "174093561234567890" }),
    shortenLeadIdentityPreview("174093561234567890")
  );
  const parsed = parseLeadsListResponse({
    data: [
      {
        leadId: "l2",
        displayName: null,
        identityLabel: "111",
        channel: "LINE",
        leadStatus: "NEW",
        createdAt: "2026-05-29T09:00:00.000Z"
      }
    ],
    pageInfo: { nextCursor: null }
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.items[0]?.displayName, "111");
});

test("resolveLeadDisplayLabel returns Unknown only when no safe identity exists", () => {
  assert.equal(resolveLeadDisplayLabel({ leadId: "l3" }), "Unknown");
  const parsed = parseLeadsListResponse({
    data: [{ leadId: "l3", channel: "LINE", leadStatus: "NEW", createdAt: "2026-05-29T09:00:00.000Z" }],
    pageInfo: { nextCursor: null }
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.items[0]?.displayName, "Unknown");
});

test("avatar initials use resolved lead display label", () => {
  const label = resolveLeadDisplayLabel({ identityLabel: "111" });
  assert.equal(initialsAvatarFromDisplayName(label), "11");
  assert.equal(initialsAvatarFromDisplayName(resolveLeadDisplayLabel({ displayName: "Pat Smith" })), "PS");
});

test("leadsPageModel maps API rows through resolveLeadDisplayLabel", () => {
  assert.equal(leadsPageModelSource.includes("resolveLeadDisplayLabel(raw)"), true);
  assert.equal(leadsPageSource.includes("initialsAvatarFromDisplayName(displayName)"), true);
});

test("parseLeadsListResponse maps profileImageUrl from pipeline DTO", () => {
  const parsed = parseLeadsListResponse({
    data: [
      {
        leadId: "l1",
        displayName: "Pat",
        profileImageUrl: "https://cdn.example/p.jpg",
        channel: "LINE",
        leadStatus: "NEW",
        createdAt: "2026-05-29T09:00:00.000Z"
      }
    ],
    pageInfo: { nextCursor: null }
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.items[0]?.profileImageUrl, "https://cdn.example/p.jpg");
  }
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

test("buildLeadsListUrl preserves filters when paginating", () => {
  const url = buildLeadsListUrl(
    {
      ...DEFAULT_LEADS_LIST_FILTERS,
      status: "QUALIFIED",
      channel: "LINE",
      owner: "agent-1",
      followUp: "today",
      sla: "dueSoon",
      search: "acme"
    },
    "cursor-xyz"
  );
  assert.match(url, /cursor=cursor-xyz/);
  assert.match(url, /status=QUALIFIED/);
  assert.match(url, /channel=LINE/);
  assert.match(url, /owner=agent-1/);
  assert.match(url, /followUp=today/);
  assert.match(url, /sla=dueSoon/);
  assert.match(url, /search=acme/);
});

test("extractLeadsListPageInfo reads nextCursor from pageInfo and snake_case variants", () => {
  assert.deepEqual(extractLeadsListPageInfo({ pageInfo: { nextCursor: "abc" } }), {
    nextCursor: "abc",
    hasNextPage: true
  });
  assert.deepEqual(extractLeadsListPageInfo({ page_info: { next_cursor: "def" } }), {
    nextCursor: "def",
    hasNextPage: true
  });
  assert.deepEqual(extractLeadsListPageInfo({ pageInfo: { hasNextPage: true, nextCursor: null } }), {
    nextCursor: null,
    hasNextPage: true
  });
  assert.deepEqual(extractLeadsListPageInfo({ pageInfo: { nextCursor: null } }), {
    nextCursor: null,
    hasNextPage: false
  });
});

test("parseLeadsListResponse exposes nextCursor for initial load more visibility", () => {
  const withCursor = parseLeadsListResponse({
    data: [{ leadId: "l1", displayName: "A", channel: "LINE", leadStatus: "NEW", createdAt: "2026-05-29T09:00:00.000Z" }],
    pageInfo: { nextCursor: "page-2" }
  });
  assert.equal(withCursor.ok, true);
  if (withCursor.ok) {
    assert.equal(withCursor.pageInfo.nextCursor, "page-2");
    assert.equal(withCursor.pageInfo.hasNextPage, true);
  }

  const withoutCursor = parseLeadsListResponse({
    data: [{ leadId: "l2", displayName: "B", channel: "LINE", leadStatus: "NEW", createdAt: "2026-05-29T09:00:00.000Z" }],
    pageInfo: { nextCursor: null }
  });
  assert.equal(withoutCursor.ok, true);
  if (withoutCursor.ok) {
    assert.equal(withoutCursor.pageInfo.nextCursor, null);
    assert.equal(withoutCursor.pageInfo.hasNextPage, false);
  }
});

test("parseLeadsListResponse reads snake_case pageInfo for production compatibility", () => {
  const parsed = parseLeadsListResponse({
    data: [{ leadId: "l3", displayName: "C", channel: "LINE", leadStatus: "NEW", createdAt: "2026-05-29T09:00:00.000Z" }],
    page_info: { next_cursor: "cursor-snake" }
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.pageInfo.nextCursor, "cursor-snake");
  }
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

test("resolveLeadInboxActionState legacy row allows Open inbox when conversation id exists", () => {
  const state = resolveLeadInboxActionState(sampleLeadRow());
  assert.equal(state.canOpen, true);
  assert.equal(state.href, "/dashboard?conversationId=conv-1");
  assert.equal(state.statusLabel, null);

  const parsed = parseLeadsListResponse({
    data: [
      {
        leadId: "legacy-1",
        conversationId: "conv-legacy",
        displayName: "Legacy",
        channel: "LINE",
        leadStatus: "NEW",
        createdAt: "2026-05-29T09:00:00.000Z"
      }
    ],
    pageInfo: { nextCursor: null }
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    const legacyState = resolveLeadInboxActionState(parsed.items[0]!);
    assert.equal(legacyState.canOpen, true);
    assert.equal(legacyState.href, "/dashboard?conversationId=conv-legacy");
  }
});

test("resolveLeadInboxActionState canOpenInbox=true allows Open inbox", () => {
  const state = resolveLeadInboxActionState(sampleLeadRow({ canOpenInbox: true }));
  assert.equal(state.canOpen, true);
  assert.equal(state.href, "/dashboard?conversationId=conv-1");
});

test("resolveLeadInboxActionState archived disables Open inbox with status copy", () => {
  const state = resolveLeadInboxActionState(
    sampleLeadRow({ canOpenInbox: false, inboxState: "ARCHIVED", conversationArchivedAt: "2026-05-29T10:00:00.000Z" })
  );
  assert.equal(state.canOpen, false);
  assert.equal(state.href, null);
  assert.equal(state.statusLabel, "Archived");
  assert.equal(state.helperText, "No active inbox conversation");
});

test("resolveLeadInboxActionState purged disables Open inbox and shows history purged copy", () => {
  const state = resolveLeadInboxActionState(
    sampleLeadRow({ canOpenInbox: false, inboxState: "PURGED", historyPurgedAt: "2026-05-29T11:00:00.000Z" })
  );
  assert.equal(state.canOpen, false);
  assert.equal(state.href, null);
  assert.equal(state.statusLabel, "History purged");
  assert.match(state.helperText ?? "", /no longer available/i);
});

test("resolveLeadInboxActionState unknown with canOpenInbox=false does not navigate", () => {
  const state = resolveLeadInboxActionState(
    sampleLeadRow({ canOpenInbox: false, inboxState: "UNKNOWN", conversationId: "conv-1" })
  );
  assert.equal(state.canOpen, false);
  assert.equal(state.href, null);
});

test("parseLeadsListResponse maps optional inbox lifecycle fields from API rows", () => {
  const parsed = parseLeadsListResponse({
    data: [
      {
        leadId: "l-arch",
        conversationId: "c-arch",
        displayName: "Archived lead",
        channel: "LINE",
        leadStatus: "NEW",
        createdAt: "2026-05-29T09:00:00.000Z",
        inboxState: "ARCHIVED",
        can_open_inbox: false,
        retention_label: "Archived from inbox"
      }
    ],
    pageInfo: { nextCursor: null }
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    const row = parsed.items[0]!;
    assert.equal(row.inboxState, "ARCHIVED");
    assert.equal(row.canOpenInbox, false);
    assert.equal(row.retentionLabel, "Archived from inbox");
    const inbox = resolveLeadInboxActionState(row);
    assert.equal(inbox.canOpen, false);
    assert.equal(inbox.helperText, "Archived from inbox");
  }
});

test("Leads page disabled Open inbox uses preventDefault and does not use link href", () => {
  assert.equal(leadsPageSource.includes("resolveLeadInboxActionState"), true);
  assert.equal(leadsPageSource.includes("event.preventDefault()"), true);
  assert.equal(leadsPageSource.includes("leads-open-inbox-link-disabled"), true);
  assert.equal(leadsPageSource.includes('data-testid={`leads-open-inbox-disabled-${row.leadId}`}'), true);
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

test("globals.css makes leads list panel and table body vertically scrollable", () => {
  assert.match(globalsCss, /\.leads-root\s*>\s*\.leads-main\s*\{[^}]*min-height:\s*0/s);
  assert.match(globalsCss, /\.leads-list-panel\s*\{[^}]*min-height:\s*0/s);
  assert.match(globalsCss, /\.leads-table-scroll\s*\{[^}]*overflow:\s*auto/s);
  assert.match(globalsCss, /\.leads-table-wrap\s*\{[^}]*min-height:\s*0/s);
});

test("Dashboard enables Leads nav link for authorized users", () => {
  const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
  assert.equal(dashboardSource.includes('data-testid="nav-leads"'), true);
  assert.equal(dashboardSource.includes('href="/dashboard/leads"'), true);
  assert.equal(dashboardSource.includes('app-rail-nav-item-disabled" disabled aria-disabled="true" title="Coming soon">\n            <span className="app-rail-nav-icon" aria-hidden="true">\n              LD'), false);
});
