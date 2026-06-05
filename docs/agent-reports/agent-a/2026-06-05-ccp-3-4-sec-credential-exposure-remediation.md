# CCP-3.4-SEC — Credential Exposure Remediation Plan (Sanitized)

**Date:** 2026-06-05
**Operator:** Agent A
**Trigger:** Raw Railway CLI `variables` output accidentally pasted into chat (outside repo/docs)
**Related preflight:** [`2026-06-05-ccp-3-4-production-p1-p7-line-preflight.md`](./2026-06-05-ccp-3-4-production-p1-p7-line-preflight.md)
**Production domain:** `https://smartkorp-hub-chat.vercel.app`

---

## Summary

| Item | Status |
|------|--------|
| P1–P7 LINE production preflight | **PASS** (sanitized evidence) |
| Repo/docs evidence | **PASS** — no secrets recorded |
| Chat paste of raw Railway variables | **SECURITY GUARDRAIL FAIL** |
| Controlled LINE resolver flag-on planning | **PAUSED** |
| **Final decision** | **HOLD** until rotation + post-rotation smoke **PASS** |

This document is a **sanitized remediation and re-verification plan only**. It does **not** authorize enabling `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED`, credential migration `--execute`, `DB_ONLY`, or a controlled flag-on pilot.

---

## Guardrails (remediation window)

| Rule | Required |
|------|----------|
| Paste token/secret/env values into chat, docs, tickets, or git | **Forbidden** |
| Enable `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **Forbidden** |
| Run credential migration `--execute` | **Forbidden** (separate approved window) |
| Set `DB_ONLY` | **Forbidden** |
| Change `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` ad hoc | **Forbidden** — planned/manual rotation only (see §4) |
| Open controlled LINE resolver pilot | **Forbidden** until this plan closes |

Record only **status labels** in evidence: `ROTATED`, `REVOKED`, `READY`, `SENT`, `PASS`, `FAIL`, `present`, `absent`.

---

## 1. Exposure scope (assume worst case)

Treat the accidental Railway variables paste as potential exposure for **all production worker secrets present in that output**, including at minimum:

| Credential (name only) | Typical surfaces |
|------------------------|------------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Railway worker, Vercel (if present) |
| `LINE_CHANNEL_ACCESS_TOKEN` | Railway worker, Vercel |
| `LINE_CHANNEL_SECRET` | Railway worker, Vercel |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Railway worker, Vercel |
| `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` | Railway worker, Vercel (if present) |

**Do not** copy old or new values into this document.

---

## 2. Remediation checklist (per credential)

Complete in order. Update Railway **and** Vercel where both carry the same secret name.

### 2.1 `SUPABASE_SERVICE_ROLE_KEY`

| Step | Action | Evidence (metadata) |
|------|--------|---------------------|
| S1 | Supabase Dashboard → Project Settings → API → **rotate service role key** | Rotation ticket/time (no key value) |
| S2 | Update **Railway worker** variable name only | Deploy triggered: yes/no |
| S3 | Update **Vercel Production** if variable exists | Redeploy: yes/no |
| S4 | Revoke/retire old key in Supabase after deploy healthy | Old key status: **REVOKED** |
| S5 | Confirm worker + Vercel app still connect (no auth errors in logs) | Worker boot: **PASS** / **FAIL** |

### 2.2 `LINE_CHANNEL_ACCESS_TOKEN`

| Step | Action | Evidence (metadata) |
|------|--------|---------------------|
| L1 | LINE Developers Console → channel → **re-issue channel access token** | New token state: **ROTATED** (no value) |
| L2 | Update Railway + Vercel env **names only** | Deploy/restart: yes/no |
| L3 | Channel Settings → LINE → **Test connection** → expect **READY** | Status: **READY** / **FAIL** |
| L4 | Legacy outbound smoke (short text) → `delivery_status` **SENT** | **PASS** / **FAIL** |
| L5 | Revoke/disable prior token in LINE console if supported | Prior token: **REVOKED** / **N/A** |

### 2.3 `LINE_CHANNEL_SECRET`

| Step | Action | Evidence (metadata) |
|------|--------|---------------------|
| LS1 | LINE Developers Console → **re-issue channel secret** | State: **ROTATED** |
| LS2 | Update Railway + Vercel | Deploy: yes/no |
| LS3 | Update LINE webhook callback if console requires secret alignment | Webhook verify: **PASS** / **FAIL** |
| LS4 | LINE **inbound** smoke (customer → HubChat) | Ingress **PASS** / **FAIL** |
| LS5 | Disable prior secret in LINE console when safe | Prior: **REVOKED** / **N/A** |

### 2.4 `FACEBOOK_PAGE_ACCESS_TOKEN`

| Step | Action | Evidence (metadata) |
|------|--------|---------------------|
| F1 | Meta Developer / Business settings → **rotate page access token** | State: **ROTATED** |
| F2 | Update Railway + Vercel | Deploy: yes/no |
| F3 | Channel Settings → Facebook → **Test connection** | **READY** / **FAIL** |
| F4 | Facebook outbound or comment private-reply smoke (controlled test thread) | **SENT** / **FAIL** |
| F5 | Invalidate prior token in Meta when safe | Prior: **REVOKED** / **N/A** |

### 2.5 Other Meta tokens (if in paste scope)

| Name | Action |
|------|--------|
| `FACEBOOK_APP_SECRET` | Rotate in Meta app; update env; re-verify webhooks |
| `INSTAGRAM_APP_SECRET` | Rotate if Instagram Login webhooks affected; update env |

Record **ROTATED** / **PASS** only — no values.

---

## 3. Deployment order (recommended)

```text
1. Rotate in provider console (LINE / Meta / Supabase)
2. Update Railway worker env → redeploy/restart worker
3. Update Vercel Production env → redeploy web
4. Channel Settings test-connection per channel
5. Inbound + outbound smokes (§5)
6. Revoke old credentials at provider
7. Capture sanitized evidence row (§6)
```

**Pause** controlled LINE resolver flag-on planning throughout.

---

## 4. `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` (planned / manual only)

| Rule | Detail |
|------|--------|
| Do **not** rotate casually | Changing this key without re-encryption plan renders existing `channel_credentials` ciphertext unreadable |
| When required | Only if key was in exposed paste **and** security policy mandates rotation |
| Prerequisite | Agent A **re-encryption / migration runbook** in approved maintenance window |
| CCP-3.4 scope | **Out of scope** for automatic rotation in this SEC ticket unless security sign-off + execute window scheduled |
| Evidence | Record `PLANNED` / `DEFERRED` / `ROTATED_WITH_REENCRYPT` — never the key value |

If `channel_credentials` table has no production execute rows yet, defer encryption-key rotation unless explicitly required by security review.

---

## 5. Post-rotation production smoke checklist

All items must **PASS** (sanitized capture) before lifting **HOLD** for flag-on **planning** (not flag-on execution).

| # | Check | Pass criteria | Record |
|---|--------|---------------|--------|
| R1 | LINE inbound | Webhook accepted; message visible in Dashboard | **PASS** / **FAIL** |
| R2 | LINE outbound (legacy/env) | Send controlled text; `delivery_status` **SENT**; `external_message_id` **present** | **PASS** / **FAIL** |
| R3 | Facebook outbound / private reply | Controlled test thread; terminal delivery **SENT** or runbook-equivalent | **PASS** / **FAIL** / **N/A** |
| R4 | Instagram sanity | Inbound or outbound on canonical `/api/webhook/facebook` path if IG tokens rotated | **PASS** / **FAIL** / **N/A** |
| R5 | Channel Settings | LINE + affected channels **READY**; secrets write-only in UI | **PASS** / **FAIL** |
| R6 | Ops Runtime | No new stale **PROCESSING**; no new **DEAD_LETTER** delta vs pre-rotation baseline | **PASS** / **FAIL** |
| R7 | Worker logs | No crash loop; no new critical errors; leak scan: no token/secret/Bearer/`Authorization` substrings | **PASS** / **FAIL** |
| R8 | Resolver flag | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` still **ABSENT/OFF** | **PASS** |

**References:**

- [`docs/hubchat-webhook-smoke-runbook.md`](../../hubchat-webhook-smoke-runbook.md)
- [`docs/hubchat-channel-settings-runtime-confidence-runbook.md`](../../hubchat-channel-settings-runtime-confidence-runbook.md)
- [`docs/hubchat-worker-queue-observability-runbook.md`](../../hubchat-worker-queue-observability-runbook.md)
- [`docs/channel-connect-line-outbound-resolver-pilot-checklist.md`](../../channel-connect-line-outbound-resolver-pilot-checklist.md) (§1 preflight — re-run after SEC close)

---

## 6. Sanitized evidence row (operator fill-in)

| Field | Value |
|-------|--------|
| Remediation date (UTC) | |
| Operator | |
| `SUPABASE_SERVICE_ROLE_KEY` | **ROTATED** / pending |
| `LINE_CHANNEL_ACCESS_TOKEN` | **ROTATED** / pending |
| `LINE_CHANNEL_SECRET` | **ROTATED** / pending |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | **ROTATED** / pending |
| `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` | **DEFERRED** / **PLANNED** / **ROTATED_WITH_REENCRYPT** |
| Post-rotation smokes R1–R8 | all **PASS** / gaps listed |
| Chat/log leak re-check | **PASS** |
| SEC ticket / incident ref | (placeholder) |

---

## 7. Decision gates

| Gate | Status |
|------|--------|
| P1–P7 preflight | **PASS** (prior evidence) |
| SEC remediation complete | **PENDING** |
| Post-rotation smoke R1–R8 | **PENDING** |
| Controlled flag-on planning | **PAUSED** |
| **Current decision** | **HOLD** |

**Lift HOLD for planning only when:** §2 credentials **ROTATED**, old keys **REVOKED** where applicable, §5 smokes **PASS**, sanitized evidence row §6 complete, and security sign-off recorded.

**Still required before flag-on execution:** CCP-3.4 checklist §3 controlled window; resolver flag remains off until that window.

---

## 8. Verification (docs)

| Check | Result |
|-------|--------|
| Docs-only | PASS |
| No secrets in document | PASS |
