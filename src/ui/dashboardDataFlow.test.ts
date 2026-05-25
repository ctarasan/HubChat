import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PaginationConfig } from "../interfaces/api/pagination.js";

const source = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

test("dashboard conversation list builds grouped lead items from conversations", () => {
  assert.equal(source.includes("const leadItems = useMemo("), true);
  assert.equal(source.includes("buildLeadListItems(conversations"), true);
});

test("dashboard does not fetch per-conversation messages while loading conversation list", () => {
  const start = source.indexOf("async function loadConversations(");
  const end = source.indexOf("async function loadMessages(");
  assert.equal(start >= 0 && end > start, true);
  const loadConversationsBlock = source.slice(
    start,
    end
  );
  assert.equal(loadConversationsBlock.includes("limit=${CONVERSATION_PAGE_LIMIT}"), true);
  assert.match(source, /const CONVERSATION_PAGE_LIMIT = (\d+);/);
  assert.equal(
    Number(source.match(/const CONVERSATION_PAGE_LIMIT = (\d+);/)![1]),
    PaginationConfig.DEFAULT_LIMIT
  );
  assert.equal(loadConversationsBlock.includes("cursor="), true);
  assert.equal(loadConversationsBlock.includes("conversationsNextCursorRef"), true);
  assert.equal(loadConversationsBlock.includes("append"), true);
  assert.equal(loadConversationsBlock.includes("/messages?limit=100"), false);
  assert.equal(source.includes("Load more"), true);
});

test("dashboard composer does not render outbound channel selector UI", () => {
  assert.equal(source.includes("Selected channel"), false);
  assert.equal(source.includes("Outbound Channel"), false);
});

test("dashboard includes team inbox filter bar and assignment controls", () => {
  assert.equal(source.includes("inbox-filter-bar"), true);
  assert.equal(source.includes("assignment-controls"), true);
  assert.equal(source.includes("assignment-agent-select"), true);
});

test("dashboard send flow uses conversation-derived active channel", () => {
  assert.equal(source.includes("const activeChannel: OutboundChannel = contextChannel ?? \"LINE\";"), true);
  assert.equal(source.includes("channel: activeChannel"), true);
});

test("dashboard refreshes conversation list via governed silent poll scheduler", () => {
  assert.equal(source.includes("dashboardPollGovernance"), true);
  assert.equal(source.includes("DashboardConversationPollScheduler"), true);
  assert.equal(source.includes("parseConversationsPollIntervalMs"), true);
  assert.equal(source.includes("visibilitychange"), true);
  assert.equal(source.includes("{ silent: true }"), true);
  assert.equal(source.includes("loadConversationsRef"), true);
});

test("silent poll patches first page when load more was used without replacing extra pages", () => {
  const start = source.indexOf("async function loadConversations(");
  const end = source.indexOf("async function loadMessages(");
  const block = source.slice(start, end);
  assert.equal(block.includes("silent && hasLoadedMoreConversationsRef.current"), true);
  assert.equal(block.includes("freshMap.get(c.id)"), true);
});

test("dashboard lead click opens latest grouped conversation", () => {
  assert.equal(source.includes("setSelectedConversationId(item.latestConversationId);"), true);
  assert.equal(
    source.includes("void loadMessages(item.latestConversationId, item.conversationIds, { forceScroll: true });"),
    true
  );
});

test("dashboard sidebar shows grouped thread count label", () => {
  assert.equal(source.includes("threads"), true);
  assert.equal(source.includes("conversation-thread-count"), true);
});

test("dashboard timeline includes date separators and time labels", () => {
  assert.equal(source.includes("function formatDateSeparator"), true);
  assert.equal(source.includes("function formatTimeLabel"), true);
  assert.equal(source.includes("msg-day-separator"), true);
  assert.equal(source.includes("entry.timeLabel"), true);
});

test("dashboard image rendering uses lazy loading and thumbnail fallback text", () => {
  assert.equal(source.includes("loading=\"lazy\""), true);
  assert.equal(source.includes("Image received - no preview available"), true);
});

test("dashboard image URL resolver includes snake_case and metadata fallbacks", () => {
  assert.equal(source.includes("m.preview_url"), true);
  assert.equal(source.includes("m.media_url"), true);
  assert.equal(source.includes("m.metadataJson ?? m.metadata_json"), true);
  assert.equal(source.includes("metadata.previewUrl"), true);
  assert.equal(source.includes("metadata.mediaUrl"), true);
  assert.equal(source.includes("metadata.thumbnailUrl"), true);
  assert.equal(source.includes("metadata.fullImageUrl"), true);
});

test("dashboard image messages do not fall back to [Empty]", () => {
  assert.equal(source.includes("{isImageMessage ? ("), true);
  assert.equal(source.includes("Image received - no preview available"), true);
});

test("dashboard image rendering supports metadata preview URL fallback", () => {
  assert.equal(source.includes("metadata.previewUrl"), true);
  assert.equal(source.includes("{isImageMessage && imageUrl ? ("), true);
});

test("dashboard media debug output is available behind env flag", () => {
  assert.equal(source.includes("NEXT_PUBLIC_DEBUG_MEDIA"), true);
  assert.equal(source.includes("JSON.stringify("), true);
  assert.equal(source.includes("metadata: m.metadataJson ?? m.metadata_json ?? {}"), true);
});

test("dashboard loadMessages normalizes camelCase and snake_case fields", () => {
  assert.equal(source.includes("function normalizeMessageRow"), true);
  assert.equal(source.includes("messageType:"), true);
  assert.equal(source.includes("mediaUrl:"), true);
  assert.equal(source.includes("previewUrl:"), true);
  assert.equal(source.includes("metadataJson:"), true);
});

test("grouped lead message loading uses single request with includeConversationIds", () => {
  const start = source.indexOf("async function loadMessages(");
  const end = source.indexOf("async function loadOlderMessages(");
  assert.equal(start >= 0 && end > start, true);
  const loadMessagesBlock = source.slice(start, end);
  assert.equal(loadMessagesBlock.includes("includeConversationIds"), true);
  assert.equal(loadMessagesBlock.includes("limit=${MESSAGE_PAGE_LIMIT}"), true);
  assert.match(source, /const MESSAGE_PAGE_LIMIT = (\d+);/);
  assert.equal(
    Number(source.match(/const MESSAGE_PAGE_LIMIT = (\d+);/)![1]),
    PaginationConfig.MESSAGE_DEFAULT_LIMIT
  );
  assert.equal(loadMessagesBlock.includes("Promise.all("), false);
});

test("dashboard supports load older messages with cursor", () => {
  assert.equal(source.includes("Load older messages"), true);
  assert.equal(source.includes("appendOlder"), true);
  assert.equal(source.includes("olderMessagesCursor"), true);
});

test("grouped lead message sorting uses occurred_at/created_at timeline", () => {
  assert.equal(source.includes("parseMessageCreatedAt(a)?.toISOString()"), true);
  assert.equal(source.includes("return aTime < bTime ? -1 : 1;"), true);
});

test("grouped mark-read marks all conversation ids", () => {
  assert.equal(source.includes("async function markConversationRead(conversationIds: string[])"), true);
  assert.equal(source.includes("void markConversationRead(item.conversationIds);"), true);
});

test("outbound target remains latest selected conversation id", () => {
  assert.equal(source.includes("conversationId: selectedConversation.id"), true);
});

test("dashboard send payload includes grouped conversationIds", () => {
  assert.equal(source.includes("conversationIds: selectedLeadItem?.conversationIds ?? [selectedConversation.id]"), true);
});

test("dashboard composer ownership UX uses helper and blocking hint", () => {
  assert.equal(source.includes("getComposerOwnershipState"), true);
  assert.equal(source.includes("composer-ownership-hint"), true);
  assert.equal(source.includes("composerOwnership.canReplyByOwnership"), true);
  assert.equal(source.includes("Replies are validated on the server (assignment ownership)."), false);
});

test("dashboard includes Team Members nav for managers and admins only", () => {
  assert.equal(source.includes("app-rail-nav"), true);
  assert.equal(source.includes('href="/dashboard/team-members"'), true);
  assert.equal(
    source.includes("(meContext.role === \"MANAGER\" || meContext.role === \"ADMIN\")") &&
      source.indexOf('href="/dashboard/team-members"') >
        source.indexOf("(meContext.role === \"MANAGER\" || meContext.role === \"ADMIN\")"),
    true
  );
});

test("dashboard includes conversation status filter, badges, and PATCH status flow (Phase II-C1)", () => {
  assert.equal(source.includes("conversation-status-filter-bar"), true);
  assert.equal(source.includes("status-pill-conversation"), true);
  assert.equal(source.includes("/api/conversations/${encodeURIComponent(cid)}/status"), true);
  assert.equal(source.includes("applyConversationStatus"), true);
  assert.equal(source.includes("conversation-status-select"), true);
});

test("dashboard lead list renders read-only inbox urgency badges (Phase II-C2-D)", () => {
  assert.equal(source.includes("resolveInboxBadgeDescriptors"), true);
  assert.equal(source.includes("conversation-list-inbox-badges"), true);
  assert.equal(source.includes("inbox-badge"), true);
});

test("dashboard includes manager inbox filters and frozen query builder (Phase II-D2.1)", () => {
  assert.equal(source.includes("manager-inbox-filters"), true);
  assert.equal(source.includes("buildConversationsListQuerySuffix"), true);
  assert.equal(source.includes("inboxFilters"), true);
  assert.equal(source.includes("inboxFiltersRef"), true);
  assert.equal(source.includes("leadManagementStatus"), true);
  assert.equal(source.includes("computeInboxFirstPageSummary"), true);
  assert.equal(source.includes("data-testid=\"inbox-clear-all-filters\""), true);
  assert.equal(source.includes("data-testid=\"dashboard-inbox-active-filters\""), true);
  assert.ok(source.includes('data-testid={`inbox-scope-${key}`}'));
  assert.equal(source.includes("inbox-scope-sales-hint"), true);
  assert.equal(source.includes('["team", "Team inbox"]'), true);
});

test("dashboard filter change reloads conversations without breaking load more", () => {
  assert.equal(source.includes("inboxFilters,"), true);
  assert.equal(source.includes("void loadMoreConversations()"), true);
  assert.equal(source.includes("hasLoadedMoreConversationsRef"), true);
  const loadStart = source.indexOf("async function loadConversations(");
  const loadEnd = source.indexOf("async function loadMessages(");
  const loadBlock = source.slice(loadStart, loadEnd);
  assert.equal(loadBlock.includes("inboxFiltersRef.current"), true);
  assert.equal(loadBlock.includes("&conversationStatus="), false);
});

test("dashboard selected header includes follow-up edit UI and PATCH follow-up flow (Phase II-C2-E)", () => {
  assert.equal(source.includes("formatFollowUpHeaderLine"), true);
  assert.equal(source.includes("conv-header-followup-popover"), true);
  assert.equal(source.includes("follow-up-editor-panel"), true);
  assert.equal(source.includes("conversationFollowUpPatchPath"), true);
  assert.equal(source.includes("buildFollowUpSavePatch"), true);
  assert.equal(source.includes("buildFollowUpClearPatch"), true);
  assert.equal(source.includes("mergeConversationFollowUpFromPayload"), true);
  assert.equal(source.includes("getFollowUpStateDescriptor"), true);
  assert.equal(source.includes("followUpUpdateBusy"), true);
  assert.equal(source.includes('type="datetime-local"'), true);
});

test("dashboard lead status badge and PATCH lead-status flow (Phase II-C3-B)", () => {
  assert.equal(source.includes("getLeadManagementStatusLabel"), true);
  assert.equal(source.includes("resolveLeadManagementStatusFromRow"), true);
  assert.equal(source.includes("status-pill-lead"), true);
  assert.equal(source.includes("lead-status-select"), true);
  assert.equal(source.includes("conversationLeadStatusPatchPath"), true);
  assert.equal(source.includes("buildLeadStatusPatch"), true);
  assert.equal(source.includes("mergeConversationLeadStatusFromPayload"), true);
  assert.equal(source.includes("applyConversationLeadStatus"), true);
  assert.equal(source.includes("mapLeadStatusSaveError"), true);
  assert.equal(source.includes("leadStatusUpdateBusy"), true);
  assert.equal(source.includes("latestLeadManagementStatus"), true);
  assert.equal(source.includes("/api/leads/"), false);
});

test("dashboard Instagram composer allows image upload and blocks PDF (Phase II-H1)", () => {
  assert.equal(source.includes('activeChannel === "INSTAGRAM" && kind === "document_pdf"'), true);
  assert.equal(source.includes("Instagram DM does not support PDF attachments yet."), true);
  assert.equal(source.includes('activeChannel === "INSTAGRAM" && kind === "image"'), true);
  assert.equal(source.includes("Instagram DM image must be <= 8MB."), true);
  assert.equal(source.includes("/api/messages/upload-image"), true);
  assert.equal(source.includes('type: "image"'), true);
  assert.equal(source.includes("applyConversationLeadStatus"), true);
});
