# META-CRED-1A — Unified Meta Page Credential Implementation Plan

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-06-23 |
| Phase | META-CRED-1A (audit + schema/reuse strategy; implementation follows Agent B review) |
| Base master SHA | `3a20708c2fbcd1617a67b73df0a71051a8040b32` |
| Context | No production users — controlled downtime and direct cutover permitted |
| Prior recovery state | Instagram legacy `channel_settings` READY; Railway `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_ONLY` |

## Executive summary

Unify Facebook Messenger and Instagram DM outbound under **one encrypted long-lived Facebook Page access token** with verified Page + Instagram Professional Account identity. Retire legacy Instagram plaintext `channel_settings` token writes and permanently remove Instagram ENV fallback.

**Selected source of truth:** **Option C — new `meta_page_credentials` table** (tenant-scoped), with **both** `channel_connections` rows (FACEBOOK + INSTAGRAM) binding to the same credential record. Reuse existing **`channelCredentialEncryption`** (`HUBCHAT_CREDENTIAL_ENCRYPTION_KEY`) and existing Meta identity/health verifiers.

**This PR:** plan and audit only. Schema/migration/code land in follow-up commits after Agent B exact-SHA review of this plan.

---

## Phase 0 — First audit

### Current Facebook OAuth credential storage

| Item | Location |
| --- | --- |
| Connection row | `channel_connections` (`provider=FACEBOOK`, unique per tenant) |
| Encrypted token | `channel_credentials` (`credential_type=ACCESS_TOKEN`, `encrypted_secret_value`) |
| OAuth flow | `oauth_transactions` + `facebookOAuthService.ts` |
| Runtime resolver | `facebookOAuthRuntimeCredential.ts` → `resolveFacebookRuntimeCredential` |
| Fallback | `resolveFacebookOutboundConfig` + `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` |
| Legacy path | `channel_settings` (`secret_json` plaintext) still supported when OAuth not complete |

Production today: legacy `channel_settings` READY for Facebook (per IG-CRED-1I cross-channel check); OAuth rows may be absent.

### Current Facebook runtime resolver

```text
Worker/API → parseChannelConnectRuntimeModeFromEnv(FACEBOOK)
  → tryResolveFacebookFromChannelConnect (if HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED)
  → resolveFacebookOutboundConfig (ENV_ONLY | DB_WITH_ENV_FALLBACK | DB_ONLY)
  → channel_settings.getRuntimeConfig OR loadEnvFacebookCredentials
```

OAuth-managed path decrypts `channel_credentials` via `SupabaseChannelConnectionRepository.retrieveDecryptedCredentialForRuntime`.

### Current Instagram legacy credential storage

| Item | Location |
| --- | --- |
| Plaintext secrets | `channel_settings.secret_json` (`access_token`, `app_secret`, `verify_token`) |
| Public metadata | `channel_settings.config_json` (`providerPageId`, `lastError`, `lastVerifiedAt`) |
| Write path | `PATCH /api/channel-settings/instagram` → `UpsertChannelSettingUseCase` (**no identity-before-activation**) |
| Test Connection | `verifyInstagramChannelHealth` (Graph GET Page → `instagram_business_account`) |
| Runtime (worker) | `resolveInstagramOutboundConfig` + legacy `getRuntimeConfig` |

Production today: legacy path active; Instagram READY after controlled recovery (2026-06-23).

### Current Instagram OAuth credential table

| Item | Location |
| --- | --- |
| Table | `instagram_oauth_credentials` |
| Encryption | `access_token_ciphertext` (same AES-256-GCM format via repository) |
| Identity | `provider_instagram_account_id`, `verified_username`, `identity_verified_at`, scopes |
| Binding | `channel_connection_id` → INSTAGRAM `channel_connections` row |
| Connect flow | `instagramOAuthConnectService.ts` + `instagramBusinessLoginOAuth.ts` |
| Auth families | `LEGACY_FACEBOOK_PAGE`, `INSTAGRAM_BUSINESS_LOGIN` |

Production today: **0** INSTAGRAM `channel_connections` / **0** `instagram_oauth_credentials` rows.

### Connection / binding tables

| Table | Role |
| --- | --- |
| `channel_connections` | Per-tenant per-provider (LINE, FACEBOOK, INSTAGRAM); `provider_page_id`, `provider_ig_account_id` |
| `channel_credentials` | Encrypted secrets per connection (`ACCESS_TOKEN`, etc.) |
| `channel_settings` | Legacy per-channel config + **plaintext** `secret_json` |
| `oauth_transactions` | Facebook OAuth state machine only |
| `instagram_oauth_states` | Instagram OAuth CSRF/state |
| `instagram_oauth_credentials` | Instagram OAuth encrypted token (parallel to Facebook CCP model) |

### Reusable encryption helpers

| Module | Use |
| --- | --- |
| `src/lib/channelCredentialEncryption.ts` | `encryptChannelCredentialPlaintext`, `decryptChannelCredentialCiphertext`, `resolveChannelCredentialEncryptionKey` |
| `SupabaseChannelConnectionRepository` | Store/retrieve encrypted `channel_credentials` |
| `SupabaseInstagramOAuthCredentialRepository` | Store/retrieve encrypted OAuth ciphertext (same algorithm) |

**Requirement:** `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` must be configured; missing/invalid key → **fail closed** (no plaintext write, no ENV fallback).

### Existing Meta identity verifiers

| Verifier | Purpose |
| --- | --- |
| `verifyFacebookChannelHealth` | Page token + Page id/name |
| `verifyInstagramChannelHealth` | Page token + Page → IG business account |
| `instagramProfessionalIdentity.ts` / `instagramIdentityValidation.ts` | IG account type, ID format, username |
| `assertTokenResponseIdentityMatchesMe` | OAuth token response vs `/me` |
| `facebookOAuthService` page selection | Facebook OAuth page pick + encrypt store |

### UI / API impact (initial)

| Surface | Current | Target |
| --- | --- | --- |
| Channel Settings Instagram | Separate token/app_secret/verify_token fields | **Connect Meta Page** (single flow) |
| Channel Settings Facebook | Legacy + OAuth paths | Same Meta connect; hide duplicate token fields |
| `PATCH /api/channel-settings/instagram` | Plaintext `secrets.accessToken` | **Reject** or redirect to Meta credential API |
| Test Connection | Per-channel legacy | Uses shared credential; updates **per-channel** `channel_settings` health only |
| Setup Wizard | Per-channel setup | One Meta Page step binds FB + IG |
| Worker resolvers | Split legacy/OAuth/ENV | `resolveMetaPageCredential` for FB + IG |

---

## Source-of-truth selection

### Options evaluated

| Option | Assessment |
| --- | --- |
| **A. Facebook OAuth `channel_credentials`** | Encrypted and proven for Facebook, but bound to FACEBOOK connection only; Instagram would duplicate token or require awkward cross-connection reads |
| **B. `instagram_oauth_credentials`** | Encrypted and identity-rich, but Instagram-scoped; Facebook OAuth uses different table; duplicates Page token for two providers |
| **C. New `meta_page_credentials`** | **Selected** — one row per tenant Page identity; explicit FB+IG binding; clear invariant enforcement |

### Decision: **Option C — `meta_page_credentials`**

Rationale: one verified Page token, one encryption envelope, two channel bindings, independent per-channel operational status in `channel_settings` / connection health.

---

## Target schema (proposed)

### New enum types

```sql
meta_page_credential_status: PENDING | ACTIVE | EXPIRING | REAUTH_REQUIRED | REVOKED | ERROR
```

### New table: `meta_page_credentials`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `tenant_id` | uuid FK | unique active per tenant (v1 single Page) |
| `credential_status` | enum | never ACTIVE without verification |
| `access_token_ciphertext` | text | AES-256-GCM via `channelCredentialEncryption` |
| `secret_fingerprint` | text | sha256 prefix for rotation detection |
| `facebook_page_id` | text | verified |
| `instagram_professional_account_id` | text | verified |
| `verified_username` | text | sanitized display |
| `granted_scopes` | text[] | required permissions subset |
| `identity_verified_at` | timestamptz | |
| `token_expires_at` | timestamptz | nullable for non-expiring long-lived |
| `credential_version` | int | optimistic concurrency |
| `last_error_code` | text | sanitized |
| `last_error_message_safe` | text | sanitized |
| `created_at` / `updated_at` | timestamptz | |

Constraints:

- `ACTIVE` requires non-empty ciphertext + `facebook_page_id` + `instagram_professional_account_id` + `identity_verified_at`
- Partial unique: one `ACTIVE` credential per `tenant_id` (v1)

### Binding: extend `channel_connections`

Add nullable FK:

```sql
meta_page_credential_id uuid null references meta_page_credentials(id) on delete set null
```

Invariant (application-enforced + check where possible): FACEBOOK and INSTAGRAM connections for same tenant referencing Meta must share the **same** `meta_page_credential_id` when both are CONNECTED.

### Channel status independence

Keep `channel_settings` per channel for:

- `enabled`, `configured`, `status` (READY/ERROR), `lastError`, `lastVerifiedAt`
- **Remove** `secret_json` usage for FB/IG access tokens after cutover (secrets empty; `configured` derived from binding + credential ACTIVE)

---

## Identity verification flow (before persistence)

New use case: `VerifyAndActivateMetaPageCredentialUseCase`

```text
1. ADMIN submits Page access token (UI only — never logged)
2. Graph: debug_token /me + Page node (token valid, not expired)
3. Graph: Page fields id, name, instagram_business_account{id,username}
4. Assert Page id matches operator expectation (if provided)
5. Assert IG account present and professional type
6. Assert granted_scopes ⊇ required set:
   - pages_messaging, pages_show_list, instagram_basic, instagram_manage_messages (exact list finalized in impl)
7. If any step fails → sanitized error; NO write; preserve existing credential
8. Encrypt token → upsert meta_page_credentials (version++)
9. Upsert/update channel_connections (FACEBOOK + INSTAGRAM) with shared meta_page_credential_id
10. Update channel_settings metadata; clear legacy plaintext secrets
11. Optional: run per-channel Test Connection (separate authorized step)
```

Reuse: `verifyFacebookChannelHealth`, `verifyInstagramChannelHealth`, `validateInstagramProfessionalIdentityRaw`, scope parsing from OAuth modules.

---

## Runtime resolver changes (implementation phase)

### New: `resolveMetaPageRuntimeCredential(tenantId, provider)`

```text
1. Load meta_page_credentials ACTIVE for tenant
2. Require encryption key configured
3. Decrypt access_token_ciphertext
4. If provider=FACEBOOK → return page token + facebook_page_id
5. If provider=INSTAGRAM → return same token + facebook_page_id + instagram_professional_account_id
6. On decrypt failure → throw MetaPageCredentialError (NO ENV fallback)
```

Wire into:

- `resolveFacebookWorkerOutboundConfig` — prefer Meta credential when binding present
- `resolveInstagramWorkerOutboundConfig` — **DB_ONLY only**; source = Meta credential; **remove** `loadEnvInstagramCredentials` path for Instagram
- `TestChannelConnectionUseCase` — load from Meta credential when bound

### Instagram ENV fallback removal

| Change | Detail |
| --- | --- |
| Worker default | `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_ONLY` (already production) |
| Code | Remove ENV branch from `resolveInstagramOutboundConfig` when Meta binding exists; long-term delete Instagram ENV reads in worker |
| Vercel | Document `FACEBOOK_PAGE_ACCESS_TOKEN` webhook-only; not outbound |

### Legacy Instagram path removal

| Item | Action |
| --- | --- |
| `PATCH secrets.accessToken` for INSTAGRAM | Return 400 with redirect to Meta connect API |
| `channel_settings.secret_json.access_token` | Cleared on cutover migration script |
| `instagram_oauth_credentials` short-lived path | Deprecate `INSTAGRAM_BUSINESS_LOGIN` for v1 cutover; keep table for future if needed, or mark read-only |

---

## Migration strategy (direct cutover — no repair)

New migration file (do **not** edit historical migrations):

```text
supabase/migrations/20260623120000_meta_cred_1a_meta_page_credentials.sql
```

Steps:

1. Create `meta_page_credentials` + enum + indexes
2. Add `channel_connections.meta_page_credential_id`
3. **Operator script** (separate authorized window): read current legacy READY token → verify → insert encrypted row → bind connections → clear legacy secrets
4. Deploy application code with new resolver
5. Set Railway `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_ONLY` (already set)
6. Set `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE=DB_ONLY` after Facebook bound to Meta credential
7. Remove obsolete UI fields (Instagram separate token input)

No `supabase migration repair`. No blind `DROP TABLE`.

---

## Security requirements mapping

| Requirement | Implementation |
| --- | --- |
| Encryption key required | `resolveChannelCredentialEncryptionKey` gate on write/decrypt |
| Missing/wrong key fails closed | Resolver throws; no ENV fallback |
| No plaintext new writes | Meta credential API only |
| No token in API responses | DTOs expose fingerprints + masked IDs only |
| No token in logs | Audit sink pattern from `instagramOAuthAudit` |
| No raw Meta response persisted | Store derived fields only |
| Masked IDs in evidence | `5418…len=15` style |
| ADMIN-only | `requireAuth(req, ["ADMIN"])` on connect/rotate endpoints |

---

## Failure behavior

| Scenario | Behavior |
| --- | --- |
| Verification fails | No persist; no binding activation; sanitized error |
| Partial write uncertainty | Transaction: credential + bindings + secret clear in one DB transaction |
| Decrypt fails at runtime | Fail delivery; sanitized operational error; **no ENV fallback** |
| Test Connection fails after write | Channel `lastError` set; credential may remain ACTIVE; operator re-auth |

---

## Tests (implementation phase)

| Test | File area |
| --- | --- |
| Valid Page + IG relationship accepted | `verifyAndActivateMetaPageCredential.test.ts` |
| Wrong Page rejected | identity mismatch |
| Wrong IG account rejected | identity mismatch |
| Missing permissions rejected | scope guard |
| Expired token rejected | Graph error mapping |
| Token encrypted at rest | repository round-trip |
| API never returns token | route contract tests |
| Facebook resolver uses shared credential | `resolveMetaPageRuntimeCredential.test.ts` |
| Instagram resolver uses shared credential | worker resolver tests |
| Instagram ENV fallback impossible | `resolveInstagramOutboundConfig` with Meta binding |
| FB/IG status independent | channel_settings update tests |
| Failure preserves previous credential | version conflict / rollback |
| Tenant isolation | cross-tenant read rejected |

Run before PR merge of implementation:

```text
npm run typecheck
npm run lint
npm test
npm run build
```

---

## UI / Setup Wizard impact

### Phase UI-1 (with backend)

- Replace Instagram "Access Token" field with **Connect Meta Page** card
- Facebook section shows same connected Page (read-only masked ids)
- Single "Reconnect Meta" action rotates shared credential
- Per-channel toggles: Enable Facebook / Enable Instagram (independent)
- Per-channel status badges from `channel_settings.status`

### Phase UI-2

- Setup Wizard: merge Facebook + Instagram Meta steps into one wizard step
- Hide legacy `app_secret` / `verify_token` where webhook uses platform-level secrets

---

## Implementation phases (post–plan approval)

| Phase | Deliverable |
| --- | --- |
| **1B** | Migration + domain types + repository |
| **1C** | `VerifyAndActivateMetaPageCredentialUseCase` + ADMIN API |
| **1D** | Worker/API resolver integration; ENV fallback removal |
| **1E** | Legacy path disable + cutover script + UI |
| **1F** | Test Connection + controlled smoke (separate authorization) |

---

## Prohibited-action attestation (this task)

| Action | Executed |
| --- | --- |
| Token in chat/git | **NO** |
| Migration repair | **NO** |
| Blind table drop | **NO** |
| ENV token fallback added | **NO** |
| Plaintext new write | **NO** |
| Unverified credential activation | **NO** |
| Remote credential change | **NO** |
| Migration executed | **NO** |
| Production smoke | **NO** |

---

## META-CRED-1A RESULT

```text
META-CRED-1A RESULT

Latest master SHA: 3a20708c2fbcd1617a67b73df0a71051a8040b32
Branch: feature/meta-cred-1a-unified-page-credential
Commit SHA: (set at commit)
PR: (set after gh pr create)

Selected credential source: C — meta_page_credentials (shared tenant Page record)

Schema changes: meta_page_credentials table; meta_page_credential_status enum;
  channel_connections.meta_page_credential_id FK (planned)

Migration files: 20260623120000_meta_cred_1a_meta_page_credentials.sql (planned, not committed)

Encryption reuse: channelCredentialEncryption.ts (HUBCHAT_CREDENTIAL_ENCRYPTION_KEY)

Identity verification flow: Graph token validity → Page id → IG business account →
  scopes → encrypt → atomic bind FACEBOOK+INSTAGRAM connections

Facebook binding: channel_connections(FACEBOOK).meta_page_credential_id
Instagram binding: channel_connections(INSTAGRAM).meta_page_credential_id (same id)

Legacy Instagram path removed: planned (PATCH token disabled; secret_json cleared on cutover)

Instagram ENV fallback removed: planned (code + DB_ONLY; remove loadEnvInstagramCredentials)

Setup Wizard/UI impact: single Connect Meta Page; per-channel enable/status retained

Tests: planned suite listed above; not run (no implementation yet)

Typecheck: N/A (plan-only)
Lint: N/A (plan-only)
Unit: N/A
Integration: N/A
Build: N/A
Secret scan: PASS (plan doc)

Remote credential changed: NO
Migration executed: NO
Production smoke executed: NO

Decision: READY FOR AGENT B REVIEW
```
