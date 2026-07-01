# META-CRED-1D-L-E4A — Pre-Launch Chat Data Purge Assessment

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-07-01 |
| Phase | META-CRED-1D-L-E4A (assessment / dry-run only) |
| Assessed production baseline SHA | `4a45c552da835ca62aeddf692d7d27eafb8474ec` |
| Railway deployment (at assessment) | `23ed8522-faef-4668-a2a3-28d5ac4e54e9` |
| Evidence package | META-CRED-1D-L-E4A-EVIDENCE (docs-only) |

## Operator decision (context)

- The product has **not** launched to real production users.
- Existing chat/conversation history is **disposable pre-launch test data**.
- This is **business approval to design a purge plan** — it was **not** execution authorization.
- **E4A does not authorize deletion or E4B.** Actual purge requires separate **E4B** authorization with independent review, backup confirmation, and explicit GO.

## Executive summary

Read-only schema/dependency mapping and a **transactional DELETE dry-run with guaranteed ROLLBACK** confirm a tenant-scoped chat purge is feasible without touching credentials, bindings, activation state, or channel configuration.

**Recommended approach:** **Approach A** — explicit tenant-scoped `DELETE` in dependency order (not `TRUNCATE CASCADE`).

**Transactional dry-run:** **YES** — all chat operational tables reached zero in-transaction; preserve tables unchanged; **ROLLBACK** executed; post-rollback counts restored (e.g. conversations **450**).

**Final decision: PASS — READY TO REQUEST CONTROLLED PRE-LAUNCH CHAT DATA PURGE AUTHORIZATION**

---

## 1. Environment lock

| Check | Result |
| --- | --- |
| `origin/master` | `4a45c552da835ca62aeddf692d7d27eafb8474ec` ✓ |
| Railway deployment | `23ed8522…` @ `4a45c55…` ✓ |
| Worker | **healthy** / Online |
| Queue/outbox depth | **0** / **0** |
| Resolver flag | **ABSENT** |
| Activation flag | **ABSENT** |
| Active incident | **0** |
| Production writes committed | **NONE** |

---

## 2. Tenant scope

| Field | Value |
| --- | --- |
| Scope source | `meta_page_credential_bindings` ACTIVE FACEBOOK row |
| Tenant id (sanitized) | `ba82…865f` |
| Tenants in database | **1** |
| Cross-tenant delete risk | **Low** with binding-derived `tenant_id` predicate on every step |
| Predicate pattern | `WHERE tenant_id = (SELECT tenant_id FROM meta_page_credential_bindings WHERE binding_status='ACTIVE' AND channel_type='FACEBOOK' LIMIT 1)` |

---

## 3. Schema dependency map (summary)

### Purge candidates (disposable pre-launch chat operational data)

| Table | PK | Tenant key | FK notes | ON DELETE | Classification |
| --- | --- | --- | --- | --- | --- |
| `message_events` | id | tenant_id | → messages | NO ACTION | **Purge** (delete before messages) |
| `messages` | id | tenant_id | → conversations | NO ACTION | **Purge** |
| `conversation_events` | id | tenant_id | → conversations | NO ACTION | **Purge** |
| `marketing_events` | id | tenant_id | → conversations (SET NULL) | SET NULL | **Purge** (tenant DELETE) |
| `conversations` | id | tenant_id | → leads (required) | NO ACTION | **Purge** |
| `activity_logs` | id | tenant_id | → leads | NO ACTION | **Purge** (chat ops timeline) |
| `webhook_events` | id | tenant_id | — | NO ACTION | **Purge** (ingress audit) |
| `queue_jobs` | id | tenant_id | payload refs only | NO ACTION | **Purge** (all statuses) |
| `outbox_events` | id | tenant_id | payload refs only | NO ACTION | **Purge** |
| `rate_limit_counters` | composite | tenant_id | — | — | **Purge** |
| `marketing_automation_bridge_outbox` | id | tenant_id | — | — | **Purge** (0 rows today) |

### Separate review / optional E4B phase 2 (CRM identities)

| Table | Classification |
| --- | --- |
| `leads` | **Review** — not auto-disposable; likely synthetic pre-launch (381 rows) |
| `contacts` | **Review** — 385 rows; delete only if operator confirms synthetic |
| `contact_identities` | **Review** — 381 rows; profile cache paths may reference storage |
| `customers` | **Preserve** — 0 rows |

### Preserve (must not purge in E4B chat phase)

| Table | Reason |
| --- | --- |
| `tenants` | Platform tenant |
| `sales_agents` | Users/memberships |
| `channel_connections` | Runtime config |
| `channel_credentials` | Runtime secrets |
| `channel_settings` | Runtime config |
| `meta_page_credentials` | RETRY-5 credential |
| `meta_page_credential_bindings` | ACTIVE Facebook binding |
| `meta_page_credential_activation_requests` | COMPLETED activation evidence |
| `oauth_transactions`, `instagram_oauth_*` | OAuth state (if present) |
| `tenant_sla_policies`, `automation_rules` | Configuration |
| `retention_purge_runs` | Retention audit evidence (4 rows) |
| Schema migrations / metadata | Immutable infrastructure history |

### Explicit exclusions from Phase 1 (must not delete in chat purge phase)

| Exclusion | Reason |
| --- | --- |
| `leads`, `contacts`, `contact_identities` | CRM records — optional Phase 2 only with separate approval |
| `idempotency_keys` | Global table (405 rows), no `tenant_id` — scope analysis required; no blanket delete |
| Supabase Storage objects (`inbound-media`, `profile-avatars`) | Separate authorization; DB purge orphans refs |
| Credentials, bindings, activation state | RETRY-5 preserve scope |
| Channel configuration | Runtime preserve scope |

### Special table: `idempotency_keys`

| Field | Value |
| --- | --- |
| Row count (global) | **405** |
| `tenant_id` column | **Absent** |
| Phase 1 action | **Exclude** — requires separate scope-key analysis before any future cleanup |

### Triggers

Production `pg_trigger` scan on `public` schema: **no user triggers** found. Dry-run DELETE had no trigger side effects observed.

---

## 4. Baseline counts (approved tenant scope)

| Table | Rows |
| --- | ---: |
| conversations | 450 |
| messages | 1,424 |
| message_events | 0 |
| conversation_events | 45 |
| marketing_events | 2,456 |
| activity_logs | 1,709 |
| webhook_events | 1,243 |
| queue_jobs | 1,480 |
| outbox_events | 1,379 |
| rate_limit_counters | 444 |
| marketing_automation_bridge_outbox | 0 |
| leads | 381 |
| contacts | 385 |
| contact_identities | 381 |
| retention_purge_runs | 4 |
| meta_page_credentials | 1 |
| meta_page_bindings | 1 |
| channel_connections | 1 |
| activation_requests | 1 |

### Conversations by channel

| Channel | Count |
| --- | ---: |
| FACEBOOK | 391 |
| LINE | 37 |
| INSTAGRAM | 22 |

### Operational non-terminal rows

| Metric | Count |
| --- | ---: |
| Queue PENDING/PROCESSING | **0** |
| Outbox non-dispatched | **0** |

---

## 5. Object storage assessment

| Asset | Finding |
| --- | --- |
| `inbound-media` bucket | Messages with storage metadata refs: **92** |
| `profile-avatars` bucket | `contact_identities.profile_image_cached_path` set: **28** |
| External CDN URLs | Present in message metadata (not enumerated) |

**E4B classification:**

- Phase 1 (DB chat purge): **database rows only** — storage objects become orphaned unless separately cleaned.
- Phase 1b (optional, separate authorization): enumerate and delete tenant-prefixed objects in `inbound-media` and `profile-avatars` via Supabase Storage API — **not executed in E4A**.

---

## 6. Proposed deletion order (E4B phase 1 — chat operational)

All steps use the **binding-derived tenant_id** predicate.

| Step | Table | Expected deletes | Dependency reason |
| ---: | --- | ---: | --- |
| 1 | `message_events` | 0 | Child of messages |
| 2 | `messages` | 1,424 | Child of conversations |
| 3 | `conversation_events` | 45 | Child of conversations |
| 4 | `marketing_events` | 2,456 | Chat timeline / conversation refs |
| 5 | `conversations` | 450 | Chat root |
| 6 | `activity_logs` | 1,709 | Lead activity from chat ops |
| 7 | `webhook_events` | 1,243 | Ingress persistence |
| 8 | `queue_jobs` | 1,480 | Delivery queue history |
| 9 | `outbox_events` | 1,379 | Outbox history |
| 10 | `rate_limit_counters` | 444 | Ephemeral counters |
| 11 | `marketing_automation_bridge_outbox` | 0 | Bridge outbox |

**Not recommended:** `TRUNCATE … CASCADE` — would risk unscoped objects and lacks auditable per-table counts.

### Optional E4B phase 2 (requires separate operator approval)

| Step | Table | Expected deletes |
| ---: | --- | ---: |
| 12 | `contact_identities` | 381 |
| 13 | `contacts` | 385 |
| 14 | `leads` | 381 |

---

## 7. Transactional dry-run results

| Item | Result |
| --- | --- |
| Performed | **YES** |
| Committed | **NO** |
| Triggers blocking | **NONE** |
| Cross-tenant impact | **NONE** (single-tenant DB) |

### Before → after (inside transaction, before ROLLBACK)

| Table | Before | After |
| --- | ---: | ---: |
| messages | 1,424 | **0** |
| conversations | 450 | **0** |
| marketing_events | 2,456 | **0** |
| queue_jobs | 1,480 | **0** |
| outbox_events | 1,379 | **0** |
| meta_page_credentials | 1 | **1** ✓ |
| meta_page_bindings | 1 | **1** ✓ |
| channel_connections | 1 | **1** ✓ |
| activation_requests | 1 | **1** ✓ |
| leads | 381 | **381** (phase 1 preserved) |
| retention_purge_runs | 4 | **4** ✓ |

### Post-ROLLBACK verification

| Table | Count after rollback |
| --- | ---: |
| conversations | **450** (restored) |

---

## 8. E4B worker / ingress pause plan (not executed)

1. Confirm queue/outbox **idle** (0 pending).
2. **Scale down / pause Railway worker** (prevent claim during purge).
3. Optionally gate Vercel webhooks (maintenance flag or Meta pause) to stop new writes.
4. Run E4B SQL in explicit transaction with operator witness; **COMMIT** only on separate authorization.
5. Verify preserve assertions.
6. Resume worker; confirm `/ready` healthy.
7. Keep resolver and activation flags **OFF**.

---

## 9. Backup / restore readiness

| Mechanism | Status |
| --- | --- |
| Supabase PITR / backup | **Assumed available** on SmartKorp project — operator must confirm dashboard backup window before E4B |
| Pre-E4B logical export | **Recommended** — `pg_dump` schema+data or Supabase backup snapshot before COMMIT |
| Rollback after bad COMMIT | Restore from PITR/snapshot — **not tested in E4A** |

---

## 10. Post-purge preserve checks (E4B)

- `meta_page_credentials`: 1 ACTIVE, version **1**
- `meta_page_credential_bindings`: 1 ACTIVE FACEBOOK, version **1**
- Instagram bindings: **0**
- Activation request: **COMPLETED** (1)
- Flags: resolver **ABSENT**, activation **ABSENT**
- `channel_connections`: unchanged READY Facebook connection
- Worker `/ready`: healthy, queue/outbox **0**

---

## 11. Fresh-data / cutover readiness plan (post-purge, future)

After purge and before resolver cutover:

1. Receive **one** new Facebook conversation under later smoke authorization only.
2. Verify `conversations.channel_connection_id` is **non-empty** and matches ACTIVE binding (`507d…279d`).
3. Verify tenant `ba82…865f` and Page prefix `5418…`.
4. Keep `HUBCHAT_META_PAGE_CREDENTIAL_ENABLED` **OFF** until separate cutover gate.
5. Re-run E3-style `channelConnectionId` counts — expect **0 missing** on new cohort.

This addresses E3 HOLD (177/390 historical rows missing `channelConnectionId`).

---

## 12. Proposed E4B execution SQL (DO NOT RUN without authorization)

```sql
-- E4B PHASE 1 — COMMIT ONLY WITH EXPLICIT AUTHORIZATION
BEGIN;

-- Optional: assert preserve invariants before delete
-- SELECT count(*) FROM meta_page_credentials WHERE status='ACTIVE' AND credential_version=1;

WITH scope AS (
  SELECT tenant_id AS tid FROM meta_page_credential_bindings
  WHERE binding_status='ACTIVE' AND channel_type='FACEBOOK' LIMIT 1
)
DELETE FROM message_events me USING scope s WHERE me.tenant_id = s.tid;

WITH scope AS (SELECT tenant_id AS tid FROM meta_page_credential_bindings WHERE binding_status='ACTIVE' AND channel_type='FACEBOOK' LIMIT 1)
DELETE FROM messages m USING scope s WHERE m.tenant_id = s.tid;

WITH scope AS (SELECT tenant_id AS tid FROM meta_page_credential_bindings WHERE binding_status='ACTIVE' AND channel_type='FACEBOOK' LIMIT 1)
DELETE FROM conversation_events ce USING scope s WHERE ce.tenant_id = s.tid;

WITH scope AS (SELECT tenant_id AS tid FROM meta_page_credential_bindings WHERE binding_status='ACTIVE' AND channel_type='FACEBOOK' LIMIT 1)
DELETE FROM marketing_events mk USING scope s WHERE mk.tenant_id = s.tid;

WITH scope AS (SELECT tenant_id AS tid FROM meta_page_credential_bindings WHERE binding_status='ACTIVE' AND channel_type='FACEBOOK' LIMIT 1)
DELETE FROM conversations c USING scope s WHERE c.tenant_id = s.tid;

WITH scope AS (SELECT tenant_id AS tid FROM meta_page_credential_bindings WHERE binding_status='ACTIVE' AND channel_type='FACEBOOK' LIMIT 1)
DELETE FROM activity_logs al USING scope s WHERE al.tenant_id = s.tid;

WITH scope AS (SELECT tenant_id AS tid FROM meta_page_credential_bindings WHERE binding_status='ACTIVE' AND channel_type='FACEBOOK' LIMIT 1)
DELETE FROM webhook_events w USING scope s WHERE w.tenant_id = s.tid;

WITH scope AS (SELECT tenant_id AS tid FROM meta_page_credential_bindings WHERE binding_status='ACTIVE' AND channel_type='FACEBOOK' LIMIT 1)
DELETE FROM queue_jobs q USING scope s WHERE q.tenant_id = s.tid;

WITH scope AS (SELECT tenant_id AS tid FROM meta_page_credential_bindings WHERE binding_status='ACTIVE' AND channel_type='FACEBOOK' LIMIT 1)
DELETE FROM outbox_events o USING scope s WHERE o.tenant_id = s.tid;

WITH scope AS (SELECT tenant_id AS tid FROM meta_page_credential_bindings WHERE binding_status='ACTIVE' AND channel_type='FACEBOOK' LIMIT 1)
DELETE FROM rate_limit_counters r USING scope s WHERE r.tenant_id = s.tid;

WITH scope AS (SELECT tenant_id AS tid FROM meta_page_credential_bindings WHERE binding_status='ACTIVE' AND channel_type='FACEBOOK' LIMIT 1)
DELETE FROM marketing_automation_bridge_outbox b USING scope s WHERE b.tenant_id = s.tid;

-- Post-delete assertions (counts should be 0 for chat tables; preserve tables unchanged)
-- COMMIT;  -- ONLY WITH EXPLICIT E4B AUTHORIZATION
ROLLBACK;   -- default during rehearsal
```

---

## 13. Remaining risks

1. **Storage orphans** — 92 inbound-media refs + 28 avatar cache paths; DB purge alone does not remove objects.
2. **CRM residue** — Phase 1 leaves 381 leads / 385 contacts unless phase 2 approved.
3. **`idempotency_keys`** (405 global) — requires scope-key analysis; do not truncate.
4. **PITR not verified** — operator must confirm backup before E4B COMMIT.
5. **Ingress during purge** — worker pause + webhook gating required in E4B.
6. **Fresh `channelConnectionId`** — must be validated on new traffic after purge before cutover (resolves E3 blocker).

---

## 14. Production actions

| Action | Performed |
| --- | --- |
| Committed DELETE/TRUNCATE/UPDATE | **NO** |
| Storage object deletion | **NO** |
| Env / deploy changes | **NO** |
| Activation replay | **NO** |
| RETRY-5 token access | **NO** |

---

## 15. Final decision

**PASS — READY TO REQUEST CONTROLLED PRE-LAUNCH CHAT DATA PURGE AUTHORIZATION**

This report **does not authorize E4B**. Deletion remains prohibited until independent review, concrete PITR/backup confirmation, and explicit GO.

**Current gate: HOLD — PENDING INDEPENDENT REVIEW, BACKUP CONFIRMATION AND EXPLICIT E4B GO**

Separate **E4B** gate required for COMMIT, worker pause, webhook gating, backup confirmation, and optional storage/CRM phases.
