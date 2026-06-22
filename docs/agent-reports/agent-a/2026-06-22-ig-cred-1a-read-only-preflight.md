# IG-CRED-1A — Production Instagram Credential Recovery Read-only Preflight

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-06-22 |
| Phase | IG-CRED-1A (read-only diagnosis only) |
| Base commit | `8b1f2e61176afc9a5651061b9baa3e1858b5e6ff` |
| Production domain | `https://smartkorp-hub-chat.vercel.app` |
| IG-AUTH migration workstream | **CLOSED** |
| Additional migration operation | **NOT AUTHORIZED** |

## Executive summary

Production Instagram **Channel Settings** shows `Status: Error` because the **legacy `channel_settings` page access token** failed Meta Graph validation with **`OAuthException code=190`** (session expired **2026-06-16**). This predates the **2026-06-22** migration push and is **not** a migration/schema regression.

The affected tenant has **no** `channel_connections` row for `INSTAGRAM` and **no** `instagram_oauth_credentials` rows. Recovery is therefore on the **legacy channel-settings credential path**, not Instagram Business Login OAuth — even though OAuth connect/resolver code exists on `master`.

**Recommended next gate:** `HOLD — CREDENTIAL STATE AMBIGUOUS` until operators choose and document a single recovery lane (legacy token re-entry vs OAuth bootstrap cutover) and confirm whether Railway `DB_WITH_ENV_FALLBACK` is masking the expired DB token at outbound runtime.

---

## Phase 1 — Repository baseline

| Check | Result |
| --- | --- |
| `HEAD` | `8b1f2e61176afc9a5651061b9baa3e1858b5e6ff` |
| Tracked working tree | **clean** (untracked local artifacts only) |
| Code/runtime changes in this task | **none** |

---

## Phase 2 — Affected Instagram connection (sanitized)

Evidence sources: production UI smoke (IG-AUTH-2E.7E), read-only Supabase queries (`begin; set transaction read only; …; rollback;`), repository code trace.

| Attribute | Sanitized value |
| --- | --- |
| Tenant safe reference | `ba82…865f` |
| Channel connection safe reference | **none** — `channel_connections` where `provider = INSTAGRAM` → **0 rows** |
| Connection type | **Legacy `channel_settings`** row (`channel = INSTAGRAM`) |
| Provider | `INSTAGRAM` |
| UI status | **ERROR** (matches `resolveChannelStatus`: enabled + configured + `lastError` present) |
| Configured state | **Yes** — secret fingerprints show `access_token`, `app_secret`, `verify_token` **SET** (UI + `secret_fingerprint_json`) |
| Active/inactive | **enabled = true** |
| Provider page identity (masked) | prefix `5418…`, length **15** (Facebook Page ID linked to IG) |
| Last successful verification | `2026-06-16T08:02:19.324Z` |
| Last error time (row update) | `2026-06-22T03:41:53Z` (health metadata write only; error content unchanged) |
| Sanitized error category/code | **Meta OAuth token expired** — `OAuthException` **`code=190`**, message contains `Session has expired on … 16-Jun-26` |
| Token expiry timestamp | **2026-06-16** (from provider error text; no `token_expires_at` on legacy row) |
| Connection ownership/binding | Tenant-scoped `channel_settings` record; **no** `channel_connection_id`; **21** active `INSTAGRAM` conversations in inbox |

**Confirmation:** This is the same Instagram connection surfaced in Channel Settings during authenticated production smoke (ERROR badge, identical error family/date).

---

## Phase 3 — Credential source determination

### Code paths reviewed

| Area | File(s) |
| --- | --- |
| Channel Settings DTO/status | `src/lib/channelSettingPublicDto.ts` — `resolveChannelStatus`, `resolveChannelRuntimeConfig`, `resolveChannelRuntimeConfigForHealthCheck` |
| Test Connection use case | `src/application/usecases/testChannelConnection.ts` — legacy path + OAuth branch guard |
| Instagram health probe | `src/infrastructure/adapters/channels/channelHealthCheck.ts` — `verifyInstagramChannelHealth` (Graph `instagram_business_account` via page token) |
| Worker outbound resolver | `src/application/channelConnect/resolveWorkerOutboundWithChannelConnect.ts`, `src/lib/instagramOutboundRuntimeConfig.ts` |
| OAuth resolver (unused in prod) | `src/application/instagramOAuth/resolveInstagramConnectionCredential.ts` |
| OAuth connect | `src/application/instagramOAuth/instagramOAuthConnectService.ts`, `app/api/channel-connect/instagram/oauth/*/route.ts` |
| Enqueue binding | `src/application/instagramOAuth/resolveInstagramOutboundEnqueueBinding.ts` |
| OAuth-managed detection | `src/application/instagramOAuth/instagramOAuthRuntimeCredential.ts` |

### Answers

| Question | Answer |
| --- | --- |
| OAuth-managed connection | **NO** — zero `instagram_oauth_credentials`; `isOAuthManagedInstagramConnection` would be false |
| Legacy fallback allowed | **YES** — worker mode historically **`DB_WITH_ENV_FALLBACK`** (Railway); resolver flag **`HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED`** present on Vercel |
| Current resolver expected source | **Legacy DB `channel_settings.secret_json`** for health/test; worker may use **DB first then ENV** when `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK` |
| Actual observed source | **DB token used for Test Connection** (expired → ERROR persisted in `config_json.lastError`); **outbound runtime source unconfirmed** — DB runtime returns `null` when status `ERROR`, so **ENV fallback may still be active** |
| Source mismatch | **YES (potential)** — UI/health reflect **expired DB token**; outbound may still resolve **`FACEBOOK_PAGE_ACCESS_TOKEN` / env** under fallback mode without surfacing in Channel Settings |

**Classifier:** **C. Database with environment fallback** (legacy), not **A. Instagram OAuth credential table**.

---

## Phase 4 — Stored credential metadata (read-only, sanitized)

### `channel_settings` (legacy — **present**)

| Check | Result |
| --- | --- |
| Row exists for `INSTAGRAM` | **YES** (1 row) |
| `enabled` | **true** |
| `access_token` fingerprint | **SET** |
| `app_secret` fingerprint | **SET** |
| `verify_token` fingerprint | **SET** |
| `config_json.lastError` | present (expired-token message, truncated in audit) |
| `config_json.lastVerifiedAt` | `2026-06-16T08:02:19.324Z` |
| Encryption payload present | **YES** (`secret_json` server-side; not read/decrypted) |

### `channel_connections` / `channel_credentials` (CCP legacy)

| Check | Result |
| --- | --- |
| `channel_connections` INSTAGRAM rows | **0** |
| `channel_credentials` rows | **0** |

### `instagram_oauth_credentials` (OAuth table)

| Check | Result |
| --- | --- |
| Credential row exists | **NO** |
| Active rows | **0** |
| Expired active rows | **0** |
| Revoked rows | **0** |
| Duplicate active rows | **0** |
| Binding mismatch rows | **0** |
| Identity mismatch rows | **0** (N/A) |
| Credential version | **N/A** |
| Encryption payload present | **N/A** |

---

## Phase 5 — Token lifecycle capability (code review only; no refresh executed)

| Capability | Assessment |
| --- | --- |
| Automatic token refresh implemented | **NO** for legacy `channel_settings`; repository method `replaceAccessTokenAtomically` exists for **`instagram_oauth_credentials` only** (`supabaseInstagramOAuthCredentialRepository.ts`) with **zero production rows** |
| Refresh endpoint/process | **Not wired** for legacy; OAuth table supports atomic replace but no scheduler/cron |
| User interaction required | **YES** for renewal — Meta `code=190` requires re-authorization or new long-lived page token |
| Refresh token stored | **NO** (legacy stores page access token only; OAuth schema has no refresh-token column populated) |
| Long-lived exchange | **YES at OAuth connect** (`instagramBusinessLoginOAuth.ts` + `instagramOAuthConnectService.ts`) — not used in production |
| Expired token refresh technically possible without reconnect | **NO** — expired session cannot be refreshed in-place; need new token material |
| Refresh path atomic | **YES** for OAuth table writes (`replaceAccessTokenAtomically` + version guard) — irrelevant until OAuth row exists |
| Identity verification before activation | **YES** — `verifyProfessionalIdentity` + `assertTokenResponseIdentityMatchesMe` in connect service; test connection path validates `/me` when OAuth enabled |
| State/callback replay protection | **YES** — `instagram_oauth_states` hashed state + expiry (schema applied; no active OAuth flow observed) |
| Old credential superseded | OAuth `activate` on existing row; legacy uses in-place `secret_json` overwrite on save |
| Reconnect preserves `channel_connection_id` | OAuth start requires existing `channel_connection_id`; **none exists** — bootstrap write required before OAuth reconnect |
| Queue jobs bound to credential version | **0** `CONNECTION_BOUND` jobs; legacy binding only |

---

## Phase 6 — Feature flags and runtime (names only; values not dumped)

### Vercel Production (`vercel env ls production`, 2026-06-22)

| Flag | State |
| --- | --- |
| `HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED` | **ABSENT** |
| `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` | **ABSENT** |
| `HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED` | **ABSENT** |
| `HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED` | **ABSENT** |
| `HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED` | **ABSENT** (Vercel) |
| `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED` | **ABSENT** |
| `HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED` | **ABSENT** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **SET** (encrypted) |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | **ABSENT on Vercel**; **PRESENT on Railway worker** per IG-AUTH-2E.5 evidence (`DB_WITH_ENV_FALLBACK`) |
| `META_APP_ID` | **SET** (encrypted) |

### Attestations

| Check | Result |
| --- | --- |
| Reconnect would auto-enable outbound OAuth flags | **NO** — all delivery flags absent |
| Credential recovery separate from outbound cutover | **YES** |
| Flags changed by this task | **NO** |

---

## Phase 7 — Queue/outbox impact (aggregate counts)

Captured read-only after token expiry window (`>= 2026-06-16T00:00:00Z` where noted).

| Metric | Count |
| --- | --- |
| Pending jobs for affected tenant + INSTAGRAM outbound topic | **0** |
| Processing jobs | **0** |
| Retryable failed / dead-letter INSTAGRAM outbound since expiry | **2** |
| Jobs with `CONNECTION_BOUND` Instagram binding | **0** |
| Pending jobs with explicit `LEGACY` Instagram binding | **0** |
| Global queue PENDING | **0** |
| Global queue PROCESSING | **0** |
| Global queue DEAD_LETTER (all topics) | **45** (historical baseline; not a post-expiry spike) |

| Question | Answer |
| --- | --- |
| Jobs bound to expired OAuth credential version | **0** (no OAuth credentials) |
| Automatic retry risk after recovery | **LOW** — no pending/processing; historical DLQ failures unlikely to auto-retry without operator action |
| Worker pause recommended | **NO** for read-only preflight — queue quiescent; reassess if credential write or OAuth bootstrap is authorized |

---

## Phase 8 — Recovery options

### Option A — Controlled token refresh

| Dimension | Assessment |
| --- | --- |
| Feasibility | **Not recommended** — no production refresh executor for legacy path; OAuth refresh API unused (0 rows) |
| Required operator action | N/A |
| Data writes | Would require credential replace |
| Runtime impact | None without write |
| Rollback | N/A |
| Worker pause | Not required |
| Security risk | Low if implemented, but **not implemented for legacy** |
| Verdict | **Not recommended** |

### Option B — Controlled Instagram OAuth reconnect

| Dimension | Assessment |
| --- | --- |
| Feasibility | **Blocked for immediate execution** — API/service code exists, but **no `channel_connections` row**, **no Channel Settings OAuth UI**, **`HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED` absent**, and **legacy secrets still SET** (future OAuth would hit **ambiguous configuration** guards in `testChannelConnection.ts` / `resolveInstagramOutboundEnqueueBinding.ts`) |
| Required operator action | Bootstrap `channel_connections` INSTAGRAM, enable connect flag, clear or migrate legacy secrets, ADMIN OAuth, identity verification |
| Data writes | Multiple controlled writes + env flag change (out of IG-CRED-1A scope) |
| Runtime impact | Outbound remains on legacy/env until OAuth delivery flags explicitly enabled |
| Rollback | Disable connect flag; legacy remains if not cleared |
| Worker pause | Optional; queue currently idle |
| Security risk | Medium — must enforce identity-before-activation and avoid dual-source ambiguity |
| Verdict | **Not ready now**; viable as **planned cutover** after bootstrap gate |

### Option C — Hold and clarify lane first (includes immediate legacy token re-entry)

| Dimension | Assessment |
| --- | --- |
| Feasibility | **Recommended preflight outcome** — resolve **DB vs ENV fallback** ambiguity; choose either **controlled legacy page-token re-entry** (separate write gate) **or** **OAuth bootstrap cutover** (Option B prerequisites) |
| Required operator action | Document single source of truth; verify whether env token is still valid; do not run Test Connection if state mutation is prohibited |
| Data writes | Deferred to follow-on gate |
| Runtime impact | Minimal while queue idle |
| Rollback | Straightforward for legacy re-entry |
| Worker pause | Not required now |
| Security risk | Lowest if ambiguity removed before any write |
| Verdict | **Recommended**

---

## Phase 9 — Recommended next gate

```text
HOLD — CREDENTIAL STATE AMBIGUOUS
```

**Rationale (all required unknowns resolved except runtime dual-source):**

| Gate requirement | Status |
| --- | --- |
| Exact credential source | **Legacy DB** for UI/test; **possible ENV fallback** for worker outbound |
| Exact connection binding | **Legacy `channel_settings` only** (no `channel_connection_id`) |
| Identity match | **N/A** (no OAuth identity row) |
| Duplicate credential state | **NO duplicates** |
| Queue impact | **Low** (0 pending/processing) |
| Refresh technically possible | **NO** |
| Reconnect preserves intended connection | **N/A** — OAuth reconnect requires new bootstrap |

**Follow-on gates (not part of IG-CRED-1A):**

1. **IG-CRED-1B (proposed)** — `READY FOR CONTROLLED LEGACY TOKEN RE-ENTRY` after confirming env fallback health and obtaining new Meta page access token (ADMIN write; worker optional pause).
2. **IG-CRED-2A (proposed)** — `READY FOR CONTROLLED INSTAGRAM RECONNECT` after `channel_connections` bootstrap, connect flag enablement, legacy secret clearance, and OAuth UI/operator runbook sign-off.

---

## Prohibited-action attestation

| Action | Executed |
| --- | --- |
| OAuth reconnect | **NO** |
| Token refresh | **NO** |
| Credential rotation/write | **NO** |
| Test-connection write | **NO** |
| Outbound / inbound test | **NO** |
| Feature-flag / env change | **NO** |
| Migration / repair | **NO** |
| Remote production code change | **NO** |

---

## IG-CRED-1A READ-ONLY PREFLIGHT RESULT (summary block)

```text
IG-CRED-1A READ-ONLY PREFLIGHT RESULT

Master SHA: 8b1f2e61176afc9a5651061b9baa3e1858b5e6ff
Branch: docs/ig-cred-1a-read-only-preflight
Evidence SHA: (set at commit)
Evidence PR: (set after gh pr create)

Affected connection:
- Tenant safe reference: ba82…865f
- Channel connection safe reference: none (0 INSTAGRAM channel_connections rows)
- Provider identity safe reference: Facebook Page prefix 5418… len=15
- UI status: ERROR
- Token expiry: 2026-06-16 (Meta OAuthException code=190)
- Error category/code: OAuth token expired / code=190

Credential source:
- OAuth-managed: NO
- Expected resolver source: legacy channel_settings (+ worker DB_WITH_ENV_FALLBACK)
- Actual observed source: legacy DB for test/UI; ENV fallback possible for outbound
- Legacy fallback allowed: YES
- Source mismatch: YES (potential)

Credential metadata:
- Credential row exists: legacy YES / OAuth NO
- Active rows: 0 OAuth
- Expired active rows: 0 OAuth
- Revoked rows: 0
- Duplicate active rows: 0
- Binding mismatch rows: 0
- Identity mismatch rows: 0
- Credential version: N/A
- Encryption payload present: YES (legacy secret_json)

Lifecycle capability:
- Automatic refresh implemented: NO (legacy)
- Refresh material available: NO
- Expired token refresh technically possible: NO
- User interaction required: YES
- Reconnect flow implemented: YES (code) / NOT production-ready (no connection/UI/flag)
- Identity-before-activation enforced: YES (OAuth code path)
- Existing channel_connection_id preserved: N/A (none exists)
- Old credential superseded safely: OAuth yes; legacy in-place overwrite on save

Feature flags:
- OAuth text outbound: ABSENT
- OAuth image outbound: ABSENT
- Resolver/connect flags: CHANNEL_CONNECT_RESOLVER SET; OAuth flags ABSENT
- Flags changed: NO

Queue/outbox:
- Pending: 0
- Processing: 0
- Retryable failed: 0 pending; 2 dead-letter/failed since expiry
- Dead-letter since expiry: 2 (tenant INSTAGRAM outbound)
- Jobs bound to expired version: 0
- Automatic retry risk: LOW
- Worker pause recommended: NO (current idle state)

Recovery assessment:
- Controlled refresh: Not recommended
- Controlled reconnect: Not ready (bootstrap required)
- Code fix first / clarify lane: Recommended

Recommended path:
HOLD — CREDENTIAL STATE AMBIGUOUS

Remote state changed: NO
Credential write executed: NO
OAuth reconnect executed: NO
Token refresh executed: NO
Outbound smoke executed: NO
Migration operation executed: NO

Decision:
READY FOR AGENT B REVIEW

Operational state:
HOLD — NO CREDENTIAL WRITE OR RECONNECT
```
