# Agent B — IG-AUTH-2E.4B Controlled Rollout, Canary, and Rollback Runbook Prep

## Status

**Ready for maintainer review** — operator runbook and independent readiness checklist prepared. **No live action authorized.**

## Metadata

| Field | Value |
| --- | --- |
| Agent | B |
| Deliverable | IG-AUTH-2E.4-B |
| Date | 2026-06-19 |
| Branch | `docs/ig-auth-2e-4b-controlled-rollout-runbook` |
| Base master SHA | `ad3b880` (post PR #253 docs + PR #254 implementation) |
| Parallel work | Agent A IG-AUTH-2E.4 production readiness |
| Primary docs | [`ig-auth-2e-4-controlled-rollout-runbook.md`](../../instagram/ig-auth-2e-4-controlled-rollout-runbook.md) |
| Upstream | IG-AUTH-2E.3 worker/queue binding (#254), review prep (#253) |
| Shared index updates | **Not updated** — avoid parallel conflict with Agent A |

## Summary

IG-AUTH-2E.4B prepares operator documentation for **future** controlled Instagram OAuth outbound cutover: migration window, deploy verification, staged flag enablement, text-first then image-second canary, monitoring, rollback, and evidence capture. The runbook follows SmartKorp HubChat conventions from CCP-3 outbound rollout (explicit approval, one change at a time, evidence before/after, no hidden fallback, immediate rollback triggers, sanitized logs).

**IG-AUTH-2E.4 does not authorize live action.** Execution gates are split across 2E.5 (migration/deploy) and 2E.6 (live canary).

---

## Phase boundaries documented

| Phase | Scope | Live action in 2E.4 |
| --- | --- | --- |
| 2E.4 | Readiness + runbook | **No** |
| 2E.5 | Migration + deploy preflight execution | Deferred |
| 2E.6 | Controlled live text/image canary | Deferred |
| Later | Extended monitoring, legacy retirement | Deferred |

---

## Master baseline (post 2E.3)

| Merge | Content |
| --- | --- |
| #254 | Versioned persisted OAuth queue binding; worker OAuth text/image routing |
| #253 | IG-AUTH-2E.3-B worker/queue security review prep |
| #252 / #250 | OAuth DM image/text delivery foundations |

Merged implementation controls (code on master):

- `contractVersion: 1`, `CONNECTION_BOUND` binding persisted via RPC
- Exact `channel_connection_id` from conversation at enqueue
- Deterministic worker routing; no OAuth→legacy fallback
- `HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED` default OFF
- Additive migration: `20260621120000_ig_auth_2e3_outbound_instagram_binding.sql`

All OAuth outbound flags remain default OFF in production until separate approval.

---

## Pre-migration GO gate (checklist summary)

Documented in operator runbook §Pre-migration GO gate. All must pass; any failure → **HOLD**:

- PR #253/#254 merged; A/B synced master
- Agent A migration preflight PASS (2E.5 — not yet executed)
- Production migration state known
- No RPC overload ambiguity
- DB backup/recovery confirmed
- OAuth flags OFF/ABSENT
- Outbound queue baseline acceptable
- No unexpected OAuth-bound jobs
- Exact OAuth test connection + recipient identified
- Operator and rollback owner available

---

## Safe deployment sequence

Documented eight-step sequence:

1. Capture baseline
2. Apply additive DB migration
3. Verify RPC/schema
4. Deploy Vercel (flags OFF)
5. Deploy Railway worker (flags OFF)
6. Legacy regression smoke (LINE/Facebook/Instagram)
7. Confirm no unexpected OAuth-bound jobs
8. Stop — separate GO CANARY approval

**Deploy order rule:** Do not deploy builds requiring new RPC before migration verified (unless Agent A documents compatible ordering).

---

## Feature-flag sequencing

Five flags documented with staged plan (future execution):

| Stage | Railway | Expected behavior |
| --- | --- | --- |
| 0 | All OFF | Legacy only; OAuth-bound jobs fail closed at worker |
| 1 | FOUNDATION ON | No delivery change |
| 2 | + RUNTIME ON | No delivery change |
| 3 | + WORKER + TEXT ON; IMAGE OFF | Text canary only |
| 4 | + IMAGE ON | Image canary after text PASS |

### Environment targets (code-derived)

| Flag | Railway worker | Vercel API |
| --- | --- | --- |
| `HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED` | **Required for OAuth delivery** | OAuth connect/test/resolver API |
| `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` | **Required for OAuth delivery** | OAuth connect/test/resolver API |
| `HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED` | **Required for OAuth delivery** | Not used on worker send path |
| `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED` | **Required for text canary** | Not gating send enqueue |
| `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED` | **Required for image canary** | Not gating send enqueue |

**Operator-critical note:** OAuth binding emission at enqueue is DB-driven and **not gated by outbound flags on the API**. OAuth-managed conversations can produce CONNECTION_BOUND jobs while worker flags are OFF; worker fails closed (terminal, no legacy fallback). Avoid unintended OAuth-managed sends before Stage 3.

Re-verify with Agent A 2E.5 preflight before live execution.

---

## Text canary checklist

- One approved OAuth connection + known IGSID recipient
- Marker: `IG-OAUTH-TEXT-CANARY-<date>-<sequence>`
- One text message; no image/private reply
- Evidence: masked IDs, binding fields, queue lifecycle, `external_message_id`, human confirmation, no legacy adapter evidence

---

## Image canary checklist

- Only after text PASS + GO CANARY IMAGE
- One JPEG/PNG via public HTTPS URL
- Marker: `IG-OAUTH-IMAGE-CANARY-<date>-<sequence>`
- Evidence: binding, queue lifecycle, external_message_id, human image confirmation, no URL/token leakage

---

## Monitoring checklist

Sources: Vercel API logs, Railway worker logs, Supabase queue/outbox, HubChat message state, Ops Runtime, recipient Instagram.

Watch for: wrong connection, legacy adapter on OAuth job, duplicate delivery, retry loops, stale PROCESSING, dead letter growth, missing external_message_id, secret leakage.

---

## Rollback triggers and procedure

Immediate triggers documented (wrong recipient, legacy fallback, duplicate send, leak, regression, etc.).

Rollback order: stop new OAuth sends → inspect pending/processing → resolve in-flight → disable TEXT/IMAGE → WORKER_ROUTING → RUNTIME → FOUNDATION → redeploy → legacy verify → post-rollback baseline.

Prohibitions: no OAuth→legacy job conversion, no unapproved job deletion, no migration drop first, no reflexive credential deletion.

---

## DB rollback principle

Default: **leave additive migration in place**; rollback via flags/deploy.

DB rollback only as separate approved operation when migration caused confirmed incident with reviewed SQL and data impact analysis.

---

## Evidence pack

Full template in operator runbook §Evidence pack — approval, migration, flags, baseline, text/image canary, security checks, PASS/HOLD/ROLLBACK decision. Masked identifiers only.

---

## GO/HOLD rubric

| Decision | Criteria |
| --- | --- |
| **READY TO SCHEDULE MIGRATION WINDOW** | Agent A preflight PASS; flags OFF; queue safe; rollback executable; canary connection ready |
| **READY TO REQUEST GO CANARY** | Migration verified; deploy with flags OFF; legacy smoke PASS; stable baseline; Stage 3 ready |
| **HOLD** | Unknown migration state; RPC ambiguity; bad flag state; backlog; missing connection; unsafe rollback |

---

## Potential conflicts with Agent A

| Area | Risk | Mitigation |
| --- | --- | --- |
| Migration preflight details | Agent A may refine RPC verification steps | Cross-link Agent A 2E.4/2E.5 report when published |
| Deploy ordering | Edge case if API SHA requires RPC before migration | Runbook defers to Agent A preflight PASS |
| Flag placement | Env var wiring could change | Re-verify at 2E.5 execution; doc cites current code paths |
| Test-connection flag on Vercel | Separate from five outbound flags | Agent A to confirm pre-canary test-connection needs |
| Shared LATEST pointers | Both agents | B skips LATEST updates |

---

## Independent readiness checklist location

Full operator checklists embedded in [`ig-auth-2e-4-controlled-rollout-runbook.md`](../../instagram/ig-auth-2e-4-controlled-rollout-runbook.md):

- Pre-migration GO gate (§Pre-migration GO gate)
- Deployment sequence (§Deployment sequence)
- Flag sequence (§Flag sequence)
- Text/image canary (§Text canary, §Image canary)
- Monitoring (§Monitoring checklist)
- Rollback (§Rollback triggers, §Rollback procedure)
- Evidence pack (§Evidence pack)
- GO/HOLD rubric (§GO/HOLD rubric)

---

## Recommendation

**Approve docs PR for maintainer merge** after verification scans pass. Agent A should cross-link this runbook from IG-AUTH-2E.4 production readiness deliverable when ready.

No blocking issues identified in docs-only scope.

---

## Scope confirmation

IG-AUTH-2E.4B controlled rollout/runbook preparation only. No implementation/source/runtime/test/schema/migration changes. No production migration execution. No environment or feature-flag changes. No deployment. No queue mutations. No live Meta calls or outbound sends. No private reply, webhook, profile enrichment, OAuth UI, refresh scheduler, legacy retirement, or canary. No merge performed by Agent B.

## Verification

At commit: `git diff --check`, docs-only diff, hidden/bidi scan, secret scan.
