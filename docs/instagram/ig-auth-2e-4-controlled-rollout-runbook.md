# IG-AUTH-2E.4 Controlled Rollout Runbook

Operator runbook for **future approved execution** of Instagram OAuth outbound worker/queue cutover (IG-AUTH-2E.3 foundation on master). Companion prep: [`2026-06-19-ig-auth-2e-4b-controlled-rollout-runbook.md`](../agent-reports/agent-b/2026-06-19-ig-auth-2e-4b-controlled-rollout-runbook.md).

**Production domain:** `https://smartkorp-hub-chat.vercel.app`

> **This document does not authorize live action.** IG-AUTH-2E.4 is readiness and runbook only. Migration execution, deployment, flag enablement, and live Meta sends require separate explicit operator GO in IG-AUTH-2E.5 / 2E.6.

**Never record secrets.** Use env var **names**, masked UUIDs, and sanitized log field names only.

---

## Scope and prohibitions

### In scope (when separately approved)

- Additive DB migration for OAuth outbound binding RPC
- Application and worker deploy verification with flags OFF
- Staged feature-flag enablement on approved platforms
- Text-first canary, then image-second canary
- Monitoring, evidence capture, rollback

### Out of scope for IG-AUTH-2E.4 (this runbook prep)

- Executing any production step described here
- Private reply OAuth (IG-AUTH-2F)
- OAuth UI changes
- Webhook / profile enrichment
- Refresh scheduler (IG-AUTH-2H)
- Legacy Instagram retirement (IG-AUTH-2I)
- Tenant-wide or unscoped flag enablement

### Hard prohibitions during any future window

- No OAuth-bound job conversion to legacy adapter
- No queue job deletion without approved recovery procedure
- No reflexive credential rotation/deletion as first rollback step
- No dropping additive migration as first rollback action
- No hidden fallback to ENV Page token for OAuth-bound jobs
- No simultaneous multi-flag flip without stage verification

---

## Phase boundaries

| Phase | Scope | Live action |
| --- | --- | --- |
| **IG-AUTH-2E.4** | Readiness, runbook, GO/HOLD rubric, evidence templates | **No** |
| **IG-AUTH-2E.5** | Approved production migration + deploy preflight execution | Separate operator GO |
| **IG-AUTH-2E.6** | Approved controlled live text/image canary | Separate operator GO CANARY |
| **Later** | Extended monitoring, expanded allowlist, legacy retirement | Separate reviews |

---

## Roles and approvals

| Role | Responsibility |
| --- | --- |
| **Release owner** | Schedules window, records evidence pack, final GO/HOLD |
| **Migration owner** | Agent A or designated DBA — migration apply/verify |
| **Deploy owner** | Vercel + Railway deploy coordination |
| **Rollback owner** | Executes rollback sequence; available during entire window |
| **Canary operator** | Sends approved test messages; confirms recipient-side delivery |
| **Agent B reviewer** | Independent readiness checklist (docs only in 2E.4) |

### SmartKorp HubChat operator conventions

- Explicit written operator approval before each stage
- One change at a time; verify before next stage
- Evidence before and after every step
- No hidden fallback paths
- Immediate rollback on any trigger in §Rollback triggers
- Sanitized screenshots/logs only (masked IDs, no tokens, no signed URL query strings)

---

## Pre-migration GO gate

All items must pass before scheduling a migration window. Any failure → **HOLD**.

| # | Check | Pass criteria |
| --- | --- | --- |
| P1 | Implementation merged | PR #253 and PR #254 on master |
| P2 | Agent sync | Agent A and Agent B on same master SHA |
| P3 | Agent A migration preflight | **PASS** (Agent A 2E.5 evidence) |
| P4 | Production migration state | Known — migration **not applied** or **already applied** (document which) |
| P5 | RPC signature unambiguous | `create_outbound_message_with_outbox` overload confirmed; no caller ambiguity |
| P6 | DB backup / recovery | Backup path confirmed; restore owner identified |
| P7 | OAuth outbound flags | All five flags **OFF or ABSENT** on Railway worker and Vercel (see §Environment targets) |
| P8 | Outbound queue baseline | Ops Runtime acceptable: pending/processing/stale/dead-letter recorded |
| P9 | Unexpected OAuth-bound jobs | Zero unexpected `instagramCredentialBinding` in live queue/outbox (or documented HOLD plan) |
| P10 | Canary connection | One approved OAuth-managed connection identified with exact `channel_connection_id` |
| P11 | Test recipient | Known IGSID conversation (`ig:user:{IGSID}`) identified; human confirmation path agreed |
| P12 | Personnel | Operator + rollback owner available for full window |

**Migration file (code reference):** `supabase/migrations/20260621120000_ig_auth_2e3_outbound_instagram_binding.sql`

**Additive change:** optional parameter `p_instagram_credential_binding jsonb default null` on RPC `create_outbound_message_with_outbox`.

---

## Deployment sequence

Execute only after **Pre-migration GO gate** and separate **GO MIGRATION** approval.

| Step | Action | Verification | Stop if |
| --- | --- | --- | --- |
| 1 | **Capture baseline** | Ops Runtime counts; flag state snapshot; master/Vercel/Railway SHAs | Baseline not recorded |
| 2 | **Apply additive DB migration** | Migration owner applies SQL in approved window | Agent A preflight not PASS |
| 3 | **Verify RPC/schema** | RPC accepts null binding (legacy callers); test call or Agent A verification script | Signature mismatch or legacy caller break |
| 4 | **Deploy Vercel app/API** | Same approved SHA; **all OAuth flags OFF/ABSENT** | Deploy before DB if Agent A confirms RPC incompatibility on old schema |
| 5 | **Deploy Railway worker** | Same approved SHA; **all OAuth flags OFF/ABSENT** | Worker deploy fails health check |
| 6 | **Regression smoke — legacy** | LINE text; Facebook Messenger; legacy Instagram DM text (Page token path) | Any regression |
| 7 | **Confirm no unexpected OAuth jobs** | Queue/outbox scan: no surprise CONNECTION_BOUND payloads | Unexpected OAuth-bound backlog without plan |
| 8 | **Stop — request GO CANARY** | Do not enable delivery flags without separate approval | — |

### Deploy order rule

**Do not deploy application/worker builds that require the new RPC parameter until the additive migration is applied and verified**, unless Agent A documents backward-compatible deploy ordering for the target SHA.

Default safe order: **DB migration → verify RPC → deploy API → deploy worker → legacy smoke**.

---

## Environment targets (flag placement)

Derived from code — do not assume without verifying at execution time.

| Flag | Railway worker | Vercel API | Effect when ON |
| --- | --- | --- | --- |
| `HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED` | **Required for OAuth delivery** | Used by OAuth connect/test/resolver API routes | Enables OAuth foundation gates |
| `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` | **Required for OAuth delivery** | Used by OAuth connect/test/resolver API routes | Enables OAuth runtime/resolver gates |
| `HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED` | **Required for OAuth delivery** | Not read on outbound worker path | Enables worker OAuth route selection |
| `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED` | **Required for text canary** | Not read on send enqueue path | Enables OAuth text provider call |
| `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED` | **Required for image canary** | Not read on send enqueue path | Enables OAuth image provider call |

### Critical operator notes

1. **Outbound delivery flags are evaluated on the Railway worker** (`SendOutboundMessageUseCase` uses `workerEnv: process.env`).
2. **OAuth binding emission at enqueue is DB-driven and not gated by OAuth outbound flags** on the API. With flags OFF, OAuth-managed conversations can still produce CONNECTION_BOUND jobs that **fail closed at the worker** (terminal configuration — no legacy fallback). Minimize test sends from OAuth-managed conversations until Stage 3 unless intentionally testing fail-closed behavior.
3. **Vercel flags** matter for OAuth connect/test-connection API behavior, not for worker delivery. Keep Vercel OAuth flags OFF during worker canary unless Agent A directs otherwise for pre-canary test-connection checks.
4. Re-verify flag placement against Agent A 2E.5 preflight before any live change — do not rely on this doc alone if code moved.

---

## Flag sequence (future execution)

All stages require redeploy only if the platform requires env var changes to take effect. Record env state after each stage.

| Stage | Railway worker flags | Vercel flags (default) | Expected delivery behavior |
| --- | --- | --- | --- |
| **0 — Baseline** | All OFF/ABSENT | All OFF/ABSENT | Legacy Instagram only; OAuth-bound jobs fail closed at worker if any exist |
| **1 — Foundation** | FOUNDATION=ON; others OFF | OFF (unless Agent A directs test API) | No OAuth provider delivery |
| **2 — Runtime** | FOUNDATION+RUNTIME=ON; WORKER/TEXT/IMAGE OFF | OFF | No OAuth provider delivery |
| **3 — Text canary** | FOUNDATION+RUNTIME+WORKER+TEXT=ON; IMAGE OFF | OFF | Single approved OAuth text send only |
| **4 — Image canary** | Add IMAGE=ON (TEXT remains ON) | OFF | Single approved OAuth image send only after text PASS |

### Stage verification between steps

After Stage 1 and 2: confirm legacy LINE/Facebook/Instagram smokes still PASS; Ops Runtime stable; no unexpected OAuth provider calls in worker logs.

After Stage 3: complete text canary evidence pack before Stage 4.

**Never enable IMAGE before text canary PASS.**

---

## Text canary (IG-AUTH-2E.6 — future)

Execute only after migration applied, deploy verified, legacy regression PASS, and **GO CANARY TEXT** approval.

### Preconditions

- One approved OAuth-managed `channel_connection_id`
- Conversation has non-null `channel_connection_id` matching approved connection
- `providerThreadType` = `INSTAGRAM_DM` (not comment/private reply)
- Recipient IGSID known from `channelThreadId` (`ig:user:{IGSID}`)
- Stage 3 flags active on Railway worker only

### Send protocol

| Field | Value |
| --- | --- |
| Messages | **One text message only** |
| Marker | `IG-OAUTH-TEXT-CANARY-<YYYY-MM-DD>-<sequence>` |
| Content | Marker string only (no PII beyond test plan) |
| Media | None |
| Private reply | **Forbidden** |

### Evidence to capture

| Item | Record (masked) |
| --- | --- |
| Conversation ID | First 8…last 4 |
| Message ID | First 8…last 4 |
| Outbox / queue job ID | First 8…last 4 |
| Binding | `contractVersion=1`, `mode=CONNECTION_BOUND`, exact `channelConnectionId`, `authFamily=INSTAGRAM_BUSINESS_LOGIN`, `deliveryPath=DATABASE_ONLY`, `messageKind=TEXT` |
| Queue lifecycle | PENDING → PROCESSING → DONE |
| Retry count | Must be 0 for success case |
| `external_message_id` | Present after success |
| `last_error_preview` | Empty on success |
| Worker route | `routeUsed=INSTAGRAM_OAUTH_SEND`; **no** legacy adapter log evidence |
| Human confirmation | Recipient received exact marker in Instagram DM |

---

## Image canary (IG-AUTH-2E.6 — future)

Execute only after **text canary PASS** and **GO CANARY IMAGE** approval.

### Preconditions

- Same approved connection and recipient as text canary (or explicitly documented alternate approved pair)
- Stage 4 flags: IMAGE ON, TEXT ON, WORKER+FOUNDATION+RUNTIME ON

### Send protocol

| Field | Value |
| --- | --- |
| Messages | **One image only** |
| Marker | `IG-OAUTH-IMAGE-CANARY-<YYYY-MM-DD>-<sequence>` |
| Media | One supported JPEG or PNG |
| URL | Public HTTPS URL; HubChat-validated mime/size |
| Exclusions | No profile/avatar/source-post image; no sensitive signed URL in evidence |
| Caption | None unless explicitly supported and approved |

### Evidence to capture

Same as text canary, plus:

| Item | Record |
| --- | --- |
| `messageKind` | IMAGE |
| Image rendered correctly | Human confirmation on recipient device |
| URL/token leakage | None in logs, Ops, or screenshots |
| Retry/error | None on success path |

---

## Monitoring checklist

During any future canary window, monitor continuously:

| Source | What to check |
| --- | --- |
| Vercel API logs | Send API errors; no token/Authorization leakage |
| Railway worker logs | Route used (`INSTAGRAM_OAUTH_SEND` vs `INSTAGRAM_SEND`); error codes; no raw provider body |
| Supabase `queue_jobs` | Status, retry_count, last_error, stale PROCESSING |
| Supabase `outbox_events` | Relay failures; payload binding shape |
| HubChat messages | `delivery_status`, `external_message_id` |
| Ops Runtime | `/dashboard/ops` or `GET /api/ops/runtime` |
| Recipient Instagram | Human-visible delivery |

### Look for (immediate investigation)

- Wrong connection or Professional Account
- Legacy adapter invocation for OAuth-bound job
- Repeated delivery / duplicate messages
- Retry loop or climbing retry_count
- Stuck PROCESSING beyond lease threshold
- DEAD_LETTER increase
- Missing `external_message_id` after apparent success
- Raw token, signed URL query, or provider body in logs or `last_error_preview`

---

## Rollback triggers

Initiate rollback immediately if any occur:

| Trigger | Severity |
| --- | --- |
| Wrong recipient | Critical |
| Wrong Professional Account | Critical |
| Legacy fallback on OAuth-bound job | Critical |
| Duplicate delivery | Critical |
| Token or signed URL leak in logs/UI | Critical |
| Unexpected tenant/connection binding | Critical |
| Repeated retries on canary job | High |
| Queue backlog or stale PROCESSING growth | High |
| Provider response contract mismatch | High |
| Image delivered incorrectly | High |
| Regression on LINE / Facebook / legacy Instagram | Critical |
| Operator or rollback owner unavailable | Hold / rollback |

---

## Rollback procedure

Align with Agent A 2E.5 analysis if published. Default safe order:

| Step | Action |
| --- | --- |
| R1 | **Stop initiating new OAuth sends** — disable TEXT and IMAGE on Railway worker |
| R2 | **Inspect OAuth-bound pending/processing jobs** — record IDs (masked); do not delete |
| R3 | **Wait for or safely resolve in-flight job** — per terminal guard policy; no legacy conversion |
| R4 | **Disable TEXT/IMAGE** — confirm no new OAuth provider calls |
| R5 | **Disable WORKER_ROUTING** — only when no unsafe pending OAuth-bound jobs remain |
| R6 | **Disable RUNTIME** | |
| R7 | **Disable FOUNDATION** | |
| R8 | **Redeploy** — Railway worker (and Vercel only if flags were changed there) |
| R9 | **Verify legacy channels** — LINE, Facebook, legacy Instagram smokes |
| R10 | **Capture post-rollback queue baseline** — Ops Runtime snapshot |

### Rollback prohibitions

- Do not convert OAuth-bound jobs to legacy adapter path
- Do not delete queue jobs without approved recovery procedure
- Do not drop additive migration as first action
- Do not rotate/delete credentials reflexively

---

## Migration rollback principle

**Default:** Leave additive DB migration in place. Roll back runtime behavior through flags and deploy.

**DB rollback** is a separate approved operation only when:

- Migration itself caused confirmed production incident
- Rollback SQL reviewed and tested
- Data impact documented
- RPC compatibility for remaining callers proven

Removing `p_instagram_credential_binding` support while OAuth-bound rows exist in queue is **unsafe** without explicit Agent A recovery plan.

---

## Evidence pack

Copy into `evidence/ig-auth-2e-6-oauth-canary-YYYY-MM-DD/`.

```markdown
## Approval
Operator:
Date/time (timezone):
Master SHA:
Vercel SHA:
Railway SHA:
GO type: MIGRATION / DEPLOY / CANARY TEXT / CANARY IMAGE / ROLLBACK

## Migration
Migration filename: 20260621120000_ig_auth_2e3_outbound_instagram_binding.sql
Before RPC signature: (Agent A recorded)
After RPC signature: (Agent A recorded)
Result: PASS / HOLD / FAIL

## Flags (names only — record ON/OFF/ABSENT)
Railway — Foundation:
Railway — Runtime:
Railway — Worker routing:
Railway — Text:
Railway — Image:
Vercel — Foundation:
Vercel — Runtime:

## Baseline (counts)
Outbound pending:
Outbound processing:
Outbound stale processing:
Outbound dead letter:
Outbox pending:
Outbox dead letter:

## Text canary
Job ID (masked):
Binding contractVersion / mode / channelConnectionId (masked) / authFamily / deliveryPath / messageKind:
Queue result:
External message ID (masked):
Human confirmation: PASS / FAIL
Legacy adapter evidence: NONE REQUIRED

## Image canary
Job ID (masked):
Binding fields:
Queue result:
External message ID (masked):
Human confirmation: PASS / FAIL
Image render: PASS / FAIL

## Security
No token leak: PASS / FAIL
No signed URL leak: PASS / FAIL
No raw provider body: PASS / FAIL
No OAuth→legacy fallback: PASS / FAIL

## Decision
PASS / HOLD / ROLLBACK
Notes:
```

---

## GO/HOLD rubric

### READY TO SCHEDULE MIGRATION WINDOW

- Agent A migration preflight **PASS**
- Migration and RPC semantics unambiguous
- All OAuth outbound flags OFF/ABSENT
- Queue baseline safe
- Deployment order fixed and documented
- Rollback steps executable with identified owners
- Exact canary connection and recipient identified

### READY TO REQUEST GO CANARY (text)

- Migration applied and verified
- App and worker deployed at approved SHA with flags OFF (then staged per §Flag sequence)
- Legacy regression smoke **PASS**
- Queue baseline stable
- No unexpected OAuth-bound jobs without plan
- Stage 3 flags ready on Railway only
- Human recipient confirmation path confirmed

### HOLD

- Unknown migration state
- RPC overload or signature ambiguity
- Unexpected flag state on worker or API
- Stale queue backlog or growing dead letter
- Missing exact `channel_connection_id` on canary conversation
- Rollback path unsafe or owner unavailable
- No human recipient confirmation path
- Agent A preflight not PASS

---

## Deferred execution

The following remain **explicitly deferred** until separate phase approval:

- Production migration execution (2E.5)
- Production feature-flag enablement
- Live Meta text/image delivery (2E.6)
- Production canary GO
- Deployment execution
- Extended monitoring window sign-off
- Legacy Instagram retirement
- Private reply OAuth cutover
- OAuth UI / webhook / profile enrichment
- Refresh scheduler
- Historical `channel_connection_id` backfill

---

## Related documents

| Document | Purpose |
| --- | --- |
| [`ig-auth-2e-3-worker-queue-review-checklist.md`](ig-auth-2e-3-worker-queue-review-checklist.md) | Implementation review criteria (merged) |
| [`ig-auth-2e-3b-worker-routing-review-prep.md`](../agent-reports/agent-b/2026-06-19-ig-auth-2e-3b-worker-routing-review-prep.md) | Binding and routing reference |
| [`channel-connect-outbound-rollout-operator-smoke.md`](../channel-connect-outbound-rollout-operator-smoke.md) | CCP-3 rollout conventions |
| [`channel-connect-outbound-rollout-evidence-pack.md`](../channel-connect-outbound-rollout-evidence-pack.md) | Evidence pack pattern |
| [`hubchat-worker-queue-observability-runbook.md`](../hubchat-worker-queue-observability-runbook.md) | Ops Runtime monitoring |
| [`ig-oauth-rollout-rollback-plan.md`](ig-oauth-rollout-rollback-plan.md) | Early architecture-phase plan (superseded for 2E.x flag names — use this runbook for 2E.4+) |

---

## Scope confirmation

IG-AUTH-2E.4 controlled rollout runbook preparation only. No implementation, migration execution, flag changes, deployment, queue mutations, live Meta calls, or outbound sends. No merge performed by document author.
