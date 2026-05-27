import {
  buildLeadListItems,
  type ConversationParticipantFallbackRow,
  type LeadListItem
} from "./chatComposerModel.js";

const JWT_FRAGMENT_RE = /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\./;
const STACK_TRACE_RE = /\s+at\s+.+\(.+\)/;

export type InboxSelectionResolution = {
  selectedConversationId: string;
  groupedConversationIds: string[];
  shouldLoadMessages: boolean;
};

export type InboxSidebarPresentation = {
  showList: boolean;
  emptyHint: string | null;
  testId: string;
};

/** Strip secrets and stack traces from API errors shown to operators. */
export function sanitizeDashboardUserFacingError(message: string): string {
  const collapsed = message.replace(/\s+/g, " ").trim();
  if (!collapsed) return "Something went wrong. Please try again.";
  const withoutStack = collapsed.split(STACK_TRACE_RE)[0]?.trim() ?? collapsed;
  const redacted = withoutStack
    .replace(/secret_json/gi, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "[redacted]");
  if (JWT_FRAGMENT_RE.test(redacted)) {
    return "Something went wrong. Please sign in again or contact support.";
  }
  return redacted.length > 240 ? `${redacted.slice(0, 237)}…` : redacted;
}

export function formatDashboardLoadError(prefix: string, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const safe = sanitizeDashboardUserFacingError(raw);
  if (safe.startsWith("Something went wrong")) {
    return `${prefix}. ${safe}`;
  }
  return `${prefix}: ${safe}`;
}

function findLeadGroupForConversationId(
  leadItems: LeadListItem[],
  conversationId: string
): LeadListItem | null {
  return (
    leadItems.find(
      (item) =>
        item.latestConversationId === conversationId || item.conversationIds.includes(conversationId)
    ) ?? null
  );
}

/**
 * After a full conversation-list refresh, keep a valid selection or fall back to the first lead.
 */
export function resolveInboxSelectionAfterListRefresh(input: {
  previousSelectedId: string;
  pageRows: ConversationParticipantFallbackRow[];
  tenantId?: string;
  reloadMessagesForKeptSelection: boolean;
}): InboxSelectionResolution {
  const idSet = new Set(
    input.pageRows.map((row) => String((row as { id?: string }).id ?? "").trim()).filter(Boolean)
  );
  const previousSelectedId = input.previousSelectedId.trim();
  const leadItems = buildLeadListItems(input.pageRows, { tenantId: input.tenantId });

  if (previousSelectedId && idSet.has(previousSelectedId)) {
    const lead = findLeadGroupForConversationId(leadItems, previousSelectedId);
    return {
      selectedConversationId: previousSelectedId,
      groupedConversationIds: lead?.conversationIds ?? [previousSelectedId],
      shouldLoadMessages: input.reloadMessagesForKeptSelection
    };
  }

  if (leadItems.length > 0) {
    const firstLead = leadItems[0]!;
    return {
      selectedConversationId: firstLead.latestConversationId,
      groupedConversationIds: firstLead.conversationIds,
      shouldLoadMessages: true
    };
  }

  return {
    selectedConversationId: "",
    groupedConversationIds: [],
    shouldLoadMessages: false
  };
}

export function getInboxSidebarPresentation(input: {
  meError: string;
  conversationsLoadError: string;
  listLoading: boolean;
  visibleLeadCount: number;
  totalConversationCount: number;
}): InboxSidebarPresentation {
  if (input.meError.trim()) {
    return { showList: false, emptyHint: null, testId: "inbox-sidebar-me-error" };
  }
  if (input.conversationsLoadError.trim()) {
    return {
      showList: false,
      emptyHint: input.conversationsLoadError.trim(),
      testId: "inbox-sidebar-error"
    };
  }
  if (input.listLoading) {
    return {
      showList: false,
      emptyHint: "Loading conversations…",
      testId: "inbox-sidebar-loading"
    };
  }
  if (input.visibleLeadCount === 0) {
    if (input.totalConversationCount > 0) {
      return {
        showList: false,
        emptyHint: "No conversations match your filters.",
        testId: "inbox-sidebar-filter-empty"
      };
    }
    return {
      showList: false,
      emptyHint: "No conversations in this inbox yet.",
      testId: "inbox-sidebar-empty"
    };
  }
  return { showList: true, emptyHint: null, testId: "inbox-sidebar-ready" };
}

export function getChatMessagesEmptyHint(input: {
  selectedConversationId: string;
  hasSelectedConversation: boolean;
  messagesLoading: boolean;
  messagesError: string;
  messageCount: number;
}): string | null {
  if (!input.selectedConversationId.trim()) {
    return "Select a conversation from the inbox to view messages.";
  }
  if (!input.hasSelectedConversation) {
    return "This conversation is no longer available. Pick another from the inbox.";
  }
  if (input.messagesLoading) {
    return "Loading messages…";
  }
  if (input.messagesError.trim()) {
    return null;
  }
  if (input.messageCount === 0) {
    return "No messages in this conversation yet.";
  }
  return null;
}

export function shouldReloadMessagesForSelection(
  selectedConversationId: string,
  loadedConversationId: string
): boolean {
  const selected = selectedConversationId.trim();
  if (!selected) return false;
  return loadedConversationId.trim() !== selected;
}
