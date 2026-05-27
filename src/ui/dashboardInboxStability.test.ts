import test from "node:test";
import assert from "node:assert/strict";
import {
  formatDashboardLoadError,
  getChatMessagesEmptyHint,
  getInboxSidebarPresentation,
  resolveInboxSelectionAfterListRefresh,
  sanitizeDashboardUserFacingError,
  shouldReloadMessagesForSelection
} from "./dashboardInboxStability.js";

test("resolveInboxSelectionAfterListRefresh keeps previous id when still in list", () => {
  const resolution = resolveInboxSelectionAfterListRefresh({
    previousSelectedId: "conv-b",
    pageRows: [
      {
        id: "conv-a",
        channel_type: "LINE",
        external_user_id: "lead-a",
        last_message_at: "2026-01-02T00:00:00.000Z"
      },
      {
        id: "conv-b",
        channel_type: "LINE",
        external_user_id: "lead-b",
        last_message_at: "2026-01-03T00:00:00.000Z"
      }
    ],
    reloadMessagesForKeptSelection: true
  });
  assert.equal(resolution.selectedConversationId, "conv-b");
  assert.equal(resolution.shouldLoadMessages, true);
  assert.deepEqual(resolution.groupedConversationIds, ["conv-b"]);
});

test("resolveInboxSelectionAfterListRefresh skips message reload on silent poll when selection kept", () => {
  const resolution = resolveInboxSelectionAfterListRefresh({
    previousSelectedId: "conv-a",
    pageRows: [{ id: "conv-a", channel_type: "LINE", last_message_at: "2026-01-02T00:00:00.000Z" }],
    reloadMessagesForKeptSelection: false
  });
  assert.equal(resolution.selectedConversationId, "conv-a");
  assert.equal(resolution.shouldLoadMessages, false);
});

test("resolveInboxSelectionAfterListRefresh selects first lead when previous id removed", () => {
  const resolution = resolveInboxSelectionAfterListRefresh({
    previousSelectedId: "conv-missing",
    pageRows: [
      {
        id: "conv-z",
        channel_type: "LINE",
        external_user_id: "lead-z",
        last_message_at: "2026-01-04T00:00:00.000Z"
      },
      {
        id: "conv-y",
        channel_type: "LINE",
        external_user_id: "lead-y",
        last_message_at: "2026-01-01T00:00:00.000Z"
      }
    ],
    reloadMessagesForKeptSelection: true
  });
  assert.equal(resolution.selectedConversationId, "conv-z");
  assert.equal(resolution.shouldLoadMessages, true);
});

test("resolveInboxSelectionAfterListRefresh clears selection when inbox is empty", () => {
  const resolution = resolveInboxSelectionAfterListRefresh({
    previousSelectedId: "conv-gone",
    pageRows: [],
    reloadMessagesForKeptSelection: true
  });
  assert.equal(resolution.selectedConversationId, "");
  assert.equal(resolution.shouldLoadMessages, false);
  assert.deepEqual(resolution.groupedConversationIds, []);
});

test("getInboxSidebarPresentation distinguishes loading, error, filter-empty, and inbox-empty", () => {
  assert.equal(
    getInboxSidebarPresentation({
      meError: "",
      conversationsLoadError: "",
      listLoading: true,
      visibleLeadCount: 0,
      totalConversationCount: 0
    }).testId,
    "inbox-sidebar-loading"
  );
  assert.equal(
    getInboxSidebarPresentation({
      meError: "",
      conversationsLoadError: "Could not load conversations: HTTP 503",
      listLoading: false,
      visibleLeadCount: 0,
      totalConversationCount: 0
    }).emptyHint,
    "Could not load conversations: HTTP 503"
  );
  assert.equal(
    getInboxSidebarPresentation({
      meError: "",
      conversationsLoadError: "",
      listLoading: false,
      visibleLeadCount: 0,
      totalConversationCount: 3
    }).testId,
    "inbox-sidebar-filter-empty"
  );
  assert.equal(
    getInboxSidebarPresentation({
      meError: "",
      conversationsLoadError: "",
      listLoading: false,
      visibleLeadCount: 0,
      totalConversationCount: 0
    }).testId,
    "inbox-sidebar-empty"
  );
});

test("getChatMessagesEmptyHint covers selection, loading, error, and empty thread", () => {
  assert.equal(
    getChatMessagesEmptyHint({
      selectedConversationId: "",
      hasSelectedConversation: false,
      messagesLoading: false,
      messagesError: "",
      messageCount: 0
    }),
    "Select a conversation from the inbox to view messages."
  );
  assert.equal(
    getChatMessagesEmptyHint({
      selectedConversationId: "conv-x",
      hasSelectedConversation: false,
      messagesLoading: false,
      messagesError: "",
      messageCount: 0
    }),
    "This conversation is no longer available. Pick another from the inbox."
  );
  assert.equal(
    getChatMessagesEmptyHint({
      selectedConversationId: "conv-x",
      hasSelectedConversation: true,
      messagesLoading: true,
      messagesError: "",
      messageCount: 0
    }),
    "Loading messages…"
  );
  assert.equal(
    getChatMessagesEmptyHint({
      selectedConversationId: "conv-x",
      hasSelectedConversation: true,
      messagesLoading: false,
      messagesError: "Could not load messages",
      messageCount: 0
    }),
    null
  );
});

test("sanitizeDashboardUserFacingError redacts bearer tokens and long jwt fragments", () => {
  assert.equal(
    sanitizeDashboardUserFacingError("Auth failed Bearer abc.def.ghi"),
    "Auth failed [redacted]"
  );
  assert.match(
    sanitizeDashboardUserFacingError("bad token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig"),
    /sign in again/i
  );
});

test("formatDashboardLoadError prefixes operator-safe message", () => {
  assert.equal(
    formatDashboardLoadError("Could not load messages", new Error("HTTP 500")),
    "Could not load messages: HTTP 500"
  );
});

test("shouldReloadMessagesForSelection when loaded thread differs", () => {
  assert.equal(shouldReloadMessagesForSelection("conv-a", ""), true);
  assert.equal(shouldReloadMessagesForSelection("conv-a", "conv-a"), false);
  assert.equal(shouldReloadMessagesForSelection("conv-a", "conv-b"), true);
});
