# Agent Report — FPC-CLEANUP-1 Historical Facebook Page Self-Comment Lead Cleanup

## Metadata

| Field | Value |
|---|---|
| Agent | A |
| Date | 2026-06-12 (plan); production closure recorded 2026-06-12 |
| Phase | FPC-CLEANUP-1 — **COMPLETE** |
| Tenant | `ba82d847-53cd-4b60-9e4d-5fd3f8ad865f` |
| Related fix | PR [#218](https://github.com/ctarasan/HubChat/pull/218) FPC-2G suppression |
| Ops SQL | `scripts/fpc-cleanup-1-facebook-self-comment-inventory.sql` |
| Status | **Phase A COMPLETE · Phase B COMPLETE · FPC-CLEANUP-1 COMPLETE** |

## Goal

Remove historical **bogus Facebook Comment** conversations/leads created when the Page commented on its own posts (`value.from.id === entry.id`), before FPC-2G suppression shipped.

**Candidate rule (stable IDs only — never display name):**

```sql
channel_type = 'FACEBOOK'
AND provider_thread_type = 'FACEBOOK_COMMENT'
AND provider_page_id IS NOT NULL
AND provider_external_user_id = provider_page_id
```

**Production Facebook Pages (tenant scope):**

| Label | Page ID |
|---|---|
| SMARTKORP | `541846535686129` |
| SK Messenger | `1137356672785125` |

---

## Suppression cutoff (production)

| Evidence | Timestamp (UTC) |
|---|---|
| FPC-2G PR #218 merge | `2026-06-12T05:24:15Z` |
| **Production suppression cutoff used for cleanup** | **`2026-06-12T07:43:00+00`** |

Post-cutoff candidate conversations were verified **zero** before hard-delete commit.

---

## Execution method

Controlled **hard delete** was executed in production:

1. Inventory and dependency counts run in Supabase (ops SQL).
2. Delete transaction **rehearsed with `ROLLBACK`** against reviewed conversation IDs.
3. Same transaction **committed** after operator sign-off.

**Archive (`status = 'ARCHIVED'`) was not the selected execution method** for this cleanup. The ops SQL archive template remains available for future reversible scenarios only.

**No product-code change was required** for cleanup execution.

---

## Phase A — COMPLETE

Pure fake Page self-comment candidate conversations (ID rule above).

| Metric | Count |
|---|---|
| Initial candidate conversations | **29** |
| Pure fake conversations deleted | **28** |
| Messages deleted | **23** |
| Marketing events deleted | **33** |
| Activity logs deleted | **25** |
| SK Messenger fake lead deleted | **1** |
| SK Messenger contact identity deleted | **1** |
| SK Messenger contact deleted | **1** |
| conversation_events | **0** |
| message_events | **0** |
| marketing_automation_bridge_outbox | **0** |

---

## Phase B — COMPLETE

**Mixed conversation** (not a pure candidate — required manual review):

| Field | Value |
|---|---|
| Conversation ID | `fb0915ca-9099-4618-80d3-1a4b32623030` |
| Contents | 1 Facebook Page self-comment body; 4 `[reaction]` placeholder messages |
| Legitimate customer comment | **None** — no relocation required |

| Metric | Count |
|---|---|
| Mixed conversation deleted | **1** |
| Messages deleted | **5** |
| Marketing events deleted | **12** |
| Activity logs deleted | **1** |
| Fake SMARTKORP lead deleted | **1** |
| SMARTKORP contact identity deleted | **1** |
| SMARTKORP contact deleted | **1** |
| conversation_events | **0** |
| message_events | **0** |
| marketing_automation_bridge_outbox | **0** |

---

## Final post-commit verification

| Check | Result |
|---|---|
| Mixed conversation `fb0915ca-9099-4618-80d3-1a4b32623030` | **0** |
| Mixed messages | **0** |
| Mixed marketing events | **0** |
| Orphan `LEAD_CREATED` event | **0** |
| Fake SMARTKORP lead / activity / contact / identity | **0** |
| Remaining Page contact identities | **0** |
| Remaining Page leads | **0** |
| Remaining Page self-comment candidate conversations | **0** |

---

## Legitimate records preserved

| Person | Leads | Identities | Contacts | Conversations |
|---|---|---|---|---|
| Chamnan Tarasansombat | 1 | 1 | 1 | 10 |
| Eed Thitaree | 1 | 1 | 1 | 1 |
| Piyanut Dechosilpa | 1 | 1 | 1 | 0 |
| Poolsub Tarasan | 1 | 1 | 1 | 2 |

---

## Dependency map (reference — informed delete order)

No verified ON DELETE CASCADE on core conversation/message graph. Production delete followed explicit child-first order documented in `scripts/fpc-cleanup-1-facebook-self-comment-inventory.sql` §9.

```
conversations → messages → message_events
              → conversation_events
              → marketing_automation_bridge_outbox → marketing_events
              → activity_logs (bogus leads)
              → conversations
              → leads (only when no remaining conversations)
              → contact_identities / contacts (Page-ID identities, manual review)
```

---

## Post-cleanup smoke (production)

- [x] Remaining Page self-comment candidate conversations = **0**
- [x] Legitimate customer leads/conversations preserved (table above)
- [x] FPC-2G suppression active — no new Page-ID comment candidates after cutoff
- [ ] Ongoing: spot-check real Facebook comment ingest + Team Inbox (operator cadence)

---

## Code changes

**None.** Cleanup was operator-executed SQL using inventory script and reviewed ID lists. FPC-2G (PR #218) prevents new bogus rows at ingest.
