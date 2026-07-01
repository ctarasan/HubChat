# META-CRED-1D-L-E4A-B — Independent Review of PR #302 (Pre-Launch Chat Purge Assessment)

## Metadata

| Field | Value |
| --- | --- |
| Agent | B |
| Date | 2026-07-01 |
| Phase | META-CRED-1D-L-E4A-B (read-only assessment review — not E4B execution) |
| PR reviewed | [#302](https://github.com/ctarasan/HubChat/pull/302) |
| PR branch | `docs/meta-cred-1d-l-e4a-purge-assessment-evidence` |
| PR base SHA | `4a45c552da835ca62aeddf692d7d27eafb8474ec` |
| Reviewed head SHA | `026aec99fb3ff2da452acc5a3d60dd99381d8901` |
| Review lock | DETACHED at PR tip; tracked tree CLEAN |
| PR head unchanged at completion | **YES** |
| E4B deletion authorization | **NONE** |

## Verdict

**HOLD — BACKUP/PITR RESTORE POINT NOT VERIFIED**

E4A assessment is structurally valid for a disposable pre-launch chat purge design; the HOLD is caused by **missing backup/PITR verification capability**, not by rejection of the E4A document on quality grounds. Mandatory E4B backup gate is not satisfied. E4B SQL also requires correction (deletion order, tenant predicate hardening) and ingress-gating design before execution authorization.

This does **not** authorize committed DELETE/UPDATE/TRUNCATE, worker pause, webhook gating, storage deletion, backup/restore, or E4B execution.

---

## 1. Scope verification

| Check | Result |
| --- | --- |
| `git diff --name-only base..head` | **1 file only** |
| File | `docs/agent-reports/agent-a/2026-07-01-meta-cred-1d-l-e4a-pre-launch-chat-data-purge-assessment.md` |
| SQL execution script committed | **NO** (proposed SQL is documented DO NOT RUN) |
| Migrations / source / env files | **NONE** |
| Raw DB dump / secret logs | **NONE** |
| `git diff --check` | PASS |
| Hidden/bidi scan | PASS |
| Secret/token scan | CLEAN |

---

## 2. Assessment evidence review

| Claim | Agent B finding |
| --- | --- |
| Tenant from ACTIVE Facebook Meta Page binding | **Supported** — scope source documented |
| Sanitized tenant id only (`ba82…865f`) | **YES** |
| Database tenant count = 1 | **Recorded** — not re-verified live (read-only review) |
| Tenant-scoped predicates on all proposed deletes | **YES** — all use binding-derived `tenant_id` |
| Baseline table counts | **Recorded** — internally consistent |
| Queue/outbox non-terminal = 0 | **Recorded** |
| No committed production write in E4A | **Supported** |
| Resolver / activation flags absent | **Supported** (checkpoint + report) |
| Transactional dry-run with ROLLBACK | **Claimed YES** — methodology plausible; evidence partial (see §7) |
| Conversations restored to 450 post-rollback | **Recorded** |
| Preserve tables unchanged in dry-run | **Recorded** (credentials, bindings, activation, leads, retention_purge_runs) |
| Storage / CRM / idempotency exclusions | **Accurate** |

E4A correctly does **not** claim E4B authorization or READY FOR CUTOVER.

---

## 3. Schema / FK validation (independent)

Verified against `supabase/schema.sql` and migrations.

### Phase 1 purge tables — FK model

| Table | Parent FKs | ON DELETE | Delete-order note |
| --- | --- | --- | --- |
| `message_events` | `messages(id)` | NO ACTION (default) | Before `messages` ✓ |
| `messages` | `conversations(id)` | NO ACTION | Before `conversations` ✓ |
| `conversation_events` | `conversations(id)` | NO ACTION | Before `conversations` ✓ |
| `marketing_automation_bridge_outbox` | `marketing_events(id)` | **NO ACTION** | **Must be before `marketing_events`** |
| `marketing_events` | `conversations`, `leads` | SET NULL | Before `conversations` ✓ |
| `conversations` | `leads(id)` required | NO ACTION | Child delete OK; leads preserved ✓ |
| `activity_logs` | `leads(id)` | NO ACTION | Independent tenant DELETE ✓ |
| `webhook_events` | `tenants` only | — | Independent ✓ |
| `queue_jobs` | `tenants` only | payload refs only | Independent ✓ |
| `outbox_events` | `tenants` only | payload refs only | Independent ✓ |
| `rate_limit_counters` | `tenants` PK composite | — | Independent ✓ |

### Triggers

No `CREATE TRIGGER` on `public` chat tables in repository migrations/schema — consistent with E4A claim.

### Missing chat-dependent tables

No additional tables with FK to `messages`/`conversations` found beyond Phase 1 scope. `oauth_transactions`, `instagram_oauth_states`, credential/binding tables correctly excluded.

### CRM tolerance

`conversations.lead_id` NOT NULL references `leads` — deleting conversations does **not** require deleting leads. Phase 1 preserves CRM tables; FK compatible.

### `idempotency_keys`

Global table, no `tenant_id` — correct exclusion from Phase 1.

---

## 4. Deletion-order assessment

**Defect identified:** E4A proposes `marketing_events` (step 4) **before** `marketing_automation_bridge_outbox` (step 11). Schema FK `marketing_automation_bridge_outbox.marketing_event_id → marketing_events(id)` is NOT NULL with default NO ACTION. **If bridge_outbox rows exist, step 4 would fail.**

Current production count = 0 masked this in dry-run. **E4B must reorder:** delete `marketing_automation_bridge_outbox` **before** `marketing_events`.

### Corrected recommended order

1. `message_events`
2. `messages`
3. `conversation_events`
4. **`marketing_automation_bridge_outbox`**
5. `marketing_events`
6. `conversations`
7. `activity_logs`
8. `webhook_events`
9. `queue_jobs`
10. `outbox_events`
11. `rate_limit_counters`

All steps can remain in one transaction with per-stage count assertions.

---

## 5. Tenant-isolation assessment

| Check | Result |
| --- | --- |
| Direct `tenant_id` on all Phase 1 tables | **YES** |
| Deterministic join for tables without tenant_id | N/A — all have `tenant_id` |
| Shared config excluded | **YES** |
| Global/provider-wide row deletion | **NO** — tenant predicate on each step |

**Weakness:** Predicate uses `SELECT tenant_id … LIMIT 1` from ACTIVE FACEBOOK binding. With **one tenant today** this is safe; if a second tenant gains an ACTIVE FACEBOOK binding before E4B, `LIMIT 1` is **non-deterministic** and could target the wrong tenant.

**E4B requirement:** Use controller-approved explicit `tenant_id` UUID (or `WHERE tenant_id = $approved AND binding_status='ACTIVE' …` with pre-execution assert `count(*) = 1` on scope). Do not rely on single-tenant assumption alone.

---

## 6. Dry-run methodology assessment

| Check | Result |
| --- | --- |
| Explicit `BEGIN` / `ROLLBACK` in proposed SQL | **YES** |
| Autocommit state documented | **NO** — should record `SHOW transaction_isolation` / session mode in E4B |
| In-transaction after-counts | **Partially recorded** |
| Preserve assertions | **Recorded** for key tables |
| Post-rollback verification | **Thin** — only `conversations = 450` documented; should include `messages`, preserve tables |
| Non-transactional side effects | **None claimed** |
| Storage deletion | **NO** |

Dry-run is **directionally meaningful** but rollback evidence is **insufficient** for highest assurance. Not a merge blocker for assessment doc; **E4B should expand post-rollback checks**.

---

## 7. Preserve / exclusion assessment

### Phase 1 purge candidates — **appropriate** for disposable pre-launch chat operational data

`message_events`, `messages`, `conversation_events`, `marketing_events`, `conversations`, `activity_logs`, `webhook_events`, `queue_jobs`, `outbox_events`, `rate_limit_counters`, `marketing_automation_bridge_outbox`.

### Preservation — **appropriate**

Credentials, bindings, activation requests, channel config, OAuth tables, SLA/automation config, `retention_purge_runs`, schema history.

### Broad operational table review

| Table | Concern | Finding |
| --- | --- | --- |
| `activity_logs` | Mix with audit? | Lead-scoped chat ops timeline; `retention_purge_runs` preserved separately — **acceptable** for pre-launch disposable scope |
| `webhook_events` | Ingress audit loss | Disposable per operator decision; not immutable security evidence table |
| `rate_limit_counters` | Ephemeral | **Purge OK** |
| `retention_purge_runs` | Immutable audit | **Correctly preserved** (4 rows) |

### Exclusions — **correct**

Leads, contacts, contact_identities, `idempotency_keys`, Storage objects, profile avatars.

---

## 8. Storage assessment

| Finding | Validated |
| --- | --- |
| Inbound-media refs: 92 | **Recorded** (not re-counted live) |
| Profile-avatar cached paths: 28 | **Recorded** |
| Phase 1 DB-only | **YES** |
| Orphans after DB purge | **Expected** |
| DB integrity not blocked | **YES** |
| Object cleanup separate authorization | **YES** |

---

## 9. CRM / idempotency assessment

| Check | Result |
| --- | --- |
| Leads/contacts/contact_identities preserved | **YES** |
| FK tolerates conversation deletion | **YES** |
| Retained CRM blocks Phase 1 | **NO** |
| `idempotency_keys` global — no blanket delete | **Correct** |
| Stale idempotency keys block Phase 1 safety | **NO** immediate blocker |

---

## 10. Backup / PITR verification (mandatory gate)

**Project ref (sanitized):** `dskyvomvpkqqznvmnhyx` (SmartKorp Hub Chat production — from existing operator docs only)

### Verification attempt

| Item | Result |
| --- | --- |
| Command attempted | `supabase projects list` (read-only CLI) |
| Outcome | **Failed before project backup inspection** |
| Error class | `LegacyPlatformAuthRequiredError` |
| Reason | Supabase platform access token was not provided |
| Interactive login | **Not available** — not performed |
| `SUPABASE_ACCESS_TOKEN` | **Not available** — not used |
| Service-role keys / CLI auth files | **Not accessed** |
| Dashboard inspection | **Not performed** — no operator dashboard session in review environment |
| Backup / restore triggered | **NO** |
| E4A report | States PITR **assumed**, **not verified** |

### Interpretation

| Field | Status |
| --- | --- |
| Backup/PITR capability | **UNKNOWN** |
| Latest usable restore point | **UNVERIFIED** |
| Restore procedure readiness | **UNVERIFIED** |
| Mandatory E4B backup gate | **NOT SATISFIED** |
| Proof backups are absent | **NO** — insufficient evidence only |
| Proof deletion may be authorized | **NO** — current review evidence insufficient |

**Mandatory gate: FAILED** — no concrete recent restore point independently verified. This is **not** proof that backups are absent; it is proof that current review evidence is insufficient to authorize deletion.

### E4B backup recommendation: **C — Fresh logical backup/snapshot required before E4B**

Until dashboard/CLI read-only verification records:

1. Plan tier and backup capability
2. Latest successful automated backup timestamp (or PITR window bounds)
3. Whether restore is whole-project only

**Pre-E4B actions (not executed in this review):**

- Operator captures Supabase dashboard backup/PITR screenshot or CLI metadata (sanitized)
- Record pre-execution restore point timestamp in E4B authorization artifact
- Perform fresh logical export (`pg_dump` or Supabase backup) immediately before COMMIT if PITR not confirmed
- Document restore validation steps and downtime impact
- Warn: whole-project restore reverses all post-backup writes (credentials, activation state)

---

## 11. Worker / ingress pause-plan assessment

Proposed E4B sequence is **directionally correct** but **not fully designed**:

| Item | Finding |
| --- | --- |
| Railway worker pause | Scale-to-zero / stop service — **required** |
| Vercel webhook ingress | `/api/webhook/facebook`, `/api/webhook/line`, `/api/webhook/instagram` can still insert rows |
| API chat writes | `/api/messages/send` and related routes can enqueue outbound |
| Existing maintenance flag | **NOT FOUND** in repository |
| Webhook retry risk | Meta/LINE may retry on 503 — must use controlled maintenance response design |
| Safe maintenance window | **Not quantified** in E4A |

**E4B must add:** explicit ingress gate design (Meta webhook pause subscription, Vercel maintenance env, or documented accept-and-re-purge risk) before COMMIT authorization.

---

## 12. Post-purge assertion assessment (E4B)

E4A preserve checks are **appropriate**. Agent B adds:

| Additional assertion | Reason |
| --- | --- |
| `messages` count = 0 in tenant scope | Core purge goal |
| `marketing_events`, `queue_jobs`, `outbox_events` = 0 | Operational tables |
| `channel_credentials` row count unchanged | Dual-credential safety |
| `retention_purge_runs` count unchanged (4) | Audit preservation |
| No new `meta_page_credentials.credential_version` drift | Activation integrity |
| Post-purge worker `/ready` + queue/outbox idle | Operational health |

Fresh-conversation plan correctly notes: **historical purge does not prove `channelConnectionId` on new rows** — separate smoke gate required before resolver cutover.

---

## 13. Verification commands

| Command | Result |
| --- | --- |
| `git fetch origin` | PASS |
| `git checkout --detach 026aec99…` | PASS |
| `git diff --name-only 4a45c55..026aec99` | 1 docs file |
| `git diff --check` | PASS |
| Hidden/bidi scan | PASS |
| Secret scan (report) | CLEAN |
| Schema/FK inspection (`supabase/schema.sql`) | Independent review completed |
| `supabase projects list` | Auth required — not available |

---

## 14. Production configuration event (checkpoint)

Recorded per controller evidence (not re-mutated):

- Aborted **"Enable activation flag on Vercel Production"** task; log shows one attempted `vercel env add` for `HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_API_ENABLED=true`
- Fresh production listing: variable **absent**
- Activation gate: **OFF / ABSENT**
- Resolver flag: **OFF / ABSENT**
- No additional production probes or mutations during Agent B review

---

## 15. Findings summary

| Severity | Finding |
| --- | --- |
| **BLOCKER (E4B)** | Backup/PITR not independently verified — mandatory gate |
| **HIGH** | Deletion order: `marketing_automation_bridge_outbox` must precede `marketing_events` |
| **HIGH** | Ingress gating not designed — webhooks/API can write during purge |
| **MEDIUM** | Tenant predicate `LIMIT 1` not multi-tenant safe — require explicit approved `tenant_id` |
| **MEDIUM** | Post-rollback dry-run verification too thin |
| **NOTE** | Storage orphans (92 + 28 paths) expected after Phase 1 |
| **NOTE** | CRM residue unless Phase 2 approved |
| **NOTE** | `idempotency_keys` (405 global) remains — no immediate blocker |

---

## 16. Final decision

```text
META-CRED-1D-L-E4A-B RESULT:
HOLD — BACKUP/PITR RESTORE POINT NOT VERIFIED

PR #302 assessment artifact: structurally valid; not rejected on document quality alone
Transactional dry-run evidence: supported rollback-only behavior (with noted gaps)
Committed production deletion: NONE
E4B execution authorization: NONE
Backup/restore readiness: NOT PROVEN
```

**Do not claim E4B is ready until backup/PITR evidence exists.**

---

## 17. Recommended next controlled gate

**META-CRED-1D-L-E4A-C — Backup/PITR Verification**

Provide an approved read-only Supabase platform access method or operator-supplied dashboard evidence sufficient to verify:

- Latest successful backup timestamp
- Backup retention
- PITR enabled/disabled state
- Available restore range
- Concrete restore procedure and required permissions
- Downtime and whole-project restore impact
- Exact rollback reference for E4B

Subsequent gates (after E4A-C):

1. Amend E4B SQL: corrected deletion order + explicit `tenant_id` scope assert
2. Design ingress gate (worker pause + webhook/API write prevention)
3. Re-run expanded transactional dry-run with multi-table post-rollback counts
4. **META-CRED-1D-L-E4B** independent re-review → explicit COMMIT authorization only after backup proof + ingress design

---

## Operational confirmations

| Check | Result |
| --- | --- |
| PR #302 modified or merged | **NO** |
| E4B started | **NO** |
| Production changes during review | **NONE** |
| Committed DELETE / UPDATE / TRUNCATE | **NO** |
| Worker pause | **NO** |
| Webhook gating | **NO** |
| Environment changes | **NO** |
| Deployment | **NO** |
| Backup or restore triggered | **NO** |
| Supabase login performed | **NO** |
| `SUPABASE_ACCESS_TOKEN` used | **NO** |
| Resolver flag enablement | **NO** |
| Activation replay | **NO** |
| RETRY-5 token accessed | **NO** |
