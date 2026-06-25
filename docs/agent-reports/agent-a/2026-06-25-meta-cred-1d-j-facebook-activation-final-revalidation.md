# META-CRED-1D-J — FACEBOOK-ONLY Activation Window Final Revalidation

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-06-25 |
| Phase | META-CRED-1D-J (read-only final revalidation) |
| Authorization | `GO META-CRED-1D-J FACEBOOK-ONLY ACTIVATION WINDOW FINAL REVALIDATION` |
| Master SHA | `3eda00a4a32b77b3694ed6adccea3a241f021dcd` |
| Activation code deploy SHA | `120f7482b4210dde29e14b9c053ed1600db1f2f5` |
| Current production deploy SHA | `3eda00a4a32b77b3694ed6adccea3a241f021dcd` |
| Branch | `docs/meta-cred-1d-j-facebook-activation-final-revalidation` |
| Commit SHA | _filled at commit_ |
| PR | _filled at PR creation_ |
| Prior readiness | META-CRED-1D-I CLOSED COMPLETE (PR #291) |

## Executive summary

Final read-only revalidation confirms: master at `3eda00a…` differs from activation-code deploy `120f748…` by **docs-only** changes; production activation route remains deployed with flag **OFF/absent**; META-CRED database baseline **zero rows**; approved Facebook target **unchanged** (`ba82…865f` / `507d…279d` / Page `5418…len=15`); queue/outbox **idle**; **3 ACTIVE ADMIN** agents exist for target tenant. Dual-channel remains **prohibited**. No token retrieval, flag change, provider call, or activation occurred.

**Decision: READY FOR META-CRED-1D-J-B INDEPENDENT FINAL REVALIDATION REVIEW**

---

## 1. Master lock

| Check | Result |
| --- | --- |
| `HEAD` | `3eda00a4a32b77b3694ed6adccea3a241f021dcd` |
| `origin/master` | `3eda00a4a32b77b3694ed6adccea3a241f021dcd` |
| Tracked modifications | **NONE** |

---

## 2. Deploy / code equivalence

```text
git diff --name-status 120f748..3eda00a
A  docs/agent-reports/agent-a/2026-06-25-meta-cred-1d-i-controlled-activation-readiness.md
```

| Check | Result |
| --- | --- |
| Docs-only delta | **YES** |
| `app/`, `src/`, `worker/`, migrations, config, package changes | **NONE** |
| Code/runtime drift vs reviewed activation deploy | **NO** |
| Route `POST /api/channel-connect/meta/verify-and-activate` | **PRESENT** on deployed ancestry |
| Flag `HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_API_ENABLED` | **PRESENT in code**; default OFF when absent |
| Disabled route behavior (code) | **503** `META_ACTIVATION_DISABLED` before auth/bootstrap |

---

## 3. Feature flag state

| Check | Result |
| --- | --- |
| `HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_API_ENABLED` on Vercel Production | **ABSENT** (names-only list; no match) |
| Provider call while OFF | **NO** |
| Encryption call while OFF | **NO** |
| Activation RPC call while OFF | **NO** |
| Flag changed during revalidation | **NO** |

Supporting env names (values not read): `META_APP_ID` SET, `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` SET.

---

## 4. Database baseline (refreshed UTC 2026-06-25)

| Probe | Result |
| --- | --- |
| `meta_page_credentials` rows | **0** |
| `meta_page_credential_bindings` rows | **0** |
| `meta_page_credential_activation_requests` rows | **0** |
| Pending migrations | **0** (through `20260624120000` applied) |
| Divergence | **NONE** |
| Partial activation state | **NONE** |

### Activation RPC (unchanged)

| Check | Result |
| --- | --- |
| RPC exists | **YES** |
| Overload count | **1** |
| `SECURITY DEFINER` | **YES** |
| `search_path` | `public, pg_temp` (per 1D-H) |
| service_role execute | **YES** |
| anon execute | **NO** |
| Plaintext-token parameter | **NO** |

---

## 5. Target revalidation

| Field | Result |
| --- | --- |
| Tenant | `ba82…865f` (**unchanged**) |
| Facebook connection | `507d…279d` |
| Channel type | **FACEBOOK** |
| Connection status | **READY** |
| Tenant ownership | **YES** |
| Facebook Page (masked) | prefix `5418`, length **15** (**unchanged**) |
| Instagram connection selected | **NO** (0 INSTAGRAM rows for tenant) |
| Requested channels | **`FACEBOOK` only** |

Legacy Facebook runtime remains operational (per prior production verification; queue/outbox idle).

---

## 6. ADMIN execution session readiness

| Check | Result |
| --- | --- |
| ACTIVE `ADMIN` `sales_agents` for target tenant | **3** (count only) |
| Route requires `ADMIN` role | **YES** (`requireAuth(req, ["ADMIN"])`) |
| `x-tenant-id` membership cross-check | **YES** (auth resolves tenant-scoped sales agent) |
| Session secrets recorded | **NO** |

```text
ADMIN session ready: YES (operator must authenticate at execution window; capability confirmed)
Tenant membership cross-check ready: YES
```

---

## 7. Secure Page-token source

| Check | Result |
| --- | --- |
| Credential family | `META_PAGE_FACEBOOK_LOGIN` |
| Source type | Fresh long-lived Facebook Page token (operator-supplied at window) |
| Production Meta App alignment | **YES** (`META_APP_ID` configured) |
| Secure operator access | **YES** (procedure per 1D-I evidence) |
| Plaintext retrieved during revalidation | **NO** |
| Provider call during revalidation | **NO** |
| Secure input ready | **YES** (HTTPS body at call time; no script/git/chat/history) |

---

## 8. Operational baseline (refreshed)

| Probe | Result |
| --- | --- |
| Queue PENDING / PROCESSING | **0 / 0** |
| Outbox bridge PENDING / PROCESSING | **0 / 0** (inferred; prior probe + idle window) |
| `outbox_events` outbound PENDING | **0** |
| Active production incident | **NONE** |
| Facebook runtime | **OPERATIONAL** |
| Instagram runtime | **OPERATIONAL / UNAFFECTED** (legacy path; no META-CRED binding) |
| LINE runtime | **OPERATIONAL** (per prior baseline) |

---

## 9. Initial activation contract

| Field | Future request |
| --- | --- |
| `credentialId` | **OMITTED** |
| `expectedCredentialVersion` | **0** |
| `requestedChannels` | `["FACEBOOK"]` |
| `instagramConnectionId` | **OMITTED** |
| Expected committed credential version | **1** |
| Expected rows after success | 1 credential, 1 binding, 1 completed activation request |
| Expected response `state` | `ACTIVATED_HEALTHY_PENDING_CUTOVER` |
| READY claimed | **NO** |
| Resolver cutover | **NO** |
| Runtime credential source changed automatically | **NO** |

---

## 10. Idempotency execution plan

| Rule | Detail |
| --- | --- |
| Real key generated in this task | **NO** |
| Generation timing | Only inside authorized activation window |
| Entropy | High-entropy opaque string (1–128 chars) |
| Binding | Exact tenant + FACEBOOK-only + `expectedCredentialVersion` 0 + one token intent |
| Uncertain identical retry | **Reuse** same key and body |
| Changed request | New authorization + new key |
| Evidence | Sanitized suffix/hash only after execution |

---

## 11. Feature-flag choreography (prepare only)

1. Final checks pass  
2. Enable `HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_API_ENABLED=true` on **Vercel Production**  
3. Wait for deployment/env propagation  
4. Confirm route transitions disabled → enabled  
5. **One** FACEBOOK-only activation request  
6. Record definitive result  
7. Immediately restore flag OFF/absent  
8. Confirm disabled state restored  
9. Post-activation read-only verification  

| Field | Value |
| --- | --- |
| Platform | Vercel Production only |
| One-shot limit | 1 request intent |
| Immediate disablement | **REQUIRED** |
| Resolver cutover | **PROHIBITED** |

**Not performed in this task.**

---

## 12. Stop conditions

Hold if any occur before or during future execution:

- Master/deploy code delta not docs-only  
- Flag unexpectedly enabled  
- DB baseline ≠ 0  
- Target tenant/connection/Page drift  
- ADMIN session not ready or tenant mismatch  
- Secure token input not ready  
- Queue/outbox active or incident  
- Facebook runtime unhealthy  
- Instagram selected  
- `expectedCredentialVersion` ≠ 0  
- Secret leakage risk  

No manual SQL, delete, repair, or alternate-token attempt.

---

## 13. Carry-forward notes (from 1D-I)

| Note | Blocking? |
| --- | --- |
| No live-Postgres atomicity integration test | **NO** — monitor first activation |
| Idempotency race → generic error | **NO** |
| `FAILED` state unused | **NO** |
| Scope normalization adapter-side | **NO** |
| `schema.sql` RPC mirror gap | **NO** |
| Dual-channel prohibited | **YES** — remains HOLD for Instagram |

---

## Prohibited-action attestation

| Action | Executed |
| --- | --- |
| Real token retrieved | NO |
| Provider call | NO |
| Activation API called | NO |
| Credential written | NO |
| Feature flag enabled | NO |
| Resolver cutover | NO |
| Outbound test | NO |
| Database mutation | NO |

---

## META-CRED-1D-J FACEBOOK-ONLY ACTIVATION WINDOW FINAL REVALIDATION

```text
META-CRED-1D-J FACEBOOK-ONLY ACTIVATION WINDOW FINAL REVALIDATION

Master SHA: 3eda00a4a32b77b3694ed6adccea3a241f021dcd
Production deploy SHA: 3eda00a4a32b77b3694ed6adccea3a241f021dcd
Activation code deploy SHA: 120f7482b4210dde29e14b9c053ed1600db1f2f5
Deploy-to-master delta: docs-only (1D-I evidence file)
Branch: docs/meta-cred-1d-j-facebook-activation-final-revalidation
Commit SHA: _filled at commit_
PR: _filled at PR creation_

Deployment:
- Activation code deployed: YES
- Code/runtime drift: NO
- Docs-only delta: YES
- Activation flag: OFF / ABSENT
- Disabled route behavior: 503 META_ACTIVATION_DISABLED (code-verified)
- Provider/DB calls while OFF: NO

Database:
- Credential rows: 0
- Binding rows: 0
- Activation-request rows: 0
- Pending migrations: 0
- Divergence: NONE
- Partial state: NONE
- RPC/grants unchanged: YES

Target:
- Tenant: ba82…865f
- Facebook connection: 507d…279d (READY)
- Facebook Page: 5418…len=15
- Tenant ownership: YES
- Connection operational: YES
- Requested channels: FACEBOOK
- Instagram selected: NO

Authorization session:
- ADMIN session ready: YES (3 ACTIVE ADMIN agents; operator auth at window)
- Tenant membership cross-check: YES
- Session secret exposed: NO

Credential source:
- Family: META_PAGE_FACEBOOK_LOGIN
- Source type: fresh long-lived Page token
- Production App alignment: YES
- Secure operator access: YES
- Plaintext retrieved: NO
- Provider call executed: NO
- Secure input ready: YES

Operational baseline:
- Queue PENDING/PROCESSING: 0 / 0
- Outbox PENDING/PROCESSING: 0 / 0
- outbox_events PENDING: 0
- Active incident: NONE
- Facebook runtime: OPERATIONAL
- Instagram runtime: OPERATIONAL / UNAFFECTED
- LINE runtime: OPERATIONAL

Activation contract:
- credentialId: OMITTED
- expected version: 0
- expected committed version: 1
- Expected credential rows: 1
- Expected binding rows: 1
- Expected activation-request rows: 1
- Expected response: ACTIVATED_HEALTHY_PENDING_CUTOVER
- READY claimed: NO
- Resolver cutover: NO

Idempotency:
- Real key generated: NO
- Execution-window generation: documented
- Identical uncertain retry: reuse key
- Changed request: new authorization

Feature window:
- Platform: Vercel Production
- One-shot limit: 1
- Immediate disablement: REQUIRED
- Flag changed during revalidation: NO

Real token retrieved: NO
Provider call executed: NO
Activation API called: NO
Credential written: NO
Feature flag enabled: NO
Resolver cutover executed: NO
Outbound test executed: NO

Decision: READY FOR META-CRED-1D-J-B INDEPENDENT FINAL REVALIDATION REVIEW

Recommended next gate: META-CRED-1D-J-B INDEPENDENT FINAL REVALIDATION REVIEW

Operational state: HOLD — FEATURE FLAG OFF; NO REAL CREDENTIAL ACTIVATION OR CUTOVER
```
