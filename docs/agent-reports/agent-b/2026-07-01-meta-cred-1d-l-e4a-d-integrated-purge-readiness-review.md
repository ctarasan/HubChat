# META-CRED-1D-L-E4A-D — Integrated Purge Readiness Review (PR #302 / #303 / #304)

## Metadata

| Field | Value |
| --- | --- |
| Agent | B |
| Date | 2026-07-01 |
| Phase | META-CRED-1D-L-E4A-D (integrated read-only review — not E4B execution) |
| Production master baseline | `4a45c552da835ca62aeddf692d7d27eafb8474ec` |
| E4B purge authorization | **NONE** |

## Verdict

**HOLD — INGRESS-GATING IMPLEMENTATION REQUIRED BEFORE E4B**

Integrated evidence is internally consistent. Backup reference is **usable for E4B planning** (PR #304). E4A purge assessment (PR #302) is **structurally valid** with SQL/runbook corrections. Historical PR #303 HOLD remains **valid and must not be rewritten**. However, **no retry-safe webhook/API ingress gate exists in the repository today**, and pausing only the Railway worker is **insufficient** to freeze chat operational writes. E4B COMMIT authorization must not proceed until ingress gating is implemented and independently reviewed.

---

## 1. Review lock

| PR | Branch | Base SHA | Head SHA | State | Mergeable | CI | Head unchanged |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#302](https://github.com/ctarasan/HubChat/pull/302) | `docs/meta-cred-1d-l-e4a-purge-assessment-evidence` | `4a45c552…` | `026aec99fb3ff2da452acc5a3d60dd99381d8901` | OPEN | MERGEABLE | Vercel SUCCESS | **YES** |
| [#303](https://github.com/ctarasan/HubChat/pull/303) | `docs/meta-cred-1d-l-e4a-b-independent-review` | `4a45c552…` | `dbaf2cd342b6b6ecc78b7aaca3af04a7df3e3bbf` | OPEN | MERGEABLE | — | **YES** |
| [#304](https://github.com/ctarasan/HubChat/pull/304) | `docs/meta-cred-1d-l-e4a-c-backup-pitr-evidence` | `4a45c552…` | `842378a26a28aec5eb5667e99cfaf703e46c0f6a` | OPEN | MERGEABLE | — | **YES** |

Review mode: read-only; detached heads verified; no PR modifications.

---

## 2. Diff and sanitization (each PR)

| PR | Single file | `git diff --check` | Hidden/bidi | Secret scan |
| --- | --- | --- | --- | --- |
| #302 | `docs/agent-reports/agent-a/2026-07-01-meta-cred-1d-l-e4a-pre-launch-chat-data-purge-assessment.md` | PASS | PASS | CLEAN |
| #303 | `docs/agent-reports/agent-b/2026-07-01-meta-cred-1d-l-e4a-b-pre-launch-chat-purge-assessment-review.md` | PASS | PASS | CLEAN |
| #304 | `docs/agent-reports/agent-a/2026-07-01-meta-cred-1d-l-e4a-c-backup-pitr-verification.md` | PASS | PASS | CLEAN |

No SQL scripts, migrations, source/runtime changes, env files, dumps, or credential material in any PR.

---

## 3. Evidence reconciliation

| Record | Role | Consistent? |
| --- | --- | --- |
| PR #302 | E4A assessment + rollback-only transactional dry-run | **YES** |
| PR #303 | Valid historical HOLD — backup metadata inaccessible in Agent B environment | **YES — do not invalidate** |
| PR #304 | Later backup/PITR verification via approved existing CLI session | **YES — resolves planning blocker only** |

| Cross-check | Result |
| --- | --- |
| E4B deletion authorized or executed | **NO** (all reports) |
| PITR claimed enabled | **NO** — all state `pitr_enabled: false` |
| Production mutation committed | **NO** |
| PR #303 incorrect because PR #304 exists | **NO** — different verification capability/time |

**Minor corrections required before E4B SQL execution** (not contradictions in evidence PRs): deletion order (`marketing_automation_bridge_outbox` before `marketing_events`); tenant scope must use explicit approved `tenant_id` not `LIMIT 1` alone.

---

## 4. Backup / PITR assessment (PR #304)

Agent B accepts PR #304 claims as **internally consistent planning evidence** (not independently re-run CLI in this task):

| Field | Recorded value |
| --- | --- |
| Project ref | `dskyvomvpkqqznvmnhyx` |
| Backup ID | `1008877754` |
| Timestamp | `2026-07-01T01:05:04.595Z` UTC |
| Status | COMPLETED |
| Type | PHYSICAL |
| `walg_enabled` | true |
| `pitr_enabled` | false |
| Retention | ~7 daily snapshots visible |
| Restore granularity | ~24 hours (daily physical only) |
| Restore model | In-place whole-project; downtime; post-restore DB writes lost |
| Storage contents | Excluded from backup |

### Credential-safe restore point

| Checkpoint | vs `2026-07-01T01:05:04Z` backup |
| --- | --- |
| RETRY-5 activation (2026-06-30) | **PREDATES** — snapshot expected to include ACTIVE credential v1, binding, COMPLETED activation |
| Backups before 2026-07-01 | **Insufficient** for credential-safe rollback |
| PR #300/#301 merges | **POSTDATE** backup (code-only; no required DB migration) |

**Planning reference: USABLE.** **Execution-day revalidation: MANDATORY.**

### PITR / RPO

| Item | Assessment |
| --- | --- |
| PITR | **DISABLED** |
| Worst-case RPO | **~24 hours** (daily snapshot) |
| Sub-minute rollback | **Not available** |
| Optional tighter RPO | Fresh logical backup gate (separate authorization) |

**Recommendation: B** — recent automated daily physical backup with recorded reference; optional **C** (fresh logical backup) if operator requires sub-24h RPO before COMMIT.

---

## 5. Execution-day backup revalidation plan

Preconditions (read-only until explicit E4B GO):

1. Confirm master/deployment unchanged from approved baseline or re-reviewed
2. Confirm worker + ingress maintenance controls **implemented and tested**
3. Confirm queue/outbox non-terminal = **0**
4. Record preserve-state counts (credential, binding, activation, channel config)
5. Enable approved retry-safe ingress gate
6. Pause Railway worker (scale to zero)
7. Confirm no new chat writes (stable counts across two reads)
8. Run `supabase backups list --project-ref dskyvomvpkqqznvmnhyx`
9. Select **COMPLETED PHYSICAL** backup that **postdates RETRY-5** and preserve-state checkpoint
10. Record backup ID, timestamp, status, type as rollback reference
11. Re-run preserve assertions immediately before `BEGIN`
12. Assert Phase 1 before-counts match approved E4A baseline (or updated approved values)
13. `BEGIN` purge transaction only after all assertions pass

**Risk:** Daily backup may not exist until ~01:05 UTC next day after write freeze. If E4B runs same calendar day as last traffic, same-day snapshot may predate final preserve freeze → require **fresh logical backup** or wait for next daily snapshot.

---

## 6. Worker pause readiness

| Item | Finding |
| --- | --- |
| Service | Railway **worker** (production); `railway.json` → `npm run start:worker`, healthcheck `/ready` |
| Current deployment (checkpoint) | `23ed8522…` @ source `4a45c552…` |
| Pause method | Railway scale-to-zero / stop service (documented in operator runbooks; no in-repo pause flag) |
| Confirm inactive | `/ready` unavailable; no queue claim logs; deployment shows 0 replicas |
| Resume | Redeploy / scale up; verify `/ready` healthy |
| Rollback if restart fails | Keep ingress gated; do not COMMIT purge; restore from backup reference if needed |

**Worker pause alone is NOT sufficient** — Vercel webhook and API routes continue writing `webhook_events`, `outbox_events`, `queue_jobs`, and agent-initiated messages.

### Other write-producing processes

| Process | Surface | Chat writes? |
| --- | --- | --- |
| Railway worker | Outbound queue consumer | Yes (messages, queue completion) — paused by worker stop |
| Vercel webhooks | Facebook/Instagram/LINE | **Yes** |
| Vercel `/api/messages/send` | Authenticated outbound | **Yes** |
| Retention purge execute | Admin API | Different scope (raw payload purge); flag-gated separately |
| Scheduled cron in repo | — | **None found** for chat ingest |

---

## 7. Webhook / API route inventory

| Path | Platform | Host | Writes chat operational data | Auth | GET verification |
| --- | --- | --- | --- | --- | --- |
| `GET /api/webhook/facebook` | Meta | Vercel | No | Verify token | **Required — keep available** |
| `POST /api/webhook/facebook` | Facebook (+ Instagram `object=instagram` routing) | Vercel | **Yes** — `webhook_events`, `outbox_events`, `queue_jobs` | HMAC signature | N/A |
| `GET /api/webhook/instagram` | Meta | Vercel | No | Verify token | **Required — keep available** |
| `POST /api/webhook/instagram` | Instagram | Vercel | **Yes** | HMAC signature | N/A |
| `POST /api/webhook/line` | LINE | Vercel | **Yes** | LINE signature | N/A |
| `POST /api/messages/send` | All channels | Vercel | **Yes** — outbound messages + queue | Session auth | N/A |
| OAuth callbacks (`/api/channel-connect/*`) | Meta/LINE/IG | Vercel | OAuth state primarily; not Phase 1 purge tables | OAuth | Partial GET |
| `POST /api/retention/purge-runs/[id]/execute` | Internal | Vercel | Retention raw-payload purge only | ADMIN | N/A |

---

## 8. Ingress-gating assessment

| Check | Result |
| --- | --- |
| Existing default-OFF maintenance / ingest-disable flag | **NOT FOUND** in repository |
| Provider-specific ingest flags | **NOT FOUND** |
| Maintenance middleware returning retryable errors | **NOT FOUND** |
| Safe to return `200` while dropping events | **NO** — Facebook handler acks with `200` on success paths; silent drop unacceptable |

### Provider retry-safety (for future gate design)

| Provider | Recommended maintenance response | Risk if wrong |
| --- | --- | --- |
| Meta (Facebook/Instagram) | **503** (or documented retryable 5xx) on POST delivery; **keep GET verification 200** | `200` drop loses events; disabling GET risks subscription issues |
| LINE | **503** on POST | Uncertain retry — must follow LINE docs in implementation PR |

**Ingress gate available: NO**

**Required before E4B:** Separately reviewed implementation package **META-CRED-1D-L-E4B-INGRESS**:

- Default-OFF ingress maintenance gate (e.g. `HUBCHAT_WEBHOOK_INGEST_MAINTENANCE_MODE` or equivalent)
- When enabled: POST webhook ingest returns **retryable 503**; `/api/messages/send` blocked during maintenance
- GET webhook verification routes remain available (no subscription invalidation)
- No provider secret, webhook subscription, or OAuth state changes as part of gate enablement
- Provider retry and data-loss behavior must be tested and documented per provider
- Production enablement of maintenance mode requires **separate controller authorization**

E4B deletion remains **unauthorized** until ingress gate is implemented, independently reviewed, and explicit E4B COMMIT GO is issued.

---

## 9. Maintenance-window sequence (future E4B)

**Pre-window:** record SHA/deploy; flags OFF; backup CLI access confirmed; restore operator available; tenant + counts locked; no incident.

**Quiesce:** enable ingest maintenance gate → verify GET webhooks → pause Railway worker → block authenticated send API → drain in-flight → two stable count reads → queue/outbox zero.

**Backup reference:** `supabase backups list` → select post–RETRY-5 COMPLETED snapshot → record ID/timestamp → preserve assertions.

**Purge:** `BEGIN` → per-stage deletes (corrected order) → zero-count assertions → preserve unchanged → `COMMIT` only on full pass.

**Post-commit:** read-only verification → keep resolver OFF → resume ingress then worker → inspect retries → queue/outbox health → no smoke without separate GO.

---

## 10. Deletion boundary (Phase 1)

Tables safe for disposable pre-launch operational data **with tenant-scoped DELETE** (not `TRUNCATE CASCADE`):

`message_events`, `messages`, `conversation_events`, `marketing_events`, `conversations`, `activity_logs`, `webhook_events`, `queue_jobs`, `outbox_events`, `rate_limit_counters`, `marketing_automation_bridge_outbox`.

| Broad table | Assessment |
| --- | --- |
| `activity_logs` | Lead-scoped chat ops timeline; `retention_purge_runs` preserved separately — **acceptable** for pre-launch disposable scope |
| `webhook_events` | Ingress audit disposable per operator decision — **acceptable** |
| `rate_limit_counters` | Ephemeral — **acceptable** |

**Order correction required:**

1. `message_events` → 2. `messages` → 3. `conversation_events` → **4. `marketing_automation_bridge_outbox`** → 5. `marketing_events` → 6. `conversations` → 7–11 remainder.

E4A order places `marketing_events` before `bridge_outbox` — **FK violation if bridge rows exist** (0 today).

---

## 11. Tenant isolation (E4B SQL requirements)

- Derive tenant from **controller-approved** ACTIVE Facebook binding record
- Pre-execution assert: exactly **one** approved tenant target
- Prefer explicit `tenant_id = '<approved-uuid>'` over `LIMIT 1` subquery alone
- Assert before-counts per table; abort on mismatch
- No `TRUNCATE CASCADE`; no global `idempotency_keys`; no Storage deletion
- Preserve CRM tables; remain safe if second tenant appears before execution

---

## 12. Preserve-state assertions (E4B)

**Before and after COMMIT:**

- Meta: 1 ACTIVE credential v1; 1 ACTIVE Facebook binding (version match); 0 Instagram bindings; activation COMPLETED; no pending activation
- Channel: `channel_connections`, `channel_credentials`, `channel_settings` unchanged
- Flags: resolver OFF/ABSENT; activation OFF/ABSENT; Channel Connect resolver unchanged
- Ops: queue/outbox idle after resume; worker healthy; incident count 0
- Phase 1 tables: **0** rows in tenant scope after COMMIT

---

## 13. Restore / rollback decision tree

| Phase | Action |
| --- | --- |
| Before COMMIT, assertion fails | `ROLLBACK` transaction; no DB restore; keep quiesced until understood |
| After COMMIT, bad purge | In-place restore to **post–RETRY-5** backup reference; pause worker + ingress first; all DB writes after restore point lost |
| Restore operator | Privileged Supabase org/project admin; not activation replay; not RETRY-5 token reuse |
| Post-restore | Re-verify credential/binding/activation counts before resuming services |

---

## 14. Storage / CRM / idempotency

Phase 1 excludes: `inbound-media` objects, `profile-avatars`, leads, contacts, contact_identities, `idempotency_keys`. Known DB orphans (92 media refs, 28 avatar paths) acceptable temporarily. Separate gates for Storage and CRM Phase 2.

---

## 15. Fresh-data verification (post-purge, future)

Resolver flag stays OFF. Separate smoke authorization: one new Facebook conversation; non-empty `channelConnectionId` matching ACTIVE binding; re-run E3 readiness on new cohort only.

---

## 16. Operational confirmations (this review)

| Check | Result |
| --- | --- |
| PRs #302/#303/#304 modified or merged | **NO** |
| E4B started | **NO** |
| Production changes | **NONE** |
| Backup/restore triggered | **NO** |
| Supabase login/token used | **NO** |
| Worker pause / webhook gating | **NO** |
| Activation replay / RETRY-5 token | **NO** |

---

## 17. Remaining blockers

1. **BLOCKER:** No retry-safe ingress gate in codebase
2. **BLOCKER:** Worker-only pause insufficient
3. **HIGH:** E4B SQL deletion order correction
4. **HIGH:** Explicit tenant UUID locking (not `LIMIT 1` alone)
5. **MEDIUM:** Execution-day backup revalidation mandatory (~24h RPO)
6. **MEDIUM:** Expanded post-rollback dry-run evidence for E4B rehearsal
7. **NOTE:** Storage orphans; CRM residue; global idempotency keys remain

---

## 18. Recommended next controlled gate

**META-CRED-1D-L-E4B-INGRESS — Implement Default-OFF Retry-Safe Ingress Maintenance Gate**

Then **META-CRED-1D-L-E4B** with corrected SQL, execution-day backup revalidation, expanded dry-run, and explicit controller COMMIT GO.

**State:** E4B deletion remains unauthorized. No production service change, PR merge, backup, restore, or activation replay occurred during this review.
