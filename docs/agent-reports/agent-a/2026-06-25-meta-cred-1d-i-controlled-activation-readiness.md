# META-CRED-1D-I — Controlled Activation Readiness Review

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-06-25 |
| Phase | META-CRED-1D-I (readiness review only — no activation execution) |
| Authorization | `GO META-CRED-1D-I CONTROLLED ACTIVATION READINESS REVIEW` |
| Master SHA | `120f7482b4210dde29e14b9c053ed1600db1f2f5` |
| Branch | `docs/meta-cred-1d-i-controlled-activation-readiness` |
| Commit SHA | `0b3d36f360bb28305d8f631b579895ca327e922e` |
| PR | [#291](https://github.com/ctarasan/HubChat/pull/291) |
| Prior migration evidence | META-CRED-1D-H CLOSED COMPLETE (PR #290) |

## Executive summary

Production deployment at `120f748…` includes the activation route (merged via PR #287 ancestry). Database baseline remains **zero META-CRED business rows** with both migrations **APPLIED**. One production tenant has a **READY Facebook** `channel_connection`; **no `INSTAGRAM` `channel_connection` exists** in production. Therefore the approved first one-shot scope is **FACEBOOK-only**; **dual-channel activation is HOLD** until an Instagram connection is provisioned and Page↔IG relationship is verified.

Secure operator token sourcing and feature-flag choreography are documented. **No real token, flag change, provider call, or credential write occurred in this task.**

**Decision: READY FOR META-CRED-1D-I-B INDEPENDENT ACTIVATION READINESS REVIEW** (FACEBOOK-only scope). **Dual-channel: HOLD — DUAL-CHANNEL TARGET IDENTITY NOT READY.**

---

## 1. Master sync

| Check | Result |
| --- | --- |
| `HEAD` | `120f7482b4210dde29e14b9c053ed1600db1f2f5` |
| `origin/master` | `120f7482b4210dde29e14b9c053ed1600db1f2f5` |
| Prefix | `120f748` |
| Tracked modifications | **NONE** |

---

## 2. Production deployment readiness

| Field | Value |
| --- | --- |
| Production application | `https://smartkorp-hub-chat.vercel.app` |
| Deployed production SHA | `120f7482b4210dde29e14b9c053ed1600db1f2f5` (GitHub Production deployment record UTC `2026-06-25T08:33:41Z`) |
| Route implementation present | **YES** — `app/api/channel-connect/meta/verify-and-activate/route.ts` on master; Vercel build lists `api/channel-connect/meta/verify-and-activate` |
| Activation flag name in code | `HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_API_ENABLED` |
| Activation flag production value | **ABSENT** (`vercel env ls production` — name not listed) |

| Check | Result |
| --- | --- |
| Route fail-closed while flag OFF | **YES** — returns 503 `META_ACTIVATION_DISABLED` before `requireAuth` / bootstrap |
| Flag check before provider/encryption/DB | **YES** |
| Startup requires META-CRED tables | **NO** |
| Production ENV changed during review | **NO** |

Supporting production env names (values not read): `META_APP_ID` SET, `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` SET, `FACEBOOK_APP_SECRET` SET.

---

## 3. Post-migration database baseline

Read-only probes UTC 2026-06-25:

| Probe | Result |
| --- | --- |
| `meta_page_credentials` rows | **0** |
| `meta_page_credential_bindings` rows | **0** |
| `meta_page_credential_activation_requests` rows | **0** |
| META-CRED migrations applied | **2** (`20260623120000`, `20260624120000`) |
| Pending migrations | **0** |
| Migration divergence | **NONE** |
| Activation RPC present | **YES** (per 1D-H post-execution evidence; unchanged) |
| service_role-only execute | **YES** (per 1D-H evidence) |
| Partial activation state | **NO** |
| Credential already activated | **NO** |

No ciphertext or token fields inspected.

---

## 4. Production target selection

### Candidate tenant (sanitized)

| Field | Value |
| --- | --- |
| Tenant suffix | `ba82…865f` |
| Facebook connection suffix | `507d…279d` |
| Facebook connection status | **READY** |
| Facebook Page identity (masked) | prefix `5418`, length **15** (aligns with prior approved production baseline `5418…len=15`) |
| Instagram connection | **NONE** in `channel_connections` for this tenant |
| All `INSTAGRAM` `channel_connections` (production) | **0 rows** |

### Facebook connection verification

| Check | Result |
| --- | --- |
| Belongs to target tenant | **YES** |
| Provider type FACEBOOK | **YES** |
| Connection READY / usable metadata | **YES** |
| Trusted Page identity known (sanitized) | **YES** — `5418…len=15` |
| Current Facebook runtime operational | **YES** (per prior production verification; queue/outbox idle) |
| Current credential source (no secret) | Legacy DB + Railway `FACEBOOK_PAGE_ACCESS_TOKEN` / `FACEBOOK_PAGE_ID` ENV names (operational path unchanged) |

### Instagram connection verification

| Check | Result |
| --- | --- |
| INSTAGRAM `channel_connection` for tenant | **ABSENT** |
| Page-to-Instagram relationship verifiable for binding | **NO** — no Instagram connection row to bind |
| Instagram runtime via legacy path | Operational per prior docs, but **not eligible for META-CRED binding without `channel_connections` row** |

### Required decision

```text
Requested activation channels (approved first one-shot):
FACEBOOK

Dual-channel (FACEBOOK + INSTAGRAM):
HOLD — DUAL-CHANNEL TARGET IDENTITY NOT READY
```

**Rationale:** Activation contract requires a distinct `instagramConnectionId` when `INSTAGRAM` is requested. Production has **zero** Instagram `channel_connection` rows. Do not silently choose dual-channel.

---

## 5. Credential-source readiness

### Preferred target credential

Long-lived Meta/Facebook **Page access token** for credential family `META_PAGE_FACEBOOK_LOGIN`, issued for the approved production Meta App (`META_APP_ID` on Vercel), capable of accessing Page `5418…len=15`.

### Secure supply procedure (future execution window)

| Item | Procedure |
| --- | --- |
| Authoritative source | Authorized operator generates or retrieves a **fresh long-lived Page token** via Meta Business Suite / Meta developer tools for the production SmartKorp app |
| Authorization | Designated operator only; no agent automation |
| Token vs legacy | Prefer **newly generated Page token** for first META-CRED activation; do not copy from logs, chat, git, or scripts |
| Entry at execution | Paste token **only** into the HTTPS request body field at call time via trusted operator UI/client; never commit |
| Clipboard hygiene | Clear clipboard after call; avoid screen recording; disable shell history for body content |
| Prohibited in review | No decrypt of stored legacy token; no `debug_token`; no Graph API calls; no PowerShell history capture |

```text
Secure real-token source available for execution: YES
(subject to operator obtaining fresh Page token during authorized window)
```

Plaintext retrieved during review: **NO**  
Real provider call during review: **NO**

---

## 6. App, scope and identity expectations

| Field | Expected |
| --- | --- |
| Meta App | Production SmartKorp app (`META_APP_ID` configured on Vercel) |
| Credential family | `META_PAGE_FACEBOOK_LOGIN` |
| Facebook Page | Trusted target `5418…len=15` bound to connection `507d…279d` |
| Instagram account | **N/A for FACEBOOK-only scope** |

### Centralized scope policy (code — not invented)

**Facebook required scopes** (`facebookOAuthScopes`): `pages_show_list`, `pages_messaging`, `pages_read_engagement`, `pages_manage_metadata`

**Facebook optional:** `business_management`, `pages_read_user_content`

**Instagram required (only if dual requested):** `instagram_basic`, `instagram_manage_messages`, `pages_show_list`, `pages_read_engagement`

**Facebook Page tasks:** `MESSAGING` required (`META_PAGE_REQUIRED_FACEBOOK_TASKS`)

Provider verification must validate: token validity, expected App ID, expiry fields, Page accessibility/identity, required tasks/scopes, optional IG relationship when requested, and reject incompatible Instagram Login token families.

---

## 7. Initial activation contract

Current META-CRED business tables: **0 rows** → initial create path.

| Field | Value |
| --- | --- |
| `credentialId` | **OMITTED** |
| `expectedCredentialVersion` | **0** (`META_PAGE_CREDENTIAL_INITIAL_VERSION`) |
| `requestedChannels` | `["FACEBOOK"]` |
| Expected committed version after success | **1** |
| Facebook binding | **Required** (1 row) |
| Instagram binding | **Not created** (not requested) |
| Channel READY claim | **NO** — outcome is pending cutover |
| Automatic legacy replacement | **NO** |

If any META-CRED business row appears before execution, **rerun readiness**.

---

## 8. Idempotency plan

| Rule | Detail |
| --- | --- |
| Generation | Operator generates **one** high-entropy key immediately before the activation call |
| Format | Opaque string, 1–128 chars (`Idempotency-Key` header) |
| Scope | Single exact tenant + channel set + `expectedCredentialVersion` + token intent |
| Storage | **Not** in git, evidence, chat, or scripts |
| Evidence | May record sanitized suffix/hash only after execution |
| Uncertain HTTP response | **Reuse** same key and identical request body |
| Changed request | **New** key required |
| Review task | **Do not** generate or store execution key |

---

## 9. Future activation request template (placeholders only)

```http
POST /api/channel-connect/meta/verify-and-activate
Host: smartkorp-hub-chat.vercel.app
Content-Type: application/json
Authorization: Bearer <ADMIN_SESSION_JWT>
Idempotency-Key: <EXECUTION_WINDOW_KEY>
```

```json
{
  "accessToken": "<REAL_TOKEN_ENTERED_SECURELY_AT_EXECUTION_TIME>",
  "facebookConnectionId": "<TARGET_FACEBOOK_CONNECTION_ID_507d…279d>",
  "requestedChannels": ["FACEBOOK"],
  "expectedCredentialVersion": 0
}
```

**Do not** store real UUIDs or tokens in runnable scripts. Operator substitutes full UUIDs only at execution time in a secure client.

---

## 10. Feature-flag execution choreography

### Before enablement

- [ ] Deployment SHA locked (`120f748…` or later reviewed SHA)
- [ ] Database baseline rows = 0
- [ ] Queue/outbox idle (0/0 at review)
- [ ] No active incident
- [ ] Target identities unchanged
- [ ] Secure token ready
- [ ] ADMIN session ready
- [ ] Idempotency key ready

### Enablement (separate authorization)

```text
HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_API_ENABLED=true
on Vercel Production only
Redeploy if platform requires env change to take effect
```

**Not performed in this review.**

### One-shot call

- Exactly **one** intended activation request
- **One** tenant (`ba82…865f`)
- **FACEBOOK-only** channel set unless Instagram connection is provisioned and readiness is rerun
- No rotation, no resolver cutover, no second token test

### Immediate disablement

Restore flag to **OFF / absent** after definitive response or stop condition; redeploy if required. Shortest practical window only.

---

## 11. Expected success behavior

| Field | Expected |
| --- | --- |
| HTTP status | **200** when `state = ACTIVATED_HEALTHY_PENDING_CUTOVER` |
| Response `state` | `ACTIVATED_HEALTHY_PENDING_CUTOVER` |
| `meta_page_credentials` | **1** row, `ACTIVE`, version **1** |
| `meta_page_credential_bindings` | **1** row (Facebook) |
| `meta_page_credential_activation_requests` | **1** completed request |
| Resolver cutover | **NO** |
| Channel READY claim | **NO** |

Post-commit health uses **stored encrypted credential** at committed version — not request token or legacy credential.

---

## 12. Health-failure behavior

Committed response may be `ACTIVATED_HEALTH_FAILED` (HTTP **202**).

| Meaning | Action |
| --- | --- |
| Credential/bindings may already be committed | **Stop** |
| Health did not pass | Disable flag; preserve rows |
| Manual deletion / SQL repair | **Prohibited** |
| Retry with different idempotency key | **Prohibited** after uncertain commit |
| Resolver cutover | **Prohibited** |
| False rollback claim | **Do not report rollback** |

---

## 13. Stop criteria

Do not begin or stop immediately when:

1. Master/deployment SHA changes without re-review
2. META-CRED business row baseline ≠ 0
3. Target connection identity changes
4. Dual-channel requested but Instagram connection absent or Page↔IG uncertain
5. Real token source not secure
6. Feature flag unexpectedly already enabled
7. Queue/outbox processing active or production incident
8. Provider verification, encryption, RPC, version/idempotency conflict
9. Post-commit health failure
10. Credential/binding counts differ from expected
11. Secret appears in logs or response

No ad hoc SQL repair or second-token attempt.

---

## 14. Post-activation verification plan (future execution task)

### Database (read-only)

- Row counts: 1 credential, 1 binding (Facebook-only)
- Family `META_PAGE_FACEBOOK_LOGIN`, status `ACTIVE`, version `1`
- Verified metadata present; ciphertext present (**never display**)
- Bindings synchronized to version `1`
- Activation request `COMPLETED`
- No duplicate active credential/binding; no cross-tenant rows

### Security

- No plaintext token in DB, logs, or response
- Idempotency response sanitized
- RPC execute grants unchanged (service_role only)

### Runtime

- Flag restored OFF/absent
- Resolver unchanged
- Facebook/Instagram/LINE legacy runtime unaffected
- Queue/outbox healthy
- No cutover

Agent B must review post-activation evidence before any resolver cutover gate.

---

## 15. Carry-forward notes

| Note | Blocking for FACEBOOK-only one-shot? |
| --- | --- |
| No live-Postgres atomicity integration test | **NO** — monitor first activation closely |
| Concurrent first idempotency insert race → generic error | **NO** — reuse key on uncertain response |
| `FAILED` activation-request enum unused | **NO** |
| `granted_scopes` normalization adapter-side | **NO** |
| `schema.sql` does not mirror RPC body | **NO** |

**Blocking for dual-channel:** **YES** — no Instagram `channel_connection` in production.

---

## Prohibited-action attestation

| Action | Executed |
| --- | --- |
| Feature flag enablement | NO |
| Production ENV change | NO |
| Real Meta token call | NO |
| Token decryption/extraction | NO |
| Activation API call | NO |
| Credential write | NO |
| Resolver cutover | NO |
| Database migration/repair | NO |
| Outbound test message | NO |

---

## META-CRED-1D-I CONTROLLED ACTIVATION READINESS RESULT

```text
META-CRED-1D-I CONTROLLED ACTIVATION READINESS RESULT

Master SHA: 120f7482b4210dde29e14b9c053ed1600db1f2f5
Deployed production SHA: 120f7482b4210dde29e14b9c053ed1600db1f2f5
Branch: docs/meta-cred-1d-i-controlled-activation-readiness
Commit SHA: _filled at commit_
PR: _filled at PR creation_

Production:
- Application: https://smartkorp-hub-chat.vercel.app
- Route deployed: YES
- Activation flag: OFF / ABSENT
- Provider/DB calls while OFF: NO

Database baseline:
- Applied migrations: 20260623120000, 20260624120000
- Pending migrations: NONE
- Credential rows: 0
- Binding rows: 0
- Activation-request rows: 0
- Partial state: NO

Target:
- Tenant sanitized identity: ba82…865f
- Facebook connection: 507d…279d (READY)
- Facebook Page identity: 5418…len=15
- Instagram connection: NONE
- Instagram identity: N/A (no connection row)
- Same tenant: N/A for dual
- Page-to-Instagram relationship: NOT READY for dual
- Requested channels: FACEBOOK (dual-channel HOLD)

Credential source:
- Source type: operator-supplied long-lived Page token (Meta authorized tools)
- Production App alignment: META_APP_ID configured
- Secure operator access: YES (procedure documented)
- Plaintext retrieved during review: NO
- Real provider call during review: NO
- Ready for execution: YES (FACEBOOK-only)

Activation contract:
- credentialId: OMITTED
- expectedCredentialVersion: 0
- Expected committed version: 1
- Idempotency procedure: documented
- Request template secret-safe: YES

Feature window:
- Enablement environment: Vercel Production only
- One-shot limit: one tenant, one token, FACEBOOK-only
- Immediate disablement: required
- Redeploy requirement: if Vercel requires for env change
- Flag changed during review: NO

Expected success:
- Response state: ACTIVATED_HEALTHY_PENDING_CUTOVER
- Credential rows: 1 ACTIVE v1
- Binding rows: 1 (Facebook)
- Activation-request rows: 1 completed
- READY claimed: NO
- Resolver cutover: NO

Failure posture:
- Provider failure: stop, flag off, no SQL repair
- Encryption failure: stop before commit
- RPC conflict: stop, independent review
- Health failure after commit: preserve rows, flag off, no manual delete
- Manual deletion/SQL repair: prohibited
- Retry/idempotency: reuse key only for identical uncertain retry

Operational readiness:
- Queue/outbox: 0/0 at review
- Channel runtime: operational (Facebook READY; legacy paths unchanged)
- Active incident: none
- Stop criteria complete: YES

Scope:
- Evidence only: YES
- Code/migration/config changed: NO
- Real token used: NO
- Credential written: NO
- Feature flag enabled: NO
- Resolver cutover: NO

Decision: READY FOR META-CRED-1D-I-B INDEPENDENT ACTIVATION READINESS REVIEW
(Dual-channel remains HOLD until INSTAGRAM channel_connection provisioned)

Recommended next gate: META-CRED-1D-I-B INDEPENDENT ACTIVATION READINESS REVIEW

Operational state: HOLD — FEATURE FLAG OFF; NO REAL CREDENTIAL ACTIVATION OR CUTOVER
```
