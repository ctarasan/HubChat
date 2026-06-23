# META-CRED-1B — Unified Meta Page Credential Implementation Plan (Implementation-Ready)

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-06-23 |
| Phase | META-CRED-1B (read-only audit + docs-only implementation plan) |
| Base master SHA | `d50ef01feb9398a0231a2e49a523aae9a8dfc694` |
| Prior plan | META-CRED-1A merged (`docs/agent-reports/agent-a/2026-06-23-meta-cred-1a-unified-page-credential-plan.md`) |
| Authorization in this task | **NONE** (no code, migration, credential, or ENV change) |

## Executive summary

Implementation-ready design for **one shared encrypted long-lived Facebook Page access token** (`META_PAGE_FACEBOOK_LOGIN` family only) bound independently to Facebook and/or Instagram `channel_connections`, with verify-before-persist, DB-level tenant isolation, and fail-closed resolvers. **`instagram_oauth_credentials` / `INSTAGRAM_BUSINESS_LOGIN` remain a separate system.**

**Binding model (v1):** `meta_page_credential_bindings` table (not direct FK on `channel_connections`) — best fit for per-channel activation, version CAS, and audit without ambiguous null-FK semantics.

**Migration candidate:** `20260623120000_meta_cred_1a_meta_page_credentials.sql` — version unique on latest master; no history rewrite; no repair.

---

## Phase 1 — Repository baseline

| Check | Result |
| --- | --- |
| `HEAD` | `d50ef01feb9398a0231a2e49a523aae9a8dfc694` |
| `origin/master` | `d50ef01feb9398a0231a2e49a523aae9a8dfc694` |
| Working tree | **clean** |
| META-CRED-1A on master | **YES** |
| Relevant schema change since META-CRED-1A | **NO** (plan-only merge) |

Latest migration timestamp on master: `20260621150000_legacy_20260430_reconciliation.sql`.

---

## Phase 2 — Credential-family isolation

### Allowed in `meta_page_credentials`

```text
credential_family = META_PAGE_FACEBOOK_LOGIN
```

Long-lived **Facebook Page access token** obtained via Facebook Login / Page token exchange — same material currently used for Instagram legacy Page-token path and Facebook Messenger.

### Explicitly excluded

| Family / payload | Storage | Guard |
| --- | --- | --- |
| `INSTAGRAM_BUSINESS_LOGIN` | `instagram_oauth_credentials` only | DB enum + repository reject |
| Instagram Login / IGA token family | Never `meta_page_credentials` | Domain type + activation use case |
| `instagram_oauth_credentials` ciphertext | Separate table | Resolver routes by `authFamily` on queue binding |

### Validation layers (defense in depth)

| Layer | Guard |
| --- | --- |
| **Database** | `credential_family` enum with single value `META_PAGE_FACEBOOK_LOGIN`; check rejects IGA-prefixed token fingerprints if ever probed at app layer |
| **Domain** | `MetaPageCredentialFamily` branded type; `assertMetaPageFacebookLoginTokenShape()` rejects `IGA…` prefixes |
| **Repository** | `insert`/`activate` require `credential_family === META_PAGE_FACEBOOK_LOGIN` |
| **Activation use case** | Graph `debug_token` app_id + token type must be PAGE; reject user/login/IGA tokens before encrypt |
| **Resolver** | Instagram Page-token path reads `meta_page_credentials` only; OAuth path reads `instagram_oauth_credentials` when `authFamily=INSTAGRAM_BUSINESS_LOGIN` |
| **Provider adapter** | `InstagramAdapter` Page path uses Page token; OAuth delivery services unchanged |

**Invariant:**

```text
meta_page_credentials stores only Meta Page / Facebook Login credentials
instagram_oauth_credentials remains a separate system
```

---

## Phase 3 — Final schema design

### Enum: `meta_page_credential_family`

```sql
META_PAGE_FACEBOOK_LOGIN  -- sole value in v1
```

### Enum: `meta_page_credential_status`

```sql
PENDING    -- row reserved during transaction; no ACTIVE binding without VERIFIED/ACTIVE promotion
VERIFIED   -- identity verified in memory; encrypted blob written; not yet bound
ACTIVE     -- eligible for resolver
ERROR      -- last activation/health failed; prior ciphertext retained
REVOKED    -- operator disconnect; bindings deactivated
```

Promotion rules:

- `PENDING` → never exposed to resolver
- `VERIFIED` → may exist only inside transaction before bindings committed (or collapse VERIFIED into ACTIVE in v1 simplification — **recommend skip standalone VERIFIED row state**; use in-memory verify then insert directly as `ACTIVE` with `verified_at` set)
- **Simplified v1 lifecycle:** `PENDING` (internal) → `ACTIVE` | `ERROR` | `REVOKED`

### Table: `meta_page_credentials`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | FK → tenants |
| `credential_family` | enum NOT NULL | `META_PAGE_FACEBOOK_LOGIN` only |
| `provider_app_id` | text NOT NULL | Meta app id from `debug_token` / config |
| `facebook_page_id` | text NOT NULL | required before ACTIVE |
| `instagram_professional_account_id` | text NULL | nullable on credential |
| `encrypted_access_token` | text NOT NULL | AES-256-GCM v1 envelope |
| `token_fingerprint` | text NOT NULL | SHA-256 prefix (reuse `fingerprintSecretValue`) |
| `encryption_format_version` | text NOT NULL DEFAULT `'v1'` | maps to `channelCredentialEncryption` FORMAT_VERSION |
| `key_version` | smallint NOT NULL DEFAULT 1 | future rotation |
| `credential_version` | integer NOT NULL DEFAULT 1 | optimistic concurrency |
| `status` | enum NOT NULL | |
| `granted_scopes` | text[] NULL | sanitized scope list |
| `token_expires_at` | timestamptz NULL | from debug_token when present |
| `verified_at` | timestamptz NULL | first successful identity verify |
| `last_verified_at` | timestamptz NULL | last health/activation verify |
| `last_error_sanitized` | text NULL | no raw Meta text |
| `created_at` / `updated_at` | timestamptz | |

**Facebook-only support:**

```text
facebook_page_id: required before ACTIVE
instagram_professional_account_id: nullable on credential row
Instagram binding activation: requires non-null IG id + relationship verified at binding time
```

Do **not** require IG account on credential row for Facebook-only tenants.

### Partial unique indexes (v1 single Page per tenant)

```sql
UNIQUE (tenant_id) WHERE status = 'ACTIVE'
UNIQUE (tenant_id, facebook_page_id) WHERE status IN ('ACTIVE','ERROR')
```

Future multi-Page: drop tenant-only unique, keep `(tenant_id, facebook_page_id)`.

---

## Phase 4 — Binding model decision

### Option A — Direct FK on `channel_connections`

```text
channel_connections.meta_page_credential_id → meta_page_credentials(id)
```

| Criterion | Assessment |
| --- | --- |
| Complexity | Low |
| Per-channel activation | Awkward — must use NULL FK on IG connection for Facebook-only |
| Same credential on both | Requires trigger: FB and IG FK must match when both set |
| Rotation audit | Weak |
| Rollback | Clear FK null |

### Option B — Binding table (selected)

```text
meta_page_credential_bindings
```

| Column | Type |
| --- | --- |
| `id` | uuid PK |
| `tenant_id` | uuid NOT NULL |
| `credential_id` | uuid NOT NULL |
| `channel_connection_id` | uuid NOT NULL |
| `channel_type` | channel_type NOT NULL (`FACEBOOK` \| `INSTAGRAM`) |
| `binding_status` | enum `PENDING` \| `ACTIVE` \| `DISABLED` \| `ERROR` |
| `credential_version` | integer NOT NULL | snapshot at activation |
| `activated_at` | timestamptz NULL |
| `deactivated_at` | timestamptz NULL |
| `last_error_sanitized` | text NULL |
| `created_at` / `updated_at` | timestamptz |

Unique: `(tenant_id, channel_connection_id)`; partial unique `(tenant_id, channel_type) WHERE binding_status = 'ACTIVE'`.

| Criterion | Assessment |
| --- | --- |
| Complexity | Medium |
| Per-channel activation | **Native** — FB binding ACTIVE, IG absent or DISABLED |
| Rotation | New credential_version on binding row |
| Audit | `activated_at`, `deactivated_at` |
| Connection delete | CASCADE binding row |
| Future multi-Page | Add `is_primary` or multiple bindings per channel type |

### Recommendation: **Binding table (Option B)** for v1

Direct FK rejected because Facebook-only + later Instagram enable requires clear per-channel lifecycle without overloading nullable FK semantics and cross-connection equality triggers.

---

## Phase 5 — Database-level tenant isolation

### On `meta_page_credentials`

```sql
UNIQUE (tenant_id, id)
```

### Composite FK from bindings

```sql
meta_page_credential_bindings (tenant_id, credential_id)
  → meta_page_credentials (tenant_id, id)

meta_page_credential_bindings (tenant_id, channel_connection_id)
  → channel_connections (tenant_id, id)
```

Existing `channel_connections` already has `UNIQUE (tenant_id, id)` (`idx_channel_connections_tenant_id`).

### Invariant

```text
Cross-tenant credential binding is impossible at DB level
```

Repository guards remain as defense-in-depth only.

### RLS

Follow `marketing_events` pattern: enable RLS; service-role only for worker/API; no anon access. Policies: `tenant_id` match via JWT claim if exposed to client (prefer **no direct client access** — API-only via service role).

---

## Phase 6 — Verify-before-persist and atomic activation

### Invariants

```text
UNVERIFIED TOKEN IS NEVER PERSISTED
UNVERIFIED TOKEN IS NEVER ACTIVE
```

### Sequence: `VerifyAndActivateMetaPageCredentialUseCase`

```text
1. Receive token in memory (ADMIN API body — write-only)
2. assertMetaPageCredentialFamily (reject IGA / wrong type)
3. Graph debug_token — validity, expiry horizon, app_id match
4. Graph Page node — facebook_page_id, name
5. If Instagram binding requested:
     Graph instagram_business_account — id, username, account_type
     assert relationship + validateInstagramProfessionalIdentityRaw
6. Assert granted_scopes ⊇ requiredFacebook (+ requiredInstagram if IG binding)
7. encryptChannelCredentialPlaintext in memory
8. BEGIN TRANSACTION
9. SELECT meta_page_credentials FOR UPDATE WHERE tenant_id = ? AND status = 'ACTIVE'
10. credential_version CAS — expectedVersion or insert new row
11. Re-fetch channel_connections FOR UPDATE (tenant, FACEBOOK/INSTAGRAM)
12. INSERT or UPDATE meta_page_credentials (status ACTIVE, verified_at)
13. UPSERT meta_page_credential_bindings (ACTIVE for requested channels)
14. UPDATE channel_settings per channel (metadata only; NO secret_json token write)
15. COMMIT
16. Clear token from request scope / no logging
```

### Failure handling

| Scenario | Behavior |
| --- | --- |
| Concurrent ADMIN saves | `credential_version` CAS → one wins; other gets conflict sanitized error |
| Stale version | Reject with `CREDENTIAL_VERSION_CONFLICT`; no partial activation |
| Connection deleted mid-flight | FK failure → rollback; prior ACTIVE preserved |
| Page identity changes before commit | Re-verify inside transaction or abort |
| Facebook binding OK, Instagram binding fail | **Full rollback** — no partial dual state in v1 atomic API |
| Retry after timeout | Idempotent if same fingerprint + version; else new activation |
| DB commit failure | Rollback; prior ACTIVE credential unchanged |

```text
credential_version compare-and-swap: YES
prior active credential preserved on failure: YES
```

Prefer **single verify+activate endpoint** — no `PENDING` persisted unverified rows.

---

## Phase 7 — Encryption reuse

### Exact reuse

| Item | Source |
| --- | --- |
| Helper | `src/lib/channelCredentialEncryption.ts` |
| Key env | `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` |
| Algorithm | AES-256-GCM |
| Envelope | `v1:{iv}:{ciphertext}:{tag}` (`FORMAT_VERSION = "v1"`) |
| Fingerprint | `fingerprintSecretValue()` from `channelSettingSecrets.ts` |
| Encrypt site | `VerifyAndActivateMetaPageCredentialUseCase` pre-transaction |
| Decrypt site | `SupabaseMetaPageCredentialRepository.decryptForRuntime()` |

### Failure handling

| Condition | Behavior |
| --- | --- |
| Missing key | Write rejected; decrypt fails closed; no ENV fallback |
| Wrong key | `ChannelCredentialEncryptionError`; fail closed |
| Tampered ciphertext | Decrypt throws; sanitized operational error |
| Key rotation (future) | `key_version` column; re-encrypt job in separate workstream |

```text
new writes encrypted only: YES
missing/wrong key fails closed: YES
no plaintext fallback: YES
no secret logging: YES
```

### Key availability (names only — no values)

| Runtime | State |
| --- | --- |
| Vercel `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` | **SET** (per prior production inventories; not re-probed this task) |
| Railway `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` | **SET** (per prior worker encryption wiring evidence) |

---

## Phase 8 — Facebook-only and dual-channel behavior

### Facebook only

```text
Page verified → credential ACTIVE (IG id nullable)
Facebook binding ACTIVE
Instagram binding: absent or DISABLED
channel_settings(FACEBOOK).status: READY (after Test Connection)
channel_settings(INSTAGRAM).status: independent (DISABLED / NOT_CONFIGURED)
```

### Facebook + Instagram

```text
Page + IG Professional Account verified
relationship verified
both bindings ACTIVE (same credential_id)
FB and IG channel_settings updated independently
```

### Facebook valid, Instagram permissions missing

```text
Activation API with bindInstagram=false succeeds
Facebook READY
Instagram NOT_READY or ERROR with sanitized scope message
shared credential preserved (Facebook-only bindings)
```

### Enable Instagram later

```text
POST verify-and-activate with bindInstagram=true
reuse existing encrypted credential (decrypt in memory) OR accept new token
verify IG identity/relationship/scopes only
add Instagram binding row
no duplicate token storage
```

Channel `channel_settings.status` / `lastError` remain **per channel** even when credential is shared.

---

## Phase 9 — Resolver precedence

### Feature flags (transition → end-state)

| Flag | Transition | End-state |
| --- | --- | --- |
| `HUBCHAT_META_PAGE_CREDENTIAL_ENABLED` | `false` → `true` | `true` |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | `DB_WITH_ENV_FALLBACK` during transition | `DB_ONLY` |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | already `DB_ONLY` in production | `DB_ONLY` |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | existing | unchanged for LINE |

### Facebook resolver

```text
1. ACTIVE meta_page binding for FACEBOOK connection?
   → decrypt shared credential → use (ONLY)
2. Transition: shared binding absent AND flag allows legacy?
   → existing OAuth channel_credentials / channel_settings / ENV per mode
3. Shared binding present but decrypt/identity invalid?
   → FAIL CLOSED (no silent fallback)
```

### Instagram Page-token path

```text
1. ACTIVE meta_page binding for INSTAGRAM connection?
   → decrypt same shared credential → use (ONLY)
2. Transition: binding absent AND legacy flag?
   → channel_settings legacy DB (DB_ONLY)
3. Shared binding present but invalid?
   → FAIL CLOSED — no ENV — no legacy
```

### Instagram Login OAuth (unchanged)

```text
Queue binding authFamily = INSTAGRAM_BUSINESS_LOGIN
→ resolveInstagramConnectionCredential
→ instagram_oauth_credentials
NEVER reads meta_page_credentials
```

### End-state

```text
Facebook ENV fallback: disabled after cutover
Instagram ENV fallback: disabled (already)
Legacy plaintext fallback: disabled after verified cutover + META-CRED-1G
```

Implementation files: extend `channelConnectRuntimeResolver.ts`, `resolveWorkerOutboundWithChannelConnect.ts`, new `resolveMetaPageRuntimeCredential.ts`.

---

## Phase 10 — Migration plan

### Candidate version

```text
20260623120000_meta_cred_1a_meta_page_credentials.sql
```

| Check | Result |
| --- | --- |
| Version unique on master | **YES** (no file with this timestamp) |
| History rewrite required | **NO** |
| Repair required | **NO** |

### Planned contents (not created in this task)

- Enums: `meta_page_credential_family`, `meta_page_credential_status`, `meta_page_binding_status`
- Table `meta_page_credentials` + indexes + tenant unique constraints
- Table `meta_page_credential_bindings` + composite FKs
- RLS enable + deny-by-default policies
- Grants for service role
- Status/family CHECK constraints
- **No** `DROP TABLE`; **no** modification of existing migration files

Sync `supabase/schema.sql` in implementation PR after migration lands.

---

## Phase 11 — Cutover phases

| Phase | Scope |
| --- | --- |
| **META-CRED-1B** | This plan (docs) |
| **META-CRED-1C** | Migration + domain + repository + encryption wiring |
| **META-CRED-1D** | `VerifyAndActivateMetaPageCredentialUseCase` + ADMIN API |
| **META-CRED-1E** | Facebook/Instagram resolver shared-binding support + flags |
| **META-CRED-1F** | Setup Wizard / Channel Settings UI — Connect Meta once |
| **META-CRED-1G** | Controlled long-lived Page import + resolver cutover authorization |
| **META-CRED-1H** | Legacy read disable + **selective** plaintext cleanup |

### META-CRED-1H selective cleanup (only after 1G gates)

Remove keys only:

```text
Facebook channel_settings.secret_json: access_token (page token key)
Instagram channel_settings.secret_json: access_token
```

**Preserve:** `app_secret`, `verify_token`, webhook config, LINE secrets, non-token `config_json`.

**Do not** delete entire `secret_json` object.

### Cutover safety ordering (before 1H)

```text
□ shared credential persisted (encrypted)
□ identity verified
□ Facebook binding ACTIVE
□ Instagram binding ACTIVE (when applicable)
□ Facebook resolver selects shared credential (observed in logs)
□ Instagram resolver selects shared credential
□ both Test Connections pass
□ rollback evidence captured
□ working legacy token preserved until cutover gate passes
```

---

## Phase 12 — API / use-case design

### Primary use case

```text
VerifyAndActivateMetaPageCredentialUseCase
```

### Proposed endpoints (ADMIN-only)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/meta-connections/verify-and-activate` | Verify + encrypt + bind atomically |
| POST | `/api/meta-connections/rotate` | New token with version CAS |
| GET | `/api/meta-connections/status` | Sanitized DTO — fingerprints, masked ids, per-channel status |

Request body: `{ accessToken, bindFacebook, bindInstagram, expectedPageIdPrefix? }` — token write-only, never returned.

Response: masked `facebook_page_id`, `instagram_professional_account_id`, `credential_version`, per-binding status, channel_settings status — **no ciphertext, no token**.

Idempotency: same `token_fingerprint` + `credential_version` → safe no-op or conflict.

---

## Phase 13 — UI scope (META-CRED-1F — plan hooks only)

- **Connect Meta Page** single card (replaces Instagram token field)
- Modes: Facebook-only toggle; Instagram enable requires IG verification
- Independent channel enable/disable switches
- Reconnect/rotate → calls rotate endpoint
- Clear token from component state after submit
- Per-channel readiness badges from `GET status`
- Remove legacy Instagram access token input after cutover flag

---

## Phase 14 — Authorization gates (separate phrases)

| Gate | Authorizes |
| --- | --- |
| `GO META-CRED CODE IMPLEMENTATION` | Application code (1C–1E) |
| `GO META-CRED DATABASE MIGRATION` | Apply migration SQL |
| `GO META-CRED CONTROLLED CREDENTIAL IMPORT` | Production token import |
| `GO META-CRED RESOLVER CUTOVER` | Enable shared resolver flags |
| `GO META-CRED LEGACY PLAINTEXT CLEANUP` | Selective secret_json key removal (1H) |

**This task authorizes none.**

---

## Phase 15 — Required tests (implementation matrix)

Tests listed in task §15 map to packages:

- `src/domain/metaPageCredentials.test.ts` — family enum guards
- `src/infrastructure/.../supabaseMetaPageCredentialRepository.test.ts` — tenant FK, CAS
- `src/application/metaPage/verifyAndActivateMetaPageCredential.test.ts` — identity, atomicity
- `src/application/channelConnect/resolveMetaPageRuntimeCredential.test.ts` — resolver precedence
- `src/lib/channelCredentialEncryption.test.ts` — already exists; extend for meta page repo

---

## Prohibited-action attestation

| Action | Executed |
| --- | --- |
| Code implementation | **NO** |
| Migration file created | **NO** |
| Migration executed | **NO** |
| Migration repair | **NO** |
| Credential import/write | **NO** |
| ENV change | **NO** |
| Resolver cutover | **NO** |
| Legacy cleanup | **NO** |
| Outbound smoke | **NO** |
| Token in git/chat | **NO** |

---

## META-CRED-1B IMPLEMENTATION PLAN RESULT

```text
META-CRED-1B IMPLEMENTATION PLAN RESULT

Latest master SHA: d50ef01feb9398a0231a2e49a523aae9a8dfc694
Branch: docs/meta-cred-1b-implementation-plan
Evidence SHA: (set at commit)
Evidence PR: (set after gh pr create)

Credential family:
- Selected family: META_PAGE_FACEBOOK_LOGIN
- Instagram Login isolation: instagram_oauth_credentials + INSTAGRAM_BUSINESS_LOGIN resolver only
- Validation layers: DB enum, domain type, repository, activation use case, resolver, adapter

Schema:
- Credential table: meta_page_credentials
- Binding model: meta_page_credential_bindings (recommended v1)
- Tenant isolation: UNIQUE(tenant_id, id) + composite FKs on bindings
- Composite FK: YES (tenant_id, credential_id) and (tenant_id, channel_connection_id)
- Facebook-only support: YES (IG id nullable; IG binding optional)
- Identity fields: facebook_page_id required; instagram_professional_account_id nullable
- Status lifecycle: PENDING(internal) → ACTIVE | ERROR | REVOKED
- Versioning: credential_version CAS on credentials + binding snapshot
- Rotation: POST /rotate with version increment
- Delete behavior: bindings CASCADE on connection delete; credential REVOKED not hard-deleted in v1

Verification:
- Verify-before-persist: YES (all Graph checks before encrypt)
- Atomic activation: YES (single transaction)
- CAS/version guard: YES
- Prior credential preserved: YES on failure
- Concurrent save handling: version conflict → sanitized error

Encryption:
- Helper: channelCredentialEncryption.ts
- Key source: HUBCHAT_CREDENTIAL_ENCRYPTION_KEY
- Envelope/version: AES-256-GCM v1
- Missing key: fail closed
- Wrong key: fail closed
- Rotation: key_version column (future re-encrypt)
- Plaintext fallback: NO

Resolvers:
- Facebook precedence: shared binding → legacy (transition) → fail closed
- Instagram Page-token precedence: shared binding → legacy DB (transition) → fail closed
- Instagram OAuth isolation: instagram_oauth_credentials only
- Shared-invalid behavior: fail closed, no fallback
- ENV fallback end-state: disabled both channels
- Legacy fallback end-state: disabled after cutover + 1H

Migration:
- Candidate version: 20260623120000_meta_cred_1a_meta_page_credentials.sql
- Version unique: YES
- History rewrite: NO
- Repair required: NO
- Migration file created: NO

Cutover phases:
- 1B: this plan
- 1C: schema/domain/repository
- 1D: verification + activation API
- 1E: resolver shared-binding
- 1F: UI
- 1G: controlled import + cutover
- 1H: selective plaintext cleanup
- Rollback credential preserved: YES until 1G passes
- Selective cleanup: access_token keys only per channel

Remote state changed: NO
Migration created/executed: NO
Credential changed: NO
ENV changed: NO
Outbound operation executed: NO

Decision: READY FOR AGENT B REVIEW

Recommended next gate: GO META-CRED CODE IMPLEMENTATION (after Agent B exact-SHA review)

Operational state: HOLD — NO DATABASE OR CREDENTIAL CUTOVER
```
