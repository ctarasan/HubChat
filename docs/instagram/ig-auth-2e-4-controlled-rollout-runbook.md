# IG-AUTH-2E.4 Controlled Rollout Runbook

Operator runbook for **future approved execution** of Instagram OAuth outbound cutover. Uses merged preflight from PR #256 as source of truth for migration/RPC risks and read-only SQL.

**Production domain:** `https://smartkorp-hub-chat.vercel.app`

**Companion docs:**
- [`ig-auth-2e-4-production-migration-preflight.md`](ig-auth-2e-4-production-migration-preflight.md) — read-only SQL templates (PR #256)
- [`2026-06-19-ig-auth-2e-4a-production-readiness-preflight.md`](../agent-reports/agent-a/2026-06-19-ig-auth-2e-4a-production-readiness-preflight.md) — Agent A analysis
- [`ig-auth-2e-6-migration-version-remediation.md`](ig-auth-2e-6-migration-version-remediation.md) — migration version collision fix (2E.6C)
- [`2026-06-19-ig-auth-2e-4b-controlled-rollout-runbook.md`](../agent-reports/agent-b/2026-06-19-ig-auth-2e-4b-controlled-rollout-runbook.md) — Agent B prep index

> **This document does not authorize live action.** Current recommendation: **HOLD** pending authorized read-only production checks (IG-AUTH-2E.5).

**Never record secrets.** Use env var **names**, masked UUIDs, and sanitized log field names only.

---

## Status

| Field | Value |
| --- | --- |
| Master baseline | `c2a8761` (PR #256 merged) |
| Migration file (2E.3, current) | `supabase/migrations/20260621130000_ig_auth_2e3_outbound_instagram_binding.sql` |
| Migration reconcile (2D) | `supabase/migrations/20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql` |
| Historical 2E.3 filename | `20260621120000_ig_auth_2e3_outbound_instagram_binding.sql` (collision — see 2E.6C) |
| Implementation | PR #254 worker/queue binding + routing |
| Preflight analysis | PR #256 — recommendation **HOLD** |
| Production migration state | **UNKNOWN** (not verified at doc time) |
| Production canary | **Not executed** |

---

## Scope and prohibitions

### In scope (when separately approved per phase)

1. Read-only production preflight (2E.5)
2. Migration window (2E.6, flags OFF)
3. Vercel/Railway deploy with flags OFF (2E.6)
4. Legacy regression verification (2E.6)
5. Staged OAuth flag enablement (2E.7)
6. Text-first controlled canary (2E.7)
7. Image-second controlled canary (2E.7)
8. Monitoring, rollback, sanitized evidence

### Out of scope

- Private reply OAuth (2F), OAuth UI, webhook/profile enrichment, refresh scheduler, legacy retirement
- Executing any step in this document without explicit phase approval

### Hard prohibitions

- No OAuth-bound job → legacy conversion
- No queue job deletion without approved recovery procedure
- No migration drop as first rollback action
- No reflexive credential rotation/deletion
- No `select payload_json`, message content, tokens, or full signed URLs in evidence

---

## Phase boundaries

| Phase | Scope | Authorization required |
| --- | --- | --- |
| **IG-AUTH-2E.4** | Readiness + runbook (this document) | None — docs only |
| **IG-AUTH-2E.5** | Authorized **read-only** production preflight | `GO READ-ONLY PREFLIGHT` |
| **IG-AUTH-2E.6** | Migration + deploy with **all OAuth delivery flags OFF** | `GO MIGRATION WINDOW` then `GO DEPLOY FLAGS-OFF` |
| **IG-AUTH-2E.7** | Controlled live text/image canary | `GO TEXT CANARY` / `GO IMAGE CANARY` |
| **Later** | Extended monitoring, expanded allowlist, legacy retirement | `GO EXTENDED MONITORING` + separate reviews |

Prior phase approval does **not** authorize the next phase.

---

## Roles and approvals

| Role | Responsibility |
| --- | --- |
| **Operator / maintainer** | Schedules window, executes approved steps, records evidence |
| **Agent A evidence collector** | Migration preflight, deploy SHA capture, SQL results |
| **Agent B independent verifier** | Reviews evidence pack; confirms HOLD/GO rubric |
| **Rollback owner** | Executes rollback sequence; available entire window |
| **Human recipient verifier** | Confirms Instagram DM delivery on test device |

### Required approval phrases

| Phrase | Authorizes |
| --- | --- |
| `GO READ-ONLY PREFLIGHT` | IG-AUTH-2E.5 read-only SQL and env name inspection only |
| `GO MIGRATION WINDOW` | Apply additive DB migrations `20260621120000`, `20260621130000`, `20260621140000` |
| `GO DEPLOY FLAGS-OFF` | Vercel + Railway deploy at approved SHA; all five OAuth delivery flags OFF/ABSENT |
| `GO TEXT CANARY` | Stage 3 flags + exactly one OAuth text send |
| `GO IMAGE CANARY` | Stage 4 flags + exactly one OAuth image send (after text PASS) |
| `GO EXTENDED MONITORING` | Post-canary observation window (separate plan) |

---

## Read-only production preflight (IG-AUTH-2E.5)

Execute only after `GO READ-ONLY PREFLIGHT`. Use SQL from [`ig-auth-2e-4-production-migration-preflight.md`](ig-auth-2e-4-production-migration-preflight.md).

### Checklist

| # | Check | Pass criteria |
| --- | --- | --- |
| R1 | Migration history | Classify: `NOT_APPLIED` \| `ALREADY_APPLIED` \| `PARTIALLY_APPLIED` \| `UNKNOWN` |
| R2 | RPC overload | `pg_proc` query — unambiguous 16-arg signature for PostgREST |
| R3 | Schema parity | 16-parameter `create_outbound_message_with_outbox` present |
| R4 | Queue status counts | PENDING / PROCESSING / DONE / DEAD_LETTER recorded |
| R5 | Stale PROCESSING | Count within ops policy |
| R6 | Sanitized error codes | DEAD_LETTER `last_error` previews only (no payload) |
| R7 | OAuth-bound jobs | Count CONNECTION_BOUND PENDING/PROCESSING |
| R8 | Malformed bindings | Zero or documented remediation plan |
| R9 | Outbox baseline | Optional PENDING counts with binding key |
| R10 | Vercel flag names | All five OAuth flags: `ABSENT` or `PRESENT_FALSE` |
| R11 | Railway flag names | All five OAuth flags: `ABSENT` or `PRESENT_FALSE` |
| R12 | OAuth connection | One canary candidate: `INSTAGRAM_BUSINESS_LOGIN`, `DATABASE_ONLY`, ACTIVE credential |
| R13 | Conversation binding | Test conversation has non-null `channel_connection_id` |
| R14 | Rollback readiness | Rollback owner identified; pending-job policy agreed |
| R15 | Deploy SHAs | Vercel + Railway SHAs recorded |

### Flag state vocabulary

Record only: `PRESENT_TRUE` | `PRESENT_FALSE` | `ABSENT` | `UNKNOWN` — never dump env values.

### Current HOLD reasons (from PR #256)

Until R1–R13 pass with evidence:

- Production migration status not verified
- RPC signature/overload not verified in production
- Queue/outbox baseline not captured
- Feature-flag states not re-verified at execution time
- Exact OAuth connection not nominated and verified
- Rollback with pending/in-flight jobs not rehearsed

---

## Migration GO gate

`READY TO SCHEDULE MIGRATION WINDOW` requires:

- Read-only preflight **PASS** (R1–R15)
- Production migration state **known** (not `UNKNOWN`)
- RPC overload **unambiguous** (or documented safe resolution)
- Queue/outbox baseline **acceptable**
- Zero **unexpected** OAuth-bound PENDING/PROCESSING jobs (or explicit drain plan)
- All five OAuth delivery flags **OFF or ABSENT** on Railway (and Vercel)
- Exact OAuth canary connection **ready**
- Rollback owner **available**
- Deployment order **DB-first** agreed
- Migration artifact SHA on master identified

Any failure → **HOLD**

---

## Migration and deployment sequence (IG-AUTH-2E.6)

Execute only after `GO MIGRATION WINDOW` and `GO DEPLOY FLAGS-OFF`.

| Step | Action | Verification |
| --- | --- | --- |
| 0 | Explicit `GO MIGRATION WINDOW` recorded | Approval in evidence pack |
| 1 | Capture production baseline | Ops Runtime + queue SQL + flag snapshot |
| 2 | Confirm all OAuth delivery flags OFF/ABSENT | Railway + Vercel name inspection |
| 3 | **Apply additive DB migrations** (2D → 2E.3 → reconcile) | Migration owner only |
| 4 | Verify migration history row present | `ALREADY_APPLIED` |
| 5 | Run RPC overload query (§1 of preflight doc) | GO: unambiguous 16-arg signature |
| 6 | Deploy **Vercel** app/API — flags OFF | SHA matches approved commit |
| 7 | Deploy **Railway** worker — flags OFF | `/ready` healthy |
| 8 | Verify deployment SHAs | Vercel + Railway recorded |
| 9 | Legacy regression smoke | LINE, Facebook, legacy Instagram (§Legacy regression) |
| 10 | Queue baseline stable | No new stale PROCESSING / DLQ spike |
| 11 | Zero unexpected OAuth-bound jobs | CONNECTION_BOUND pending count = 0 or expected |
| 12 | **Stop** — request separate `GO TEXT CANARY` | Do not enable delivery flags |

### DB-first blocking rule (mandatory)

`SupabaseOutboundCommandRepository` **always** passes `p_instagram_credential_binding` to RPC. If production DB lacks the 16-argument signature:

| Order | Result |
| --- | --- |
| **DB migration → app/worker deploy** | **SAFE** |
| **App/worker deploy → DB migration** | **UNSAFE** — all outbound enqueue fails (LINE/Facebook/Instagram) |
| **Worker-only deploy before DB** (if app already new) | **UNSAFE** — same RPC failure |

**APP-FIRST is forbidden** when migration is `NOT_APPLIED`.

---

## Feature-flag sequence (IG-AUTH-2E.7)

### Environment target matrix (code-derived)

| Flag | Railway worker | Vercel API | Required for OAuth delivery |
| --- | --- | --- | --- |
| `HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED` | **Yes** | Connect/test/resolver API only | Yes (worker) |
| `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` | **Yes** | Connect/test/resolver API only | Yes (worker) |
| `HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED` | **Yes** | No | Yes (worker) |
| `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED` | **Yes** | No | Text canary (worker) |
| `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED` | **Yes** | No | Image canary (worker) |

**Critical:** OAuth binding emission at enqueue is **not flag-gated** on the API. OAuth-managed DMs can enqueue CONNECTION_BOUND jobs while worker flags are OFF; worker **terminal-fails** them (no legacy fallback). Avoid OAuth-managed test sends before Stage 3 unless testing fail-closed behavior.

### Redeploy requirement

Railway worker env changes require **worker redeploy** for `process.env` to refresh. Vercel env changes require **Vercel redeploy** for API routes. During canary, set flags on **Railway only** unless pre-canary test-connection on Vercel is explicitly approved.

### Stages (one at a time — never combine)

| Stage | Railway flags | Vercel flags (default) | Expected behavior |
| --- | --- | --- | --- |
| **0** | All OFF/ABSENT | All OFF/ABSENT | Legacy Instagram; OAuth-bound jobs terminal at worker |
| **1** | FOUNDATION=ON | OFF | No OAuth provider delivery |
| **2** | FOUNDATION + RUNTIME=ON | OFF | No OAuth provider delivery |
| **3 — text** | + WORKER + TEXT=ON; IMAGE OFF | OFF | Single approved text canary only |
| **4 — image** | + IMAGE=ON (TEXT stays ON) | OFF | Single approved image canary after text PASS |

Verify legacy smoke after Stages 1–2 before Stage 3.

---

## Legacy regression smoke (after flags-OFF deploy)

Before any canary flag enablement, verify **no behavior change** while OAuth delivery flags are OFF:

| Channel | Check |
| --- | --- |
| LINE | Inbound + outbound text to known test conversation |
| Facebook | Messenger outbound; comment/private-reply path if in scope |
| Instagram legacy | Page-token DM text + image (non-OAuth connection) |
| Instagram private reply | Comment thread path unchanged |
| Ops Runtime | `/dashboard/ops` — pending/stale/dead-letter acceptable |
| Queue/outbox | No unexplained backlog growth |

Any regression → **ROLLBACK** or **HOLD**; do not proceed to canary.

---

## Text canary (IG-AUTH-2E.7)

Execute only after `GO TEXT CANARY`.

### Eligibility

- Migration applied + RPC verified
- App/worker deployed; legacy regression PASS
- Queue baseline stable; no unexpected OAuth-bound pending jobs
- One approved OAuth-managed connection with `channel_connection_id` on test conversation
- One known test recipient IGSID (`ig:user:{IGSID}`)
- Rollback owner available

### Marker

`IG-OAUTH-TEXT-CANARY-<YYYYMMDD>-<sequence>`

### Execution

1. Enable Stage 3 flags on **Railway** only
2. Redeploy Railway worker
3. Send **exactly one** text message with marker content
4. Do not send a second message until evidence complete
5. No image, no private reply, no caption tricks

### Evidence

| Item | Record (masked) |
| --- | --- |
| Tenant / conversation / message / job IDs | e.g. `d17bc402-…-eb1b1` |
| `contractVersion` | `1` |
| `mode` | `CONNECTION_BOUND` |
| `channelConnectionId` | Exact UUID (masked in public notes) |
| `authFamily` | `INSTAGRAM_BUSINESS_LOGIN` |
| `deliveryPath` | `DATABASE_ONLY` |
| `messageKind` | `TEXT` |
| Queue lifecycle | PENDING → PROCESSING → DONE |
| `retry_count` | `0` on success |
| `external_message_id` | Present |
| `last_error_preview` | Empty |
| Worker route | `INSTAGRAM_OAUTH_SEND` — no legacy adapter |
| Human confirmation | Recipient received exact marker |

---

## Image canary (IG-AUTH-2E.7)

Execute only after **text canary PASS** and `GO IMAGE CANARY`.

### Execution

1. Enable Stage 4 (add IMAGE=ON on Railway)
2. Redeploy Railway worker
3. Send **exactly one** image (JPEG or PNG, public HTTPS URL)
4. Marker: `IG-OAUTH-IMAGE-CANARY-<YYYYMMDD>-<sequence>`
5. No profile/avatar/source-post image; no caption; no sensitive URL in evidence

### Evidence

Same as text, plus: `messageKind=IMAGE`, image rendered correctly on recipient device, no signed URL/token leakage, no legacy fallback.

---

## Monitoring checklist

During any active window, monitor:

| Source | Watch for |
| --- | --- |
| Vercel API logs | Send errors; no Authorization/token leakage |
| Railway worker logs | `INSTAGRAM_OAUTH_SEND` vs `INSTAGRAM_SEND`; error codes |
| Supabase `queue_jobs` | Status, retry_count, stale PROCESSING |
| Supabase `outbox_events` | Relay failures |
| HubChat messages | `delivery_status`, `external_message_id` |
| Ops Runtime | Pending/stale/dead-letter vs baseline |
| Recipient Instagram | Human-visible delivery |

### Immediate rollback triggers

- Wrong tenant / connection / Professional Account
- Wrong recipient
- Legacy fallback on OAuth-bound job
- Duplicate delivery
- Token, ciphertext, or signed URL leak
- Raw provider body in logs
- Retry loop / stuck PROCESSING / DLQ spike
- Missing `external_message_id` after apparent success
- Provider contract mismatch
- Image not delivered correctly
- LINE / Facebook / legacy Instagram regression

---

## Pending / in-flight job rollback safety

From merged worker code (`failInstagramOAuthOutboundConfiguration`):

When `WORKER_ROUTING` (or text/image gate) is **OFF** and a `CONNECTION_BOUND` job is processed:

1. `messageRepository.markFailed` (terminal configuration)
2. `idempotency.markProcessed`
3. `TerminalOutboundDeliveryError` — **not retryable**, **no legacy fallback**

| Job state when flag disabled | Outcome |
| --- | --- |
| PENDING (not yet claimed) | Remains PENDING until worker processes → then terminal fail |
| PROCESSING | Completes current attempt → terminal fail or in-flight completion |
| Retryable requeue | Same binding; still fails closed if flags OFF |

### Rollback prerequisite

Before disabling `WORKER_ROUTING` or TEXT/IMAGE gates:

1. **Stop initiating new OAuth sends** (operator discipline + disable TEXT/IMAGE)
2. Inspect all OAuth-bound PENDING/PROCESSING jobs (masked IDs)
3. Wait for or safely resolve in-flight work
4. Reach **zero unsafe pending** OAuth-bound jobs (or explicitly accept terminal failure)
5. Only then disable WORKER_ROUTING → RUNTIME → FOUNDATION

**Never** convert OAuth-bound jobs to legacy. **Never** delete jobs without approved recovery.

---

## Runtime rollback procedure

| Step | Action |
| --- | --- |
| 1 | Stop initiating new OAuth sends |
| 2 | Identify OAuth-bound PENDING/PROCESSING jobs (masked IDs) |
| 3 | Resolve or wait for in-flight work |
| 4 | Disable TEXT and IMAGE on Railway |
| 5 | Confirm no unsafe OAuth jobs remain |
| 6 | Disable WORKER_ROUTING |
| 7 | Disable RUNTIME |
| 8 | Disable FOUNDATION |
| 9 | Redeploy Railway (and Vercel if flags changed there) |
| 10 | Legacy regression smoke |
| 11 | Capture post-rollback queue/outbox baseline |

---

## Database rollback principle

**Default:** Leave additive migration in place. Roll back through flags and deployment.

**DB rollback** is a separate approved incident action only when:

- Migration caused verified production incident
- Rollback SQL independently reviewed
- Function overload impact documented
- Data impact known
- Backward compatibility for remaining callers proven

Dropping the 16-arg overload while OAuth-bound rows exist in queue is **unsafe** without Agent A recovery plan.

---

## Evidence pack

Store under `evidence/ig-auth-2e-oauth-rollout-YYYY-MM-DD/`.

```markdown
# Approval
Approval phrase:
Operator:
Date/time (timezone):
Master SHA:
Migration SHA:
Vercel SHA:
Railway SHA:

# Production preflight (2E.5)
Migration status: NOT_APPLIED | ALREADY_APPLIED | PARTIALLY_APPLIED | UNKNOWN
RPC signatures: (count + identity tail summary)
RPC ambiguity: PASS | HOLD | UNKNOWN
Queue baseline: (counts only)
Flag states: (PRESENT_TRUE | PRESENT_FALSE | ABSENT per flag per platform)
Connection readiness: PASS | HOLD | DEFERRED
Rollback readiness: PASS | HOLD

# Migration/deploy (2E.6)
Migration result:
RPC after migration:
App deploy SHA:
Worker deploy SHA:
Legacy regression smoke: PASS | FAIL

# Text canary (2E.7)
Marker:
Masked message/job IDs:
Binding: contractVersion=1, mode, channelConnectionId (masked), authFamily, deliveryPath, messageKind
Queue lifecycle:
Retry count:
External message ID (masked):
Human confirmation: PASS | FAIL
No fallback: PASS | FAIL
No leak: PASS | FAIL

# Image canary (2E.7)
(same fields + image render confirmation)

# Decision
PASS | HOLD | ROLLBACK
Reason:
```

---

## GO / HOLD rubric

### READY TO REQUEST GO READ-ONLY PREFLIGHT

- This runbook complete and merged
- SQL templates verified against schema (`queue_jobs.payload_json`, topic `message.outbound.requested`)
- No write operations in preflight section

### READY TO REQUEST GO MIGRATION WINDOW

- Read-only preflight PASS with evidence
- Migration state known; RPC unambiguous
- Flags OFF/ABSENT; queue stable
- Exact OAuth connection ready
- Rollback safe; DB-first order agreed

### READY TO REQUEST GO TEXT CANARY

- Migration applied and verified
- App/worker deployed flags-OFF; legacy regression PASS
- Queue stable; no unexpected OAuth-bound jobs
- Stage 3 flags ready on Railway

### READY TO REQUEST GO IMAGE CANARY

- Text canary PASS
- Queue stable; no security/retry/duplicate issues

### HOLD (current)

- Any preflight item `UNKNOWN`
- RPC ambiguity unresolved
- Unexpected flag ON
- Stale backlog or malformed bindings
- Missing exact connection or recipient path
- Unsafe rollback with pending jobs

---

## Deferred execution

Not authorized by this document:

- Production migration execution
- Database/RPC/queue writes
- Feature-flag enablement
- Deployment or redeploy
- Live Meta text/image send
- Canary execution
- Private reply, legacy retirement, webhook/UI/refresh changes

---

## Scope confirmation

IG-AUTH-2E.4 controlled rollout runbook preparation only. No implementation, migration execution, flag changes, deployment, queue mutations, live Meta calls, or outbound sends.
