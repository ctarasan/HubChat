import test from "node:test";
import assert from "node:assert/strict";
import { buildLeadListItems } from "./chatComposerModel.js";
import { getInboxSidebarPresentation } from "./dashboardInboxStability.js";
import {
  HIDDEN_LEADS_STORAGE_PREFIX_V1,
  HIDDEN_LEADS_STORAGE_PREFIX_V2,
  buildHiddenLeadEntry,
  filterVisibleLeadItems,
  hiddenLeadsStorageKey,
  isLeadVisibleAgainstHiddenMap,
  loadHiddenLeadMapFromStorage,
  parseHiddenLeadMap,
  saveHiddenLeadMapToStorage,
  serializeHiddenLeadMap,
  type HiddenLeadMap
} from "./hiddenLeadMap.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

function productionShapedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv-new-1",
    tenant_id: TENANT,
    contact_id: "contact-1",
    channel_type: "FACEBOOK",
    channel_thread_id: "thread-1",
    provider_external_user_id: "psid-1",
    provider_page_id: "541846535686129",
    last_message_at: "2026-07-10T08:09:20.356Z",
    last_message_preview: "สะสมแต้มผ่านช่องทางไหนได้บ้าง",
    assignment_status: "UNASSIGNED",
    status: "OPEN",
    assigned_agent_id: null,
    connection_scope_bucket: "active",
    source_type: "DM",
    provider_thread_type: "MESSENGER_DM",
    participant_display_name: null,
    contact_identity_display_name: null,
    unread_count: 0,
    ...overrides
  };
}

test("storage key uses v2 prefix and never the stale v1 key", () => {
  const key = hiddenLeadsStorageKey(TENANT);
  assert.equal(key, `${HIDDEN_LEADS_STORAGE_PREFIX_V2}:${TENANT}`);
  assert.equal(key.includes(HIDDEN_LEADS_STORAGE_PREFIX_V1), false);
});

test("fresh hide still suppresses the same conversation ids until a newer message", () => {
  const leadKey = `${TENANT}|FACEBOOK|ext:psid-1`;
  const entry = buildHiddenLeadEntry({
    latestMessageAt: "2026-07-10T08:09:20.356Z",
    conversationIds: ["conv-old-1"]
  });
  const map: HiddenLeadMap = { [leadKey]: entry };

  assert.equal(
    isLeadVisibleAgainstHiddenMap(
      {
        leadKey,
        latestMessageAt: "2026-07-10T08:09:20.356Z",
        conversationIds: ["conv-old-1"]
      },
      map
    ),
    false
  );

  assert.equal(
    isLeadVisibleAgainstHiddenMap(
      {
        leadKey,
        latestMessageAt: "2026-07-10T09:00:00.000Z",
        conversationIds: ["conv-old-1"]
      },
      map
    ),
    true
  );
});

test("recreated conversation after purge appears even when leadKey hide still exists", () => {
  const leadKey = `${TENANT}|FACEBOOK|ext:psid-1`;
  const map: HiddenLeadMap = {
    [leadKey]: buildHiddenLeadEntry({
      latestMessageAt: "2026-07-13T12:00:00.000Z",
      conversationIds: ["conv-pre-purge"]
    })
  };

  const visible = isLeadVisibleAgainstHiddenMap(
    {
      leadKey,
      // Backfilled / older last_message_at than hide stamp — previously stuck hidden forever.
      latestMessageAt: "2026-07-10T08:09:20.356Z",
      conversationIds: ["conv-post-purge"]
    },
    map
  );
  assert.equal(visible, true);
});

test("old hide state does not permanently suppress new conversations", () => {
  const rows = [
    productionShapedRow({ id: "conv-post-purge-a", provider_external_user_id: "psid-a" }),
    productionShapedRow({
      id: "conv-post-purge-b",
      provider_external_user_id: "psid-b",
      contact_id: "contact-2",
      channel_thread_id: "thread-2",
      last_message_at: "2026-07-10T07:31:09.417Z"
    })
  ];
  const leadItems = buildLeadListItems(rows, { tenantId: TENANT });
  assert.equal(leadItems.length, 2);

  const staleMap: HiddenLeadMap = Object.fromEntries(
    leadItems.map((item) => [
      item.leadKey,
      buildHiddenLeadEntry({
        latestMessageAt: "2026-07-13T18:00:00.000Z",
        conversationIds: [`stale-${item.leadKey}`]
      })
    ])
  );

  const visible = filterVisibleLeadItems(leadItems, staleMap);
  assert.equal(visible.length, 2);

  const presentation = getInboxSidebarPresentation({
    meError: "",
    conversationsLoadError: "",
    listLoading: false,
    visibleLeadCount: visible.length,
    totalConversationCount: rows.length
  });
  assert.equal(presentation.showList, true);
  assert.equal(presentation.emptyHint, null);
});

test("production-shaped OPEN UNASSIGNED null-name rows remain hide-filterable and countable", () => {
  const rows = [
    productionShapedRow(),
    productionShapedRow({
      id: "conv-new-2",
      provider_external_user_id: "psid-2",
      contact_id: "contact-2",
      channel_thread_id: "thread-2",
      last_message_at: "2026-07-10T07:00:44.408Z"
    })
  ];
  const leadItems = buildLeadListItems(rows, { tenantId: TENANT });
  assert.equal(leadItems.length, 2);

  const withNoHides = filterVisibleLeadItems(leadItems, {});
  assert.equal(withNoHides.length, rows.length);
  assert.equal(
    getInboxSidebarPresentation({
      meError: "",
      conversationsLoadError: "",
      listLoading: false,
      visibleLeadCount: withNoHides.length,
      totalConversationCount: rows.length
    }).testId,
    "inbox-sidebar-ready"
  );

  const activeHide: HiddenLeadMap = {
    [leadItems[0]!.leadKey]: buildHiddenLeadEntry({
      latestMessageAt: leadItems[0]!.latestMessageAt,
      conversationIds: leadItems[0]!.conversationIds
    })
  };
  const afterFreshHide = filterVisibleLeadItems(leadItems, activeHide);
  assert.equal(afterFreshHide.length, 1);
  assert.equal(afterFreshHide[0]!.leadKey, leadItems[1]!.leadKey);
});

test("parseHiddenLeadMap rejects legacy string values and corrupt payloads", () => {
  assert.deepEqual(parseHiddenLeadMap(null), {});
  assert.deepEqual(parseHiddenLeadMap("{"), {});
  assert.deepEqual(parseHiddenLeadMap(JSON.stringify({ "t|FACEBOOK|ext:x": "2026-07-01T00:00:00.000Z" })), {});
  assert.deepEqual(
    parseHiddenLeadMap(
      JSON.stringify({
        "t|FACEBOOK|ext:x": {
          hiddenAt: "2026-07-01T00:00:00.000Z",
          conversationIds: ["c1", "c1", ""]
        }
      })
    ),
    {
      "t|FACEBOOK|ext:x": {
        hiddenAt: "2026-07-01T00:00:00.000Z",
        conversationIds: ["c1"]
      }
    }
  );
});

test("same conversation stays hidden without newer message and unhides when latestMessageAt advances", () => {
  const leadKey = `${TENANT}|FACEBOOK|ext:psid-1`;
  const map: HiddenLeadMap = {
    [leadKey]: {
      hiddenAt: "2026-07-10T08:09:20.356Z",
      conversationIds: ["conv-same"]
    }
  };
  assert.equal(
    isLeadVisibleAgainstHiddenMap(
      { leadKey, latestMessageAt: "2026-07-10T08:09:20.356Z", conversationIds: ["conv-same"] },
      map
    ),
    false
  );
  assert.equal(
    isLeadVisibleAgainstHiddenMap(
      { leadKey, latestMessageAt: "2026-07-10T08:09:21.000Z", conversationIds: ["conv-same"] },
      map
    ),
    true
  );
});

test("lead with multiple conversation ids is visible when any current id was not in the hide set", () => {
  const leadKey = `${TENANT}|FACEBOOK|ext:psid-1`;
  const map: HiddenLeadMap = {
    [leadKey]: {
      hiddenAt: "2026-07-13T12:00:00.000Z",
      conversationIds: ["conv-a"]
    }
  };
  assert.equal(
    isLeadVisibleAgainstHiddenMap(
      {
        leadKey,
        latestMessageAt: "2026-07-10T08:09:20.356Z",
        conversationIds: ["conv-a", "conv-b-new"]
      },
      map
    ),
    true
  );
});

test("empty or malformed conversationIds on hide entry fails open", () => {
  const leadKey = `${TENANT}|FACEBOOK|ext:psid-1`;
  assert.equal(
    isLeadVisibleAgainstHiddenMap(
      {
        leadKey,
        latestMessageAt: "2026-07-10T08:09:20.356Z",
        conversationIds: ["conv-1"]
      },
      {
        [leadKey]: {
          hiddenAt: "2026-07-13T12:00:00.000Z",
          conversationIds: []
        }
      }
    ),
    true
  );
  assert.equal(
    isLeadVisibleAgainstHiddenMap(
      {
        leadKey,
        latestMessageAt: "2026-07-10T08:09:20.356Z",
        conversationIds: ["conv-1"]
      },
      {
        [leadKey]: {
          hiddenAt: "2026-07-13T12:00:00.000Z",
          // malformed at runtime
          conversationIds: "not-an-array" as unknown as string[]
        }
      }
    ),
    true
  );
});

test("invalid hiddenAt fails open", () => {
  const leadKey = `${TENANT}|FACEBOOK|ext:psid-1`;
  assert.equal(
    isLeadVisibleAgainstHiddenMap(
      {
        leadKey,
        latestMessageAt: "2026-07-10T08:09:20.356Z",
        conversationIds: ["conv-1"]
      },
      {
        [leadKey]: {
          hiddenAt: "not-a-date",
          conversationIds: ["conv-1"]
        }
      }
    ),
    true
  );
  assert.deepEqual(
    parseHiddenLeadMap(
      JSON.stringify({
        [leadKey]: { hiddenAt: "not-a-date", conversationIds: ["conv-1"] }
      })
    ),
    {}
  );
});

test("invalid JSON fails open", () => {
  assert.deepEqual(parseHiddenLeadMap("{not-json"), {});
  assert.deepEqual(parseHiddenLeadMap("[]"), {});
  assert.deepEqual(parseHiddenLeadMap('"string"'), {});
});

test("localStorage access throwing fails open without crash", () => {
  assert.deepEqual(
    loadHiddenLeadMapFromStorage(
      {
        getItem: () => {
          throw new Error("storage unavailable");
        }
      },
      TENANT
    ),
    {}
  );
  assert.doesNotThrow(() =>
    saveHiddenLeadMapToStorage(
      {
        setItem: () => {
          throw new Error("quota exceeded");
        }
      },
      TENANT,
      {
        [`${TENANT}|FACEBOOK|ext:psid`]: {
          hiddenAt: "2026-07-14T00:00:00.000Z",
          conversationIds: ["conv-1"]
        }
      }
    )
  );
  assert.deepEqual(loadHiddenLeadMapFromStorage(null, TENANT), {});
  assert.doesNotThrow(() =>
    saveHiddenLeadMapToStorage(null, TENANT, {
      [`${TENANT}|FACEBOOK|ext:psid`]: {
        hiddenAt: "2026-07-14T00:00:00.000Z",
        conversationIds: ["conv-1"]
      }
    })
  );
});

test("load/save use v2 storage key and leave v1 untouched", () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    }
  };
  const v1Key = `${HIDDEN_LEADS_STORAGE_PREFIX_V1}:${TENANT}`;
  store.set(v1Key, JSON.stringify({ "old|FACEBOOK|ext:psid": "2026-07-13T00:00:00.000Z" }));

  assert.deepEqual(loadHiddenLeadMapFromStorage(storage, TENANT), {});

  const map: HiddenLeadMap = {
    [`${TENANT}|FACEBOOK|ext:psid`]: buildHiddenLeadEntry({
      latestMessageAt: "2026-07-14T00:00:00.000Z",
      conversationIds: ["conv-1"]
    })
  };
  saveHiddenLeadMapToStorage(storage, TENANT, map);
  assert.equal(store.get(hiddenLeadsStorageKey(TENANT)), serializeHiddenLeadMap(map));
  assert.equal(store.get(v1Key)?.includes("old|FACEBOOK|ext:psid"), true);
});

test("tenant-scoped v2 keys do not leak across tenants", () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    }
  };
  const tenantA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const tenantB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const mapA: HiddenLeadMap = {
    [`${tenantA}|FACEBOOK|ext:psid`]: {
      hiddenAt: "2026-07-14T00:00:00.000Z",
      conversationIds: ["conv-a"]
    }
  };
  saveHiddenLeadMapToStorage(storage, tenantA, mapA);
  assert.deepEqual(loadHiddenLeadMapFromStorage(storage, tenantB), {});
  assert.deepEqual(loadHiddenLeadMapFromStorage(storage, tenantA), mapA);
  assert.notEqual(hiddenLeadsStorageKey(tenantA), hiddenLeadsStorageKey(tenantB));
});
