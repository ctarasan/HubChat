# CCP-3.4-SEC — Credential Exposure Remediation (Sanitized)

**Date:** 2026-06-05 (remediation completed — operator sanitized report)
**Operator:** Agent A + production operator
**Trigger:** Raw Railway CLI `variables` output accidentally pasted into chat (outside repo/docs)
**Related preflight:** [`2026-06-05-ccp-3-4-production-p1-p7-line-preflight.md`](./2026-06-05-ccp-3-4-production-p1-p7-line-preflight.md)
**Production domain:** `https://smartkorp-hub-chat.vercel.app`

---

## Summary

| Item | Status |
|------|--------|
| P1–P7 LINE production preflight | **PASS** (prior sanitized evidence) |
| Repo/docs evidence | **PASS** — no secrets recorded |
| Chat paste incident | **Remediated** — credentials rotated; old keys revoked where applicable |
| SEC remediation §2 | **DONE** |
| Post-rotation smoke R1–R8 | **PASS** (sanitized operator report) |
| Controlled LINE resolver **flag-on execution** | **Not approved** |
| **Final decision** | **READY FOR CONTROLLED FLAG-ON WINDOW PLANNING WITH SECURITY NOTE** |

**Security note:** `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` was **not** rotated in this SEC window (**PLANNED ONLY** — separate controlled re-encryption phase). Do **not** enable `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` or run credential `--execute` until a scheduled pilot window per checklist §3.

---

## Guardrails (unchanged)

| Rule | Status |
|------|--------|
| Paste secrets into chat/docs/git | **Forbidden** |
| Enable `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **Not done** |
| Run credential migration `--execute` | **Not done** |
| Set `DB_ONLY` | **Not done** |
| Change `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` ad hoc | **Not done** — **PLANNED ONLY** |
| Open controlled flag-on pilot | **Not approved** — planning readiness only |

---

## 2. Remediation completion (sanitized)

| Credential / action | Status | Notes |
|---------------------|--------|-------|
| Supabase service role / secret key remediation | **DONE** | New Supabase secret key created |
| Vercel Production update + redeploy | **DONE** | |
| Railway worker update + redeploy | **DONE** | |
| Old exposed Supabase key `default` | **REVOKED** / deleted | |
| Post-revocation Supabase smoke | **PASS** | |
| `LINE_CHANNEL_ACCESS_TOKEN` rotation | **DONE** | Vercel + Railway redeployed |
| `LINE_CHANNEL_SECRET` rotation | **DONE** | Vercel + Railway redeployed |
| LINE inbound smoke | **PASS** | |
| LINE outbound sanity smoke | **PASS** | |
| `FACEBOOK_PAGE_ACCESS_TOKEN` rotation | **DONE** | |
| Facebook smoke | **PASS** | |
| Old Facebook token | **REVOKED** / invalidated | |
| `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` | **PLANNED ONLY** | Not changed — direct replacement could break existing encrypted DB credentials; separate controlled re-encryption phase |
| Ops / log leak check | **PASS** | No token/secret/raw payload in recorded evidence |

No credential **values** recorded in this document.

---

## 5. Post-rotation smoke R1–R8 (operator result)

| # | Check | Result | Sanitized evidence |
|---|--------|--------|-------------------|
| **R1** | LINE inbound | **PASS** | Webhook path healthy post-rotation |
| **R2** | LINE outbound (legacy/env) | **PASS** | Sanity smoke **SENT** / runbook-equivalent |
| **R3** | Facebook outbound / private reply | **PASS** | Facebook smoke **PASS** |
| **R4** | Instagram sanity | **N/A** | IG-specific tokens not rotated in this SEC window |
| **R5** | Channel Settings READY | **PASS** | Implied by LINE/FB smokes; secrets write-only discipline maintained |
| **R6** | Ops Runtime clean | **PASS** | No new critical queue/outbox issue reported |
| **R7** | Worker logs / leak check | **PASS** | Ops/log leak check **PASS** |
| **R8** | Resolver flag OFF/absent | **PASS** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` not enabled |

---

## 6. Sanitized evidence row (completed)

| Field | Value |
|-------|--------|
| Remediation date (UTC) | 2026-06-05 |
| Operator | Production operator (sanitized report via Agent A) |
| `SUPABASE_SERVICE_ROLE_KEY` | **ROTATED**; old key `default` **REVOKED** |
| `LINE_CHANNEL_ACCESS_TOKEN` | **ROTATED** |
| `LINE_CHANNEL_SECRET` | **ROTATED** |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | **ROTATED**; old token **REVOKED** |
| `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` | **PLANNED ONLY** (separate phase) |
| Vercel / Railway redeploy | **DONE** |
| Post-rotation smokes R1–R8 | **PASS** (R4 **N/A**) |
| Chat/log leak re-check | **PASS** |
| SEC incident | Remediation **closed** (sanitized) |

---

## 7. Decision gates

| Gate | Status |
|------|--------|
| P1–P7 preflight | **PASS** |
| SEC remediation §2 | **DONE** |
| Post-rotation smoke R1–R8 | **PASS** |
| Encryption key rotation | **PLANNED ONLY** — tracked separately |
| Controlled flag-on **planning** | **READY** (with security note above) |
| Controlled flag-on **execution** | **Not approved** |
| **Current decision** | **READY FOR CONTROLLED FLAG-ON WINDOW PLANNING WITH SECURITY NOTE** |

**Next (planning only):** Schedule controlled window per [`docs/channel-connect-line-outbound-resolver-pilot-checklist.md`](../../channel-connect-line-outbound-resolver-pilot-checklist.md) §3. Resolver flag remains **off** until that window. Marketplace/Shopee/Lazada/TikTok remain **paused**.

---

## 8. Verification (docs)

| Check | Result |
|-------|--------|
| Docs-only | PASS |
| No secrets in document | PASS |
