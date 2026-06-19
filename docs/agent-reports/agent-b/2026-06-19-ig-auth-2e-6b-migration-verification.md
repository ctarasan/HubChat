# Agent B — IG-AUTH-2E.6B Independent Migration Window Verification

## Status

**HOLD** — Agent A IG-AUTH-2E.6A production migration evidence PR is not published on `origin`; independent production migration/RPC/flag verification could not be completed without Agent A evidence or operator read-only credentials.

## Metadata

| Field | Value |
| --- | --- |
| Agent | B |
| Deliverable | IG-AUTH-2E.6-B |
| Date | 2026-06-19 |
| Branch | `docs/ig-auth-2e-6b-migration-verification` |
| Base master SHA | `d588de7b48ea10d2dd36a7ec741219a38b758b60` (post PR #257) |
| Agent A PR | **Not found** — no `docs/ig-auth-2e-6a-*` branch or open PR on `origin` at verification time |
| Authorization reviewed | `GO MIGRATION WINDOW` (Agent A scope only; Agent B read-only) |
| Upstream pre-window evidence | PR #257 — [`2026-06-19-ig-auth-2e-5a-production-read-only-preflight.md`](../agent-a/2026-06-19-ig-auth-2e-5a-production-read-only-preflight.md) |

---

## Review result

```text
Review result: HOLD
Agent A PR: NOT FOUND (no remote branch or open PR for IG-AUTH-2E.6A)
Reviewed SHA: N/A — Agent A evidence not available
Production target: Supabase prod (masked dsky…hyx), Vercel prod, Railway worker prod
Approved migration: 20260621120000_ig_auth_2e3_outbound_instagram_binding.sql
Migration history: UNKNOWN (independent production query not performed)
RPC overload count: UNKNOWN
RPC signature: UNKNOWN
PostgREST state: UNKNOWN
DB-first order: NOT VERIFIABLE (no Agent A execution timeline)
Vercel SHA/state: UNKNOWN (CLI auth unavailable; app HTTP 200 only)
Railway SHA/state: UNKNOWN (CLI unavailable)
Flag states: UNKNOWN (post-window; pre-window all five ABSENT per PR #257)
Queue baseline: UNKNOWN (post-window; pre-window PENDING=0, PROCESSING=0 per PR #257)
OAuth-bound jobs: UNKNOWN (post-window; pre-window 0 per PR #257)
Malformed bindings: UNKNOWN (post-window; pre-window 0 per PR #257)
Application health: ACCESSIBLE (GET /login → 200)
Worker health: UNKNOWN
Provider calls: NOT VERIFIED (no Agent A attestation reviewed)
Outbound messages: NOT VERIFIED
Environment changes: NOT VERIFIED
Queue mutations: NOT VERIFIED
Security sanitization: PASS (this report only; Agent A diff not reviewed)
Blocking findings: Agent A evidence PR missing; production migration/RPC state not independently verified
Non-blocking notes: Approved migration artifact on master matches schema.sql; pre-window baseline from PR #257 acceptable
Recommendation: HOLD — publish Agent A 2E.6A evidence PR, then re-run Agent B verification
Scope confirmation: IG-AUTH-2E.6B independent read-only verification only. No migration execution by Agent B. No database/RPC/queue writes. No environment or feature-flag changes. No deployment. No provider calls or outbound messages. No canary. No merge performed.
```

---

## 1. Agent A evidence availability

| Check | Result |
| --- | --- |
| Remote branch `docs/ig-auth-2e-6a-*` | **Absent** |
| Open PR for 2E.6 / migration window | **None** |
| Docs under `docs/**` referencing 2E.6A execution | **None on master or origin** |
| Latest `git fetch origin` | Completed; no new 2E.6 branch |

Agent B cannot complete evidence diff review, security sanitization of Agent A output, or attestation cross-check until Agent A publishes the migration-window evidence PR.

---

## 2. Pre-window safety (from merged PR #257 — not re-queried)

Independent live re-query was not performed (no Supabase session; Agent B prohibition on risky duplicate production queries). Pre-window baseline from merged read-only evidence:

| Gate | PR #257 reported state | Agent B assessment |
| --- | --- | --- |
| Approved migration identified | `20260621120000_ig_auth_2e3_outbound_instagram_binding.sql` | Consistent with master |
| Pending migrations (expected one) | Exactly one relevant pending migration | Consistent with master file inventory |
| Queue PENDING | 0 | Acceptable pre-window baseline |
| Queue PROCESSING | 0 | Acceptable pre-window baseline |
| OAuth-bound PENDING/PROCESSING | 0 | Acceptable pre-window baseline |
| All five OAuth flags | ABSENT on Vercel + Railway | Acceptable pre-window baseline |

**Cannot confirm** Agent A captured an equivalent post-`GO MIGRATION WINDOW` pre-mutation snapshot in unpublished evidence.

---

## 3. Migration artifact identity (master code review)

| Check | Result |
| --- | --- |
| File | `supabase/migrations/20260621120000_ig_auth_2e3_outbound_instagram_binding.sql` |
| Git blob SHA | `abda64c5b1183b93812bcaa263152fb0eba00756` |
| Content | Additive `create or replace function create_outbound_message_with_outbox` with `p_instagram_credential_binding jsonb default null` |
| Destructive DDL | **None** |
| Backfill / data writes | **None** |
| `schema.sql` parity | **Match** — 16-argument signature including binding param |
| `SupabaseOutboundCommandRepository` | Always sends `p_instagram_credential_binding` at master |

This confirms the **approved migration artifact** on master; it does **not** prove production application.

---

## 4. Independent production verification (attempted / blocked)

| Method | Outcome |
| --- | --- |
| `schema_migrations` read-only SQL | **Not executed** — no direct Postgres session |
| PostgREST OpenAPI (`p_instagram_credential_binding`) | **Not executed** — no anon/service credentials in Agent B environment |
| `pg_proc` overload query | **Not executed** |
| `vercel inspect` / `railway` CLI | **Unavailable** — CLIs not installed; `npx vercel inspect` blocked on device login |
| Public HTTP health | `https://smartkorp-hub-chat.vercel.app/login` → **200** |

### Classification

| Item | Verdict |
| --- | --- |
| Migration history `20260621120000` | **UNKNOWN** |
| RPC signature | **UNKNOWN** |
| PostgREST binding param | **UNKNOWN** |
| Deploy SHA (Vercel/Railway) | **UNKNOWN** |
| Post-window flag states | **UNKNOWN** |
| Post-window queue aggregates | **UNKNOWN** |

Per review rubric: anything except `VERIFIED_APPLIED` for migration ⇒ **HOLD**.

---

## 5. DB-first sequence and deployment

Without Agent A execution evidence:

- Cannot verify migration completed **before** any deploy action.
- Cannot classify deploy as `SKIPPED_ALREADY_CURRENT` vs `EXECUTED_APPROVED_SHA`.
- Pre-2E.5 state documented **APP-before-DB UNSAFE** at deploy SHA `805e260` with migration NOT_APPLIED; post-2E.6 state unverified.

---

## 6. Live activity boundary

Agent A attestation not available for review. Agent B performed **no** provider calls, outbound sends, Test Connection, canary, flag changes, queue mutations, or credential changes.

---

## 7. Security sanitization (Agent B deliverable)

| Scan | Result |
| --- | --- |
| This file | No secrets, tokens, full UUIDs, payloads, or env dumps |
| Agent A evidence diff | **Not reviewed** (PR absent) |

---

## 8. Decision matrix

| Criterion | Status |
| --- | --- |
| Approved migration applied in production | **UNKNOWN** |
| RPC unambiguous post-migration | **UNKNOWN** |
| PostgREST schema updated | **UNKNOWN** |
| DB-first sequence respected | **NOT VERIFIED** |
| App/worker approved SHA healthy | **PARTIAL** (app HTTP 200 only) |
| OAuth flags OFF/ABSENT post-window | **UNKNOWN** |
| Queue stable / zero OAuth-bound jobs | **UNKNOWN** |
| No provider call / send / canary | **NOT VERIFIED** |
| Evidence sanitized | **N/A** (no Agent A PR) |

**Verdict: HOLD**

---

## 9. Required next steps

1. Agent A publishes IG-AUTH-2E.6A evidence PR (`docs/ig-auth-2e-6a-*`) with:
   - `GO MIGRATION WINDOW` authorization block
   - Pre-window queue/flag snapshot
   - `schema_migrations` and/or PostgREST + `pg_proc` post-migration evidence
   - Deploy action classification and timestamps
   - Post-migration aggregate queue counts
   - Sanitized flag inventory on Vercel + Railway
   - Explicit NONE attestations for provider calls, sends, canary, queue mutations
2. Agent B re-runs IG-AUTH-2E.6B against the latest remote SHA of that PR.
3. Maintainer merge of Agent A evidence only after Agent B PASS (or PASS WITH NOTES).

**Do not** authorize flag enablement, connection onboarding, or canary based on this HOLD report.

---

## 10. Scope confirmation

IG-AUTH-2E.6B independent read-only verification only. No migration execution by Agent B. No database/RPC/queue writes. No environment or feature-flag changes. No deployment. No provider calls or outbound messages. No canary. No merge performed. No GitHub PASS comment posted (Agent A PR absent).
