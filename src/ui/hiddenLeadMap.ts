/**
 * Browser-local lead hide map for Dashboard inbox.
 *
 * v2 stores conversation IDs with each hide so post-purge recreations that
 * reuse the same external identity (leadKey) are not permanently suppressed.
 * Legacy v1 (`hubchat.hidden.leads.v1`) is intentionally not migrated — clearing
 * stale v1 maps matches the confirmed production recovery.
 */

export const HIDDEN_LEADS_STORAGE_PREFIX_V1 = "hubchat.hidden.leads.v1";
export const HIDDEN_LEADS_STORAGE_PREFIX_V2 = "hubchat.hidden.leads.v2";

export type HiddenLeadEntry = {
  hiddenAt: string;
  conversationIds: string[];
};

/** In-memory map shape used by DashboardPage. */
export type HiddenLeadMap = Record<string, HiddenLeadEntry>;

export type LeadVisibilityInput = {
  leadKey: string;
  latestMessageAt: string;
  conversationIds: string[];
};

export function hiddenLeadsStorageKey(tenantId: string): string {
  return `${HIDDEN_LEADS_STORAGE_PREFIX_V2}:${tenantId.trim()}`;
}

function normalizeIso(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const dt = new Date(trimmed);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString();
}

function normalizeConversationIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Build a hide entry from the lead row being hidden. */
export function buildHiddenLeadEntry(input: {
  latestMessageAt?: string | null;
  conversationIds: string[];
  nowIso?: string;
}): HiddenLeadEntry {
  const fromMessage = normalizeIso(input.latestMessageAt);
  const hiddenAt = fromMessage || normalizeIso(input.nowIso) || new Date().toISOString();
  return {
    hiddenAt,
    conversationIds: normalizeConversationIds(input.conversationIds)
  };
}

/**
 * A lead stays hidden only while every current conversation id was known at hide
 * time and latestMessageAt has not advanced past hiddenAt.
 * New conversation ids (post-purge recreation) always surface.
 */
export function isLeadVisibleAgainstHiddenMap(
  item: LeadVisibilityInput,
  hiddenLeadMap: HiddenLeadMap
): boolean {
  const entry = hiddenLeadMap[item.leadKey];
  if (!entry) return true;

  const currentIds = normalizeConversationIds(item.conversationIds);
  const hiddenIds = new Set(normalizeConversationIds(entry.conversationIds));

  if (currentIds.length === 0) {
    // No stable conversation identity — keep timestamp behavior only.
  } else if (hiddenIds.size === 0) {
    // Entry without ids (should not happen for v2 writers) — do not suppress forever.
    return true;
  } else {
    const hasUnknownConversation = currentIds.some((id) => !hiddenIds.has(id));
    if (hasUnknownConversation) return true;
  }

  const latestMessageAt = normalizeIso(item.latestMessageAt);
  if (!latestMessageAt) return false;
  const hiddenAt = normalizeIso(entry.hiddenAt);
  if (!hiddenAt) return true;
  return latestMessageAt > hiddenAt;
}

export function filterVisibleLeadItems<T extends LeadVisibilityInput>(
  leadItems: T[],
  hiddenLeadMap: HiddenLeadMap
): T[] {
  return leadItems.filter((item) => isLeadVisibleAgainstHiddenMap(item, hiddenLeadMap));
}

/** Parse v2 localStorage JSON. Invalid shapes become {}. Never reads v1. */
export function parseHiddenLeadMap(raw: string | null | undefined): HiddenLeadMap {
  if (raw == null || typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: HiddenLeadMap = {};
    for (const [leadKey, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof leadKey !== "string" || !leadKey.trim()) continue;
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const record = value as Record<string, unknown>;
      const hiddenAt = normalizeIso(record.hiddenAt);
      const conversationIds = normalizeConversationIds(record.conversationIds);
      if (!hiddenAt) continue;
      out[leadKey] = { hiddenAt, conversationIds };
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeHiddenLeadMap(map: HiddenLeadMap): string {
  return JSON.stringify(map ?? {});
}

export function loadHiddenLeadMapFromStorage(
  storage: Pick<Storage, "getItem"> | null | undefined,
  tenantId: string
): HiddenLeadMap {
  const tid = tenantId.trim();
  if (!storage || !tid) return {};
  try {
    return parseHiddenLeadMap(storage.getItem(hiddenLeadsStorageKey(tid)));
  } catch {
    return {};
  }
}

export function saveHiddenLeadMapToStorage(
  storage: Pick<Storage, "setItem"> | null | undefined,
  tenantId: string,
  map: HiddenLeadMap
): void {
  const tid = tenantId.trim();
  if (!storage || !tid) return;
  try {
    storage.setItem(hiddenLeadsStorageKey(tid), serializeHiddenLeadMap(map));
  } catch {
    // Quota / private mode — ignore; hide state is best-effort.
  }
}
