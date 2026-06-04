# CCP-0 — Channel Connect Platform: Backend/Runtime Audit & Target Architecture

## Metadata

| Field | Value |
|---|---|
| Agent | A |
| Date | 2026-06-04 |
| Phase | CCP-0 (audit + architecture plan only) |
| Status | Complete — docs only, no runtime behavior change |
| Marketplace | Paused (out of scope) |

## Goal

Establish the long-term foundation for a **fully automatic Channel Setup Wizard** (LINE OA, Facebook Page, Instagram) where:

- Customers do **not** edit Vercel/Railway ENV for channel credentials.
- **Customer/channel credentials** live in DB (encrypted, tenant-scoped).
- **ENV** retains only SmartKorp **platform/system-level** secrets.
- LINE target flow: **LINE Module Channel / partner attach** (not LINE Login).
- Facebook/Instagram target flow: **SmartKorp Meta App + OAuth**.

This document is **plan-only**. No Setup Wizard UI, no `DB_ONLY` cutover, no production behavior change in CCP-0.

---

## 1. Current code audit (as implemented)

### 1.1 Shared architecture today

```
┌─────────────────┐     ENV secrets        ┌──────────────────────┐
│ Vercel (API)    │ ─────────────────────► │ Inbound webhooks     │
│ /api/webhook/*  │     DEFAULT_TENANT_ID  │ signature + adapter  │
└─────────────────┘                        └──────────────────────┘

┌─────────────────┐     ENV + optional DB  ┌──────────────────────┐
│ Railway Worker  │ ─────────────────────► │ Outbound send        │
│ OutboundWorker  │     HUBCHAT_*_MODE     │ per-tenant resolver  │
└─────────────────┘                        └──────────────────────┘

┌─────────────────┐     DB only            ┌──────────────────────┐
│ Vercel (API)    │ ─────────────────────► │ Channel Settings     │
│ PATCH + test    │     channel_settings   │ test-connection      │
└─────────────────┘                        └──────────────────────┘
```

**Critical split:** Inbound (Vercel) is **ENV-only** today. Outbound (Railway) can use **DB + ENV fallback** via `HUBCHAT_*_RUNTIME_CONFIG_MODE`. Channel Settings test-connection reads **DB only** and does not mirror worker env fallback.

**Existing tables:**

| Table | Role today |
|---|---|
| `channel_settings` | Per-tenant LINE/FACEBOOK/INSTAGRAM config + `secret_json` (G2) |
| `channel_accounts` | Legacy/auxiliary; linked on inbound via `ChannelAccountRepository`, not primary credential store |

**Runtime mode parsers** (code default when env unset: `ENV_ONLY`):

| Env var | Parser file |
|---|---|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | `src/lib/lineOutboundRuntimeConfig.ts` |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | `src/lib/facebookOutboundRuntimeConfig.ts` |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | `src/lib/instagramOutboundRuntimeConfig.ts` |

Worker wiring: `src/worker/main.ts` (resolvers when mode ≠ `ENV_ONLY`; env adapters in registry in parallel).

---

### 1.2 LINE

| Area | Entry points | Config source | Notes |
|---|---|---|---|
| **Inbound signature** | `app/api/webhook/line/route.ts` → `src/interfaces/api/webhook/line.ts` | **ENV** `LINE_CHANNEL_SECRET` | HMAC-SHA256, header `x-line-signature`; verified in route + handler via `verifyLineWebhookSignature` (`webhookSignature.ts`) |
| **Inbound processing** | Same handler | **ENV** `LINE_CHANNEL_ACCESS_TOKEN`, optional `DEFAULT_TENANT_ID` | Tenant: `x-tenant-id` → `DEFAULT_TENANT_ID` → 400 |
| **Outbound worker** | `SendOutboundMessageUseCase` → `createLineOutboundAdapterResolver.ts` | **ENV** or **DB** per mode | DB: `secret_json.channel_access_token`, `channel_secret`; `config_json.providerPageId` (bot id metadata) |
| **Test connection** | `app/api/channel-settings/[channel]/test-connection/route.ts` → `testChannelConnection.ts` | **DB only** | `GET https://api.line.me/v2/bot/info` (`channelHealthCheck.ts`) |

**Production risk:** Inbound still requires deployment-level `LINE_CHANNEL_*`; updating Channel Settings DB does not fix inbound until ENV is also updated.

---

### 1.3 Facebook (Messenger)

| Area | Entry points | Config source | Notes |
|---|---|---|---|
| **Inbound verify (GET)** | `app/api/webhook/facebook/route.ts` → `facebook.ts` | **ENV** `FACEBOOK_VERIFY_TOKEN` | Meta hub challenge |
| **Inbound signature (POST)** | Route logs diagnostics; handler enforces | **ENV** `FACEBOOK_APP_SECRET`, then `META_APP_SECRET` | Order in `webhookSignature.ts` `ROUTE_SECRET_SOURCE_ORDER` for `/api/webhook/facebook` |
| **Inbound processing** | `facebook.ts` | **ENV** `FACEBOOK_PAGE_ACCESS_TOKEN`, graph version envs | Tenant: `x-tenant-id` → `DEFAULT_TENANT_ID`. Also delegates `object=instagram` to Instagram handler |
| **Outbound worker** | `createFacebookOutboundAdapterResolver.ts` | **ENV** or **DB** | DB: `page_access_token`, `config_json.providerPageId`; graph version **always from ENV** |
| **Test connection** | test-connection route | **DB only** | Graph `/{pageId}?fields=id,name` (default `v25.0` in health check, not worker `META_GRAPH_VERSION`) |

**Production note:** Production does **not** use `META_APP_ID` or `META_APP_SECRET` today; signature uses `FACEBOOK_APP_SECRET` (and Instagram route may use `INSTAGRAM_APP_SECRET` separately).

---

### 1.4 Instagram

| Area | Entry points | Config source | Notes |
|---|---|---|---|
| **Inbound verify (GET)** | `app/api/webhook/instagram/route.ts` → `instagram.ts` | **ENV** `INSTAGRAM_VERIFY_TOKEN` or `FACEBOOK_VERIFY_TOKEN` | |
| **Inbound signature (POST)** | Route + handler | **ENV** order: `INSTAGRAM_APP_SECRET` → `FACEBOOK_APP_SECRET` → `META_APP_SECRET` | Instagram Login app uses `INSTAGRAM_APP_SECRET` |
| **Inbound processing** | `instagram.ts` (+ `facebook.ts` delegate) | **ENV** tokens + page/account ids | Comment webhooks store `entry.id` as `providerPageId` (IG professional account id, not Graph page id) |
| **Outbound worker** | `createInstagramOutboundAdapterResolver.ts`, `instagramOutboundConfig.ts` | **ENV** or **DB** | Private reply uses **configured Graph page id** from worker env/DB, not webhook `entry.id` |
| **Test connection** | test-connection route | **DB only** | Requires DB `providerPageId`; checks page + `instagram_business_account` |

---

### 1.5 Channel Settings (all providers)

| Piece | Path |
|---|---|
| API list/patch | `app/api/channel-settings/route.ts`, `[channel]/route.ts` |
| Domain | `src/domain/channelSettings.ts` |
| Repository | `src/infrastructure/adapters/repositories/supabaseChannelSettingRepository.ts` |
| Secret mapping | `src/lib/channelSettingApiSecrets.ts` |
| Public DTO / configured rules | `src/lib/channelSettingPublicDto.ts` |
| UI | `src/ui/ChannelSettingsPage.tsx`, `channelSettingsModel.ts` |

**Secret storage keys (DB `secret_json`):**

| Channel | Keys |
|---|---|
| LINE | `channel_access_token`, `channel_secret` |
| FACEBOOK | `page_access_token`, `verify_token`, `app_secret` |
| INSTAGRAM | `access_token`, `verify_token`, `app_secret` |

**Configured gate (UI):** access token + channel secret (LINE) or access token + app secret + verify token (Meta channels). Verify/app secrets are stored for future inbound DB resolution but **inbound webhooks do not read them today**.

---

## 2. Runtime config source matrix

| Provider | Direction | Current source | Fallback behavior | Production risk | Long-term target |
|---|---|---|---|---|---|
| LINE | Inbound webhook | **ENV only** | None | High — single-tenant ENV; DB settings ignored | **Platform webhook router + DB credential lookup** by channel connection id / tenant routing |
| LINE | Outbound send | **DB_WITH_ENV_FALLBACK** (ops) / **ENV_ONLY** (code default) | DB missing/disabled/ERROR → env tokens | Medium — worker may send with stale env while DB updated | **DB_ONLY** per tenant connection |
| LINE | Test connection | **DB only** | N/A | Low — can pass while worker still uses env | **DB only** (same as runtime) |
| Facebook | Inbound webhook | **ENV only** | Multi-secret try order for signature | High — app secret + page token in ENV; no per-tenant Meta app in DB | **SmartKorp Meta App secret in ENV** + **DB page token** + tenant routing |
| Facebook | Outbound send | **DB_WITH_ENV_FALLBACK** | DB → env page token; graph version env | Medium | **DB page token + ENV graph version** → later DB graph version |
| Facebook | Test connection | **DB only** | N/A | Medium — graph version mismatch vs worker | Align test + runtime graph version from DB or platform config |
| Instagram | Inbound webhook | **ENV only** | Instagram route tries `INSTAGRAM_APP_SECRET` first | High — Login app secret separate from Facebook; comment `entry.id` ≠ page id | **Platform Meta app secret (ENV)** + **DB connection metadata** for routing |
| Instagram | Outbound send | **DB_WITH_ENV_FALLBACK** | DB → env; page id from DB/env | Medium — wrong `providerPageId` from Login webhook if env page missing | **DB_ONLY** credentials; normalize page id at connect time |
| Instagram | Test connection | **DB only** | N/A | Medium | Same as Facebook |

**Mode semantics (outbound only):**

| Mode | Behavior |
|---|---|
| `ENV_ONLY` | Registry adapters from worker startup env; no per-tenant resolver |
| `DB_WITH_ENV_FALLBACK` | `channel_settings.getRuntimeConfig(tenant)` first; env fallback with logged `fallbackReason` |
| `DB_ONLY` | DB only; throws `*OutboundRuntimeConfigError` if missing |

---

## 3. ENV variable categorization

### 3.1 Keep in ENV (SmartKorp platform / system-level)

| Variable | Role |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Platform DB |
| `DEFAULT_TENANT_ID` | **Temporary** single-tenant routing until CCP webhook router |
| Worker tuning | `WORKER_*`, `OUTBOUND_RATE_LIMIT_*`, `IDEMPOTENCY_*` |
| Runtime mode switches | `HUBCHAT_LINE_RUNTIME_CONFIG_MODE`, `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE`, `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` (until fallback removal) |
| **Future Meta platform** | `SMARTKORP_META_APP_ID`, `SMARTKORP_META_APP_SECRET` (SmartKorp-owned app; replaces per-customer app secrets in ENV) |
| **Future LINE platform** | `SMARTKORP_LINE_MODULE_CHANNEL_ID`, partner credentials (LINE-M0) |
| Graph API platform default | `META_GRAPH_VERSION` / `FACEBOOK_GRAPH_VERSION` (until stored per connection) |
| Auth / app secrets (non-channel) | Login/session secrets, encryption keys for credential vault (CCP-1) |

### 3.2 Deprecate from ENV (move to DB per tenant connection)

| Variable | Provider | Replacement |
|---|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET` | LINE | `channel_connections` / extended `channel_settings` secrets |
| `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_PAGE_ID` | Facebook | DB page token + page id on connection |
| `FACEBOOK_VERIFY_TOKEN`, `FACEBOOK_APP_SECRET` | Facebook | DB verify token per connection; app secret → platform ENV only |
| `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_PAGE_ID`, `INSTAGRAM_ACCOUNT_ID`, `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Instagram | DB connection fields |
| `INSTAGRAM_VERIFY_TOKEN`, `INSTAGRAM_APP_SECRET` | Instagram | DB verify token; Login app secret → connection record or platform app |
| `META_APP_SECRET` | Meta (legacy alias) | Remove after SmartKorp Meta App consolidation |

**Deprecation strategy:** Keep ENV fallback until CCP-2 + CHW-1 complete per provider; then remove fallback in dedicated PR.

---

## 4. Target DB model (CCP-1 proposal)

Evolve `channel_settings` and/or introduce **`channel_connections`** as the canonical connect record. Prefer **one row per tenant per provider connection** with explicit lifecycle.

### 4.1 `channel_connections` (new, recommended)

```sql
-- Proposal only — not migrated in CCP-0
create table channel_connections (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  provider channel_type not null,           -- LINE | FACEBOOK | INSTAGRAM
  connection_kind text not null,            -- line_module | meta_page | meta_ig_login
  status text not null,                     -- draft | connecting | active | error | revoked
  external_account_id text null,            -- LINE bot id, FB page id, IG user id
  display_name text null,
  config_json jsonb not null default '{}',  -- non-secret: page id, webhook ids, scopes
  health_json jsonb not null default '{}',  -- last_error, last_verified_at, probe results
  webhook_subscription_status text null,
  oauth_state_nonce text null,              -- ephemeral during CHW flow
  connected_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)              -- v1: one connection per provider per tenant
);
```

### 4.2 `channel_credentials` (new, recommended)

Separate table for **write-only encrypted secrets** (or encrypted columns via Supabase vault / app-layer encryption):

```sql
create table channel_credentials (
  connection_id uuid primary key references channel_connections(id) on delete cascade,
  ciphertext jsonb not null,                -- AES-GCM blobs per field, or vault refs
  fingerprint_json jsonb not null default '{}',
  rotated_at timestamptz null,
  updated_at timestamptz not null default now()
);
```

**Field mapping (logical, inside ciphertext):**

| Provider | Fields |
|---|---|
| LINE | `channel_access_token`, `channel_secret`, optional `module_channel_attach_ref` |
| Facebook | `page_access_token`, `page_id`, `verify_token` |
| Instagram | `access_token`, `page_id`, `ig_user_id`, `verify_token` |

### 4.3 `channel_settings` during transition

- **CCP-1:** Keep `channel_settings` as-is; dual-write or migrate to `channel_connections`.
- **CCP-2:** Resolvers read from `channel_connections` + `channel_credentials`; `channel_settings` becomes view/compat layer or deprecated.
- **Public API:** Continue masked DTOs (`secret_fingerprint_json`, no raw secrets in GET).

### 4.4 Encrypted / write-only token behavior

| Concern | Target behavior |
|---|---|
| Read path | Server/worker decrypt on use only; never return raw token in API/UI after save |
| Write path | PATCH accepts new values; empty string = unchanged |
| Logs | Fingerprints / SET-EMPTY badges only (existing pattern) |
| Rotation | `rotated_at`, health re-probe, optional grace period |
| RLS | Tenant-scoped; service role for worker |

### 4.5 Connection health / status fields

Reuse and extend patterns from `config_json.lastError`, `lastVerifiedAt`, `channel_settings.status`:

| Field | Use |
|---|---|
| `status` | Wizard + runtime gate (`active` required for send/receive) |
| `health_json.last_verified_at` | Test connection + periodic probe |
| `health_json.last_error_code` | Sanitized provider error |
| `webhook_subscription_status` | Meta/LINE subscription state post-connect |
| `enabled` equivalent | `status = active` |

---

## 5. Provider onboarding architecture (target)

### 5.1 LINE — Module Channel attach (LINE-M0)

**Not LINE Login.** Target flow:

1. CHW starts LINE connect → create `channel_connections` row (`connection_kind=line_module`, `status=draft`).
2. Redirect / embed SmartKorp **LINE Module Channel** partner attach (customer selects OA).
3. Callback stores bot id + tokens in `channel_credentials`.
4. **Webhook auto-config:** register HubChat webhook URL to the attached channel (LINE Messaging API webhook endpoint API).
5. Health probe: `GET /v2/bot/info`.
6. Mark `status=active`; inbound resolver uses connection id → secret lookup (replace ENV).

**Platform ENV:** partner/module credentials only; no customer tokens in ENV.

### 5.2 Meta — SmartKorp App + OAuth (META-0)

**Single SmartKorp Meta App** (production today lacks `META_APP_ID` / `META_APP_SECRET` — introduce as platform env in META-0).

1. CHW Facebook connect → OAuth (`pages_show_list`, `pages_messaging`, `pages_manage_metadata`, etc.).
2. Customer selects Page → store **page access token** + page id in credentials.
3. CHW Instagram connect → OAuth via same app (Instagram Graph permissions) or IG Login product as required.
4. Link IG business account to stored page id; normalize **Graph page id** (fix Login webhook `entry.id` conflation).
5. **Webhook subscription:** programmatically subscribe page/IG fields to SmartKorp webhook URLs (`/api/webhook/facebook`, `/api/webhook/instagram`).
6. Store per-connection **verify token** in DB; platform **app secret** remains ENV for signature verification until multi-app needed.

### 5.3 Webhook / subscription setup (all providers)

| Provider | Target |
|---|---|
| LINE | Set webhook URL + verify signature with DB secret |
| Facebook | Page subscribed apps + verify token in DB |
| Instagram | IG object subscriptions via Meta API; route-specific secret order preserved |

**Tenant routing (post-CCP-2):** Replace `DEFAULT_TENANT_ID` with connection id in webhook path or signed routing header from Meta/LINE callback metadata lookup.

---

## 6. Rollout phases

| Phase | ID | Deliverable | Production impact |
|---|---|---|---|
| **0** | **CCP-0** | This audit + architecture (docs) | None |
| **1** | **CCP-1** | DB schema: `channel_connections`, `channel_credentials`, encryption helper, dual-read hooks | None until feature-flagged |
| **2** | **CCP-2** | Inbound + outbound **DB runtime resolver** per tenant; webhook tenant routing | Opt-in per tenant; ENV fallback remains |
| **3** | **LINE-M0** | Module Channel attach API + backend connect flow | New tenants only initially |
| **4** | **META-0** | SmartKorp Meta App env + OAuth token exchange + subscription setup | New tenants; migrate existing manual ENV tenants via CHW |
| **5** | **CHW-1** | Setup Wizard UI (connect, test, status) | Replaces manual Channel Settings secret paste for new flows |
| **6** | **CCP-3** | Remove `DB_WITH_ENV_FALLBACK` + deprecate customer channel ENV vars | Requires all prod tenants on DB connections |

**Explicit non-goals in CCP-0..2:** Marketplace module, `DB_ONLY` forced cutover, Setup Wizard UI.

---

## 7. Guardrails confirmation (CCP-0)

| Guardrail | Status |
|---|---|
| No Setup Wizard implementation | ✓ |
| No runtime switch to `DB_ONLY` | ✓ |
| No production behavior change | ✓ |
| No marketplace work | ✓ |
| No secrets in this document | ✓ |
| No migrations in CCP-0 PR | ✓ (plan only) |
| Existing LINE/FB/IG flows unchanged | ✓ |

---

## 8. Known gaps / risks (prioritized)

1. **Inbound/outbound split** — largest blocker for “no manual ENV”; inbound must become DB-aware (CCP-2).
2. **`DEFAULT_TENANT_ID`** — acceptable for single-tenant prod, must go before true multi-tenant SaaS.
3. **Instagram Login `entry.id` vs Graph page id** — must normalize at connect time (META-0).
4. **Test connection vs worker graph version** — health checks hardcode `v25.0`; align in CCP-2.
5. **`channel_accounts` vs `channel_settings`** — consolidate under `channel_connections` to avoid dual models.
6. **Code default `ENV_ONLY` vs ops `DB_WITH_ENV_FALLBACK`** — document in runbooks; CHW should not depend on worker mode env.

---

## 9. Next recommended PR

**CCP-1 — DB connection/credential foundation**

- Migration: `channel_connections` + `channel_credentials` (or encrypted extension to `channel_settings`).
- App-layer encryption interface + repository (no wizard UI).
- Read-only admin API to inspect connection **status/health** (no secret leakage).
- Feature flag: `HUBCHAT_CHANNEL_CONNECTIONS_ENABLED=false` default.

---

## 10. Related docs

- `docs/hubchat-channel-settings-runtime-confidence-runbook.md`
- `docs/phase-ii-g2-d-db-only-readiness-analysis.md`
- `docs/agent-reports/agent-a/2026-05-22-phase-ii-g2-d-db-only-readiness-analysis.md`
- `docs/hubchat-production-security-readiness-runbook.md`
