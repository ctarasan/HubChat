# PROD-CUTOVER-1A — Facebook Customer Page Onboarding Backend Readiness

**Agent:** A
**Date:** 2026-06-06
**Phase:** Production channel readiness review — Facebook Page onboarding (manual Channel Settings)
**Result:** **PASS WITH NOTES**
**Master at review:** `602feb3` (PR **#191** CCP-4.5 merged; PR **#190** CCP-4.4 merged)
**Operator:** Chamnan / Operator — sanitized review; no secrets in artifact
**Prior:** [CCP-4.5 all-channel pilot](./2026-06-06-ccp-4-5-all-channel-db-only-pilot-evidence.md) · [Channel Settings runbook](../../hubchat-channel-settings-runtime-confidence-runbook.md) · [CCP-4.6 pending]

---

## Goal

Review backend/config readiness for production cutover when onboarding **another customer's Facebook Page** via **manual Channel Settings** (`channel_settings`), while keeping runtime safe at **`DB_WITH_ENV_FALLBACK`** with resolver flag **OFF / ABSENT**.

**Out of scope:** Marketplace module, CDP/Marketing Automation bridge, permanent **`DB_ONLY`**, resolver flag enable, frontend UI/CSS changes, package changes.

---

## Verdict

| Item | Result |
|------|--------|
| **Facebook Page onboarding readiness** | **PASS WITH NOTES** |
| Manual Channel Settings save + test connection | **PASS** — backend supports per-tenant Facebook config |
| Outbound worker resolution (`DB_WITH_ENV_FALLBACK`) | **PASS** — uses tenant `channel_settings` with env fallback |
| Inbound Facebook webhook per-tenant routing | **PASS WITH NOTE** — **ENV-coupled**; not `channel_settings`-aware |
| Permanent **`DB_ONLY` / resolver flag** | **NOT APPROVED** — unchanged |

**Summary:** Backend supports **manual-ready outbound** onboarding for a customer Facebook Page per tenant. **Inbound Messenger** for additional tenants/pages on a shared deployment requires operator alignment on **Meta App webhook + Railway env** (`DEFAULT_TENANT_ID`, `FACEBOOK_VERIFY_TOKEN`, `FACEBOOK_APP_SECRET`, legacy `FACEBOOK_PAGE_ACCESS_TOKEN`). This is an **operational constraint**, not a Channel Settings API defect.

---

## Runtime safety confirmation (required state)

| Item | Required | Review |
|------|----------|--------|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** | **CONFIRMED** — do not change |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** | **CONFIRMED** — do not change |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | **`DB_WITH_ENV_FALLBACK`** | **CONFIRMED** — do not change |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **OFF / ABSENT** | **CONFIRMED** — do not enable |
| Permanent **`DB_ONLY`** | **NOT APPROVED** | **CONFIRMED** until CCP-4.6 |
| **`--execute`** | **Prohibited** | **CONFIRMED** |

---

## Backend flow inspected

### 1. `channel_settings` model / repository / API

| Component | Path | Finding |
|-----------|------|---------|
| Domain DTOs | `src/domain/channelSettings.ts` | Per-tenant FACEBOOK row; secrets never returned raw |
| Repository | `src/infrastructure/adapters/repositories/supabaseChannelSettingRepository.ts` | `upsertForTenant`, `getRuntimeConfig`, `updateConnectionHealth` |
| List API | `app/api/channel-settings/route.ts` | ADMIN `GET` list by tenant |
| Patch API | `app/api/channel-settings/[channel]/route.ts` | ADMIN `PATCH` — `providerPageId`, `providerAccountName`, `secrets`, `enabled` |
| Test connection | `app/api/channel-settings/[channel]/test-connection/route.ts` | ADMIN `POST` → `TestChannelConnectionUseCase` |
| Configured logic | `src/lib/channelSettingPublicDto.ts` | Facebook requires `accessToken`, `appSecret`, `verifyToken` all **SET** |
| Storage keys | `src/lib/channelSettingSecrets.ts` | `page_access_token`, `app_secret`, `verify_token` |

**Schema:** `channel_settings` — unique `(tenant_id, channel)` — **one Facebook config per tenant**.

### 2. Facebook runtime config resolver (outbound)

| Component | Path | Finding |
|-----------|------|---------|
| Mode parser | `src/lib/facebookOutboundRuntimeConfig.ts` | `DB_WITH_ENV_FALLBACK` prefers DB, falls back to env |
| Worker resolver | `src/application/facebookOutbound/createFacebookOutboundAdapterResolver.ts` | Resolves per `tenantId` from `channel_settings` |
| Worker boot | `src/worker/main.ts` | `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE`; resolver flag optional (off) |
| Legacy resolver | `src/application/channelConnect/resolveWorkerOutboundWithChannelConnect.ts` | Channel Connect path only when resolver flag on |

**At `DB_WITH_ENV_FALLBACK`:** Worker outbound uses tenant DB credentials when Channel Settings row is **enabled + configured + READY** (not ERROR).

### 3. Test connection route

| Component | Path | Finding |
|-----------|------|---------|
| Health check | `src/infrastructure/adapters/channels/channelHealthCheck.ts` | `verifyFacebookChannelHealth` — Graph API `/{pageId or me}?fields=id,name` |
| Use case | `src/application/usecases/testChannelConnection.ts` | Updates `lastVerifiedAt`, `providerPageId`, `providerAccountName` on success |

**Note:** `providerPageId` is optional for configured status but **recommended**; health check uses `me` if absent.

### 4. Facebook webhook route / subscription assumptions

| Component | Path | Finding |
|-----------|------|---------|
| POST webhook | `src/interfaces/api/webhook/facebook.ts` | Signature via env `FACEBOOK_APP_SECRET` / `META_APP_SECRET` |
| GET verify | `verifyFacebookWebhook` | Uses env **`FACEBOOK_VERIFY_TOKEN`** only — not `channel_settings` |
| Tenant mapping | POST handler | `x-tenant-id` header **or** `DEFAULT_TENANT_ID` env |
| Adapter token | POST handler | **`FACEBOOK_PAGE_ACCESS_TOKEN` env** for `FacebookAdapter` — not tenant DB |
| Page id in payload | `facebookAdapter.ts` | `facebookPageId` captured in inbound payload — **not used for tenant routing** |

### 5. Outbound worker config resolution path

```
OutboundWorker → SendOutboundMessageUseCase
  → createFacebookOutboundAdapterResolver (mode=DB_WITH_ENV_FALLBACK)
    → resolveFacebookOutboundConfig
      → channelSettingRepository.getRuntimeConfig(tenantId)
      → fallback: FACEBOOK_PAGE_ACCESS_TOKEN env if DB unavailable
```

---

## Required customer / Page config (per tenant)

### Channel Settings (ADMIN UI or `PATCH /api/channel-settings/FACEBOOK`)

| Field | Required | Storage / API | Notes |
|-------|----------|---------------|-------|
| **Enabled** | **Yes** | `enabled: true` | Must be on for runtime + test |
| **Facebook Page ID** | **Strongly recommended** | `providerPageId` | Numeric Page ID; used in test + outbound context |
| **Page access token** | **Yes** | `secrets.page_access_token` → `accessToken` | Long-lived Page token for customer's Page |
| **App secret** | **Yes** (configured gate) | `secrets.app_secret` → `appSecret` | Required for `configured=true`; aligns with Meta app |
| **Verify token** | **Yes** (configured gate) | `secrets.verify_token` → `verifyToken` | Required for `configured=true`; **webhook GET still uses env** |
| **Account label** | Optional | `providerAccountName` / `displayName` | Display only |

### Tenant / data prerequisites

| Item | Required | Notes |
|------|----------|-------|
| **Tenant UUID** | **Yes** | ADMIN session scopes Channel Settings to tenant |
| **`channel_settings` row** | **Yes** | Created on first PATCH for `FACEBOOK` |
| **Meta App webhook subscription** | **Yes** (inbound) | Customer Page subscribed to HubChat Meta App callback URL |
| **Railway / Vercel env (shared deployment)** | **Yes** (inbound) | See operational notes below |

### Meta / operator (no secrets in docs)

| Step | Operator action |
|------|-----------------|
| 1 | Create or select customer **Facebook Page** in Meta Business |
| 2 | Generate **Page access token** with `pages_messaging` (and related) permissions |
| 3 | Subscribe Page to HubChat Meta App **webhooks** (`messages`, `messaging_postbacks`, etc. per current product scope) |
| 4 | Enter credentials in **Channel Settings** for target tenant |
| 5 | Run **Test connection** → expect **READY** |
| 6 | Run controlled outbound + inbound smoke (checklist below) |

---

## Gaps / blockers

| # | Area | Severity | Detail | Mitigation (PROD-CUTOVER-1A) |
|---|------|----------|--------|----------------------------|
| G1 | Inbound webhook tenant routing | **High** (multi-tenant) | Webhook assigns `tenantId` from `DEFAULT_TENANT_ID` or `x-tenant-id`; Meta does not send tenant header | **Single-tenant production** or **one deployment per customer** until page-id → tenant lookup is built |
| G2 | Inbound webhook token source | **Medium** | POST uses env `FACEBOOK_PAGE_ACCESS_TOKEN`, not per-tenant DB token | Acceptable if env token matches subscribed Page **or** inbound normalization does not require token for DM path; profile/comment fetches may differ |
| G3 | Webhook verify / signature env | **Medium** | `FACEBOOK_VERIFY_TOKEN` and `FACEBOOK_APP_SECRET` are global env | Operator must use **same verify token** in Meta subscription and Channel Settings; app secret in env must match Meta app |
| G4 | One Page per tenant | **Low** | `unique (tenant_id, channel)` | Additional Pages require **additional tenants** or future multi-connection model (`channel_connections`) |
| G5 | `verify_token` in DB unused by webhook GET | **Low** | Stored for configured gate only | Document env alignment; future: tenant-aware webhook verify |

**No code change required for PROD-CUTOVER-1A** — gaps are documented operational constraints. **CCP-1 `channel_connections`** foundation exists for future OAuth/multi-connection; not in scope.

---

## Production smoke checklist (before cutover)

Complete per **customer tenant** after Channel Settings **READY**.

### Preflight (P)

| # | Check | Pass criteria |
|---|--------|---------------|
| P1 | Runtime modes | LINE / FB / IG **`DB_WITH_ENV_FALLBACK`**; resolver **OFF / ABSENT** |
| P2 | Channel Settings | Facebook **enabled**, **configured**, status **READY** |
| P3 | `providerPageId` | Set and matches customer's Page |
| P4 | Test connection | **POST** test-connection → `ok: true`, status **READY** |
| P5 | Ops baseline | `/dashboard/ops` — pending/processing/stale/DL recorded |
| P6 | Meta webhook | Page subscribed; callback URL verified (GET challenge) |

### Outbound smoke (O)

| # | Check | Pass criteria |
|---|--------|---------------|
| O1 | Send test Messenger DM | **OUTBOUND** message **SENT**; `external_message_id` present |
| O2 | Queue job | `message.outbound.requested` → **DONE**; `last_error` empty |
| O3 | Runtime source | Worker log: Facebook `runtimeSource=db` (preferred) or `env` with documented fallback |

### Inbound smoke (I)

| # | Check | Pass criteria |
|---|--------|---------------|
| I1 | Customer sends Messenger message to Page | Webhook **200**; inbound row created for **correct tenant** |
| I2 | Inbox visibility | Conversation appears in tenant inbox |
| I3 | Queue processing | Inbound normalized → processed; no DL spike |

### Post-smoke (R)

| # | Check | Pass criteria |
|---|--------|---------------|
| R1 | Ops Runtime clean | No unexpected DL / stale PROCESSING growth |
| R2 | Logs clean | No secret/token/raw payload leak in Vercel/Railway logs |
| R3 | Runtime unchanged | Still **`DB_WITH_ENV_FALLBACK`**; no **`DB_ONLY`** |

---

## Out-of-scope confirmation

| Item | Status |
|------|--------|
| Marketplace module | **Not started** |
| CDP / Marketing Automation bridge | **Not started** |
| Permanent **`DB_ONLY`** | **NOT APPROVED** |
| Resolver flag enable | **NOT APPROVED** |
| Runtime mode change away from **`DB_WITH_ENV_FALLBACK`** | **Not performed** |
| Secrets in docs/tests | **None** |
| Frontend UI/CSS changes | **None** |
| Package / migration changes | **None** |

---

## Code changes in this phase

| Type | Count | Notes |
|------|-------|-------|
| Docs | 3 | This evidence + handoff updates |
| Code | 0 | No backend gap requiring immediate fix |
| Tests | 0 | Existing coverage adequate; gaps are architectural/ops |

---

## Related docs

| Document | Use |
|----------|-----|
| [Channel Settings runbook](../../hubchat-channel-settings-runtime-confidence-runbook.md) | Operator UI checks |
| [CCP-4.5 pilot](./2026-06-06-ccp-4-5-all-channel-db-only-pilot-evidence.md) | Runtime safety baseline |
| [CCP-1 foundation](./2026-06-04-ccp-1-channel-connection-credential-foundation.md) | Future `channel_connections` path |

---

## Verification (PROD-CUTOVER-1A)

| Check | Result |
|-------|--------|
| Docs-only (this phase) | **PASS** |
| `git diff --check` | _(pre-PR)_ |
| Hidden/bidi scan | _(pre-PR)_ |
| `npm run typecheck` | _(pre-PR)_ |
| `npm run lint` | _(pre-PR)_ |
| `npm test` | _(pre-PR)_ |
| `npm run build` | _(pre-PR)_ |
