# Agent B — IG-AUTH-2E.4B Controlled Rollout, Canary, and Rollback Runbook Prep

## Status

**Ready for maintainer review** — operator runbook updated after PR #256 (2E.4A) merge. **No live action authorized.** Production recommendation remains **HOLD**.

## Metadata

| Field | Value |
| --- | --- |
| Agent | B |
| Deliverable | IG-AUTH-2E.4-B |
| Date | 2026-06-19 (updated post PR #256 merge) |
| Branch | `docs/ig-auth-2e-4b-controlled-rollout-runbook` |
| PR | [#255](https://github.com/ctarasan/HubChat/pull/255) — open (resumed) |
| Base master SHA | `c2a8761` (post PR #256 merge) |
| Upstream preflight | PR #256 — [`2026-06-19-ig-auth-2e-4a-production-readiness-preflight.md`](../agent-a/2026-06-19-ig-auth-2e-4a-production-readiness-preflight.md) |
| Primary runbook | [`ig-auth-2e-4-controlled-rollout-runbook.md`](../../instagram/ig-auth-2e-4-controlled-rollout-runbook.md) |
| Read-only SQL | [`ig-auth-2e-4-production-migration-preflight.md`](../../instagram/ig-auth-2e-4-production-migration-preflight.md) |
| Shared index updates | **Not updated** |

## Summary

IG-AUTH-2E.4B prepares the operator runbook for controlled Instagram OAuth outbound rollout after merged 2E.4A preflight (PR #256). The runbook covers read-only production preflight (2E.5), DB-first migration and flags-OFF deploy (2E.6), staged flag enablement, text-first then image-second canary (2E.7), monitoring, rollback, and sanitized evidence capture.

PR #256 is the **source of truth** for migration filename, RPC overload risk, DB-first ordering, flag inventory, rollback constraints, and current **HOLD** reasons. This runbook operationalizes those findings into phased approvals and checklists without authorizing execution.

---

## Existing branch/PR status

| Item | Value |
| --- | --- |
| Result | **C. Open PR exists** — PR #255 |
| Branch | `docs/ig-auth-2e-4b-controlled-rollout-runbook` |
| Action | Resumed branch; rebased on `c2a8761`; expanded runbook |

---

## Merged 2E.4A summary (PR #256)

| Topic | Finding |
| --- | --- |
| Migration file | `20260621120000_ig_auth_2e3_outbound_instagram_binding.sql` |
| RPC change | 16th param `p_instagram_credential_binding jsonb default null` |
| Overload risk | **Possible** — prior 15-arg signature may coexist; verify `pg_proc` in production |
| Migration state | **UNKNOWN** (not queried) |
| Queue baseline | **Not captured** |
| Deploy SHAs (read-only) | Vercel + Railway at `ad3b880` (pre-#256 merge snapshot) |
| OAuth flags (read-only names) | All five **ABSENT** on Vercel + Railway |
| DB-first rule | **Mandatory** — repository always passes binding param |
| Rollback | Flag OFF → terminal fail; no legacy fallback; drain pending jobs first |
| Recommendation | **HOLD** |

---

## Current HOLD reasons

Until authorized read-only production checks (2E.5) complete:

1. Production migration status not verified
2. RPC signature/overload not verified in production
3. Queue/outbox baseline not captured
4. Feature-flag states not re-verified at execution time
5. Exact OAuth connection readiness not verified
6. Rollback safety with pending/in-flight jobs not rehearsed

---

## Phase boundaries

| Phase | Scope |
| --- | --- |
| 2E.4 | Readiness + runbook (this PR) |
| 2E.5 | Authorized read-only preflight |
| 2E.6 | Migration + deploy flags-OFF |
| 2E.7 | Controlled text/image canary |
| Later | Extended monitoring, legacy retirement |

---

## Approval phrases

`GO READ-ONLY PREFLIGHT` | `GO MIGRATION WINDOW` | `GO DEPLOY FLAGS-OFF` | `GO TEXT CANARY` | `GO IMAGE CANARY` | `GO EXTENDED MONITORING`

Each phrase authorizes one phase only.

---

## Environment target matrix (code-derived)

| Flag | Railway | Vercel | Notes |
| --- | --- | --- | --- |
| FOUNDATION | **Required** (delivery) | Connect/test/resolver API | `instagramOAuthFoundationFlags.ts` |
| RUNTIME | **Required** (delivery) | Connect/test/resolver API | Same |
| WORKER_ROUTING | **Required** (delivery) | Not read on send path | `worker/main.ts` → `workerEnv: process.env` |
| OUTBOUND_TEXT | **Required** (text canary) | Not gating enqueue | `assertOAuthInstagramWorkerRoutingEnabled` |
| OUTBOUND_IMAGE | **Required** (image canary) | Not gating enqueue | Same |

Enqueue binding emission (`resolveInstagramOutboundEnqueueBinding`) is **not flag-gated** on API.

---

## Runbook contents (operator doc)

| Section | Covered |
| --- | --- |
| Read-only preflight checklist | Yes — references PR #256 SQL doc |
| Pre-migration GO gate | Yes |
| Migration/deploy sequence (12 steps) | Yes — DB-first blocking rule |
| Feature-flag stages 0–4 | Yes — Railway-primary |
| Legacy regression smoke | Yes |
| Text/image canary | Yes — markers, evidence, one-at-a-time |
| Monitoring + rollback triggers | Yes |
| Pending-job rollback safety | Yes — maps `failInstagramOAuthOutboundConfiguration` |
| Runtime rollback procedure | Yes — 11 steps |
| DB rollback principle | Yes — keep migration; flags first |
| Evidence pack template | Yes |
| GO/HOLD rubric | Yes |

---

## Current recommendation

| Decision | Value |
| --- | --- |
| Documentation | Suitable for merge (PR #255) |
| Production | **HOLD** until 2E.5 read-only preflight PASS |

---

## Potential conflicts with Agent A

| Area | Mitigation |
| --- | --- |
| 2E.5 preflight execution | Agent A runs SQL; this runbook provides checklist |
| RPC overload resolution | Agent A may publish PostgREST disambiguation steps |
| Deploy SHA drift | Re-capture SHAs at execution; do not assume `ad3b880` |
| Test-connection on Vercel | Optional pre-canary; not required for worker delivery flags |

No blocking implementation defects identified. No source changes in this branch.

---

## Scope confirmation

IG-AUTH-2E.4B controlled rollout/runbook preparation only. No implementation/source/runtime/test/schema/migration changes. No production migration execution. No database/RPC/queue writes. No environment or feature-flag changes. No deployment. No live Meta calls or outbound messages. No private reply, webhook, profile enrichment, OAuth UI, refresh scheduler, legacy retirement, or canary. No merge performed by Agent B.

## Verification

At commit: docs-only diff, `git diff --check`, hidden/bidi scan, secret scan.
