# META-CRED-1D — Verify-and-Activate API Implementation Plan

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-06-23 |
| Phase | META-CRED-1D (read-only audit + docs-only implementation plan) |
| Authorization | `GO META-CRED-1D VERIFY-AND-ACTIVATE API PLAN` |
| Base master SHA | `90623f578f244758390722824769533706a2f76b` |
| Foundation | META-CRED-1C merged (`7cb47adeb4b0a5f7fbd0d45a73a1e0a70f8a8093` on PR #283) |
| Foundation migration | `supabase/migrations/20260623120000_meta_cred_1c_shared_meta_page_credentials.sql` |
| Foundation migration applied remotely | **NO** |

## Executive summary

Implementation-ready plan for an **ADMIN-only verify-and-activate API** that performs **authoritative Meta Graph verification before any persistence**, encrypts the Page access token in application memory, and commits credential + binding state through a **single Postgres RPC transaction**. Instagram Login / `INSTAGRAM_BUSINESS_LOGIN` remains isolated in `instagram_oauth_credentials`. **`createVerifiedCredential` must not be callable from HTTP routes without a provider proof object.**

**Preferred route:** `POST /api/channel-connect/meta/verify-and-activate` (matches existing `channel-connect` convention).

**Preferred transaction:** Postgres RPC `activate_meta_page_credential_tx` (+ companion `rotate_meta_page_credential_tx`).

**Schema decision:** **ADDITIVE META-CRED-1D MIGRATION REQUIRED** for normalized scope/expiry metadata on `meta_page_credentials`.

**Dual-channel default:** `requestedChannels` is an exact contract — if both `FACEBOOK` and `INSTAGRAM` are requested and Instagram verification fails, **rollback entire activation** (no silent Facebook-only downgrade).

---

## Phase 1 — Repository baseline

| Check | Result |
| --- | --- |
| `HEAD` | `90623f578f244758390722824769533706a2f76b` |
| `origin/master` | `90623f578f244758390722824769533706a2f76b` |
| Working tree | **clean** |
| META-CRED-1C on master | **YES** |
| Foundation migration remote apply | **NO** |

---

## Phase 2 — Current code audit

### Reusable as-is

| Module | Capability |
| --- | --- |
| `src/infrastructure/adapters/channels/channelHealthCheck.ts` | `verifyFacebookChannelHealth`, `verifyInstagramChannelHealth` — Graph Page node lookup, Page→IG relationship probe, sanitized outcomes |
| `src/lib/sanitizeProviderError.ts` | Provider error sanitization for API responses |
| `src/lib/facebookOAuthConfig.ts` | `facebookOAuthScopes()`, `getRequiredFacebookPageTasks()` (`MESSAGING`), `readFacebookOAuthServerConfig()` (app ID, graph version) |
| `src/application/facebookOAuth/resolveOAuthPageSelectionTasks.ts` | Page task membership checks (`pageCandidateHasRequiredTasks`) |
| `src/application/facebookOAuth/facebookOAuthOperationalHealth.ts` | Multi-step Facebook health orchestration pattern (credential → page access → tasks → graph → runtime test) |
| `src/infrastructure/adapters/meta/facebookGraphOAuth.ts` | Graph client patterns, `FacebookGraphOAuthError`, OAuth token exchange, managed page listing with `tasks` |
| `src/lib/channelCredentialEncryption.ts` | AES-256-GCM v1 encrypt/decrypt, key resolution |
| `src/lib/channelSettingSecrets.ts` | `fingerprintSecretValue()` |
| `src/lib/metaPageCredentialValidation.ts` | Pre-validation shape checks (`IGA…` rejection) — **not authoritative** |
| `src/infrastructure/adapters/repositories/supabaseMetaPageCredentialRepository.ts` | Foundation CRUD, encryption, CAS updates — **not atomic across credential+bindings** |
| `src/application/usecases/testChannelConnection.ts` | Post-verify `channel_settings` health persistence pattern |
| `src/lib/instagramOAuthAudit.ts` | Sanitized audit event pattern (forbidden-key guard) |
| `src/interfaces/api/auth.ts` + `app/api/channel-connect/facebook/health/route.ts` | ADMIN-only route auth pattern |
| `supabase/schema.sql` | `acquire_idempotency_key` RPC pattern (reference only; activation needs tenant-scoped store) |

### Reusable with extraction

| Module | Extraction needed |
| --- | --- |
| `channelHealthCheck.ts` | Extract shared `readGraphErrorMessage`, timeout-bounded fetch wrapper, graph version normalization into `metaGraphClient.ts` |
| `facebookOAuthOperationalHealth.ts` | Extract `fetchFacebookPageProfile` + `readGraphFailure` into shared Meta Page inspector |
| `instagramAdapter.ts` | Extract `assertLikelyGraphPageAccessToken` heuristics as **pre-check only** (EA prefix, length) — not proof |
| `instagramIdentityValidation.ts` | Reuse ID/username validation helpers when normalizing IG Professional Account from Page node — **not** Instagram Login `/me` path |
| `verifyInstagramChannelHealth` | Refactor into `verifyPageInstagramBinding(pageId, token, expectedIgAccountId?)` returning normalized IG metadata |

### Must be new

| Component | Purpose |
| --- | --- |
| `MetaPageTokenInspector` | Authoritative `debug_token` + Page node verification for `META_PAGE_FACEBOOK_LOGIN` |
| `VerifiedMetaPageCredentialProof` | Opaque domain proof — only inspector + use case can construct |
| `VerifyAndActivateMetaPageCredentialUseCase` | Single orchestrator (provider → encrypt → RPC) |
| `activate_meta_page_credential_tx` RPC | Atomic credential + binding writes |
| `rotate_meta_page_credential_tx` RPC | Atomic rotation + binding version sync |
| `meta_page_credential_activation_requests` table | Tenant-scoped idempotency + response replay |
| `metaPageCredentialApiErrors.ts` | Stable API error codes + HTTP mapping |
| `metaPageCredentialAudit.ts` | Sanitized audit events |
| `POST /api/channel-connect/meta/verify-and-activate` route | ADMIN API entry |
| `POST /api/channel-connect/meta/rotate` route | Rotation entry (phase 1D-D) |

### Must not be reused

| Module | Reason |
| --- | --- |
| `fetchInstagramProfessionalIdentity` (`instagramProfessionalIdentity.ts`) | Instagram Login Graph host (`graph.instagram.com`) — wrong token family |
| `instagramOAuthConnectService` activation path | `INSTAGRAM_BUSINESS_LOGIN` OAuth only |
| `SupabaseInstagramOAuthCredentialRepository` | Separate credential system |
| `createVerifiedCredential` from HTTP layer | Bypasses provider verification |
| Prefix/shape checks alone (`IGA`, `EA` heuristics) | Not authoritative — pre-filter only |

### Token inspection / debug_token support

**Current state:** No `debug_token` implementation exists in the repository. META-CRED-1D-A must add it as the authoritative inspection step.

---

## Phase 3 — Authoritative credential-family verification

### Local pre-validation (non-authoritative)

1. Reject empty token
2. Reject known Instagram Login shapes (`IGA…`, `IG_…`) via `assertMetaPageFacebookLoginAccessTokenShape`
3. Optional heuristic: non-`EA` prefix → fail fast with `META_TOKEN_FAMILY_MISMATCH` **before** Graph call (still require `debug_token` for acceptance)

### Authoritative provider sequence

```text
1. Receive accessToken in memory (write-only HTTP body)
2. Local shape pre-check (fail fast)
3. GET /debug_token?input_token={token}&access_token={app_token}
   - type must indicate PAGE access token (not USER, not IG user token)
   - is_valid = true
   - app_id matches configured META_APP_ID
   - expires_at / data_access_expires_at captured (normalized)
   - granular_scopes / scopes captured (normalized, deduped, sorted)
4. Reject if debug_token indicates non-Page token family
5. GET /{page-id}?fields=id,name
   - confirm Page accessible with token
   - confirm Page id matches connection metadata / request expectation
6. If INSTAGRAM requested:
   GET /{page-id}?fields=instagram_business_account{id,username}
   - confirm IG Professional Account present
   - confirm id matches instagram_connection provider account expectation
   - validate account metadata via instagramIdentityValidation helpers
7. Verify required scopes ⊇ matrix (below)
8. Verify Page tasks ⊇ {MESSAGING} when Facebook messaging required
9. Build VerifiedMetaPageCredentialProof (normalized metadata only)
10. encryptChannelCredentialPlaintext in app memory
11. activate_meta_page_credential_tx RPC (ciphertext + proof metadata)
12. Post-RPC: update channel_settings health per activated channel (see Phase 15)
13. Clear token from request scope
```

**Invariant:** `IGA…` rejection does **not** prove another token is valid. Acceptance requires `debug_token` + Page accessibility.

---

## Phase 4 — Activation modes

### Facebook-only (`requestedChannels: ["FACEBOOK"]`)

| Requirement | Verification source |
| --- | --- |
| Token valid Page token | `debug_token` |
| App binding | `debug_token.app_id` |
| Page identity | Page node `id,name` |
| Facebook scopes | `debug_token` scopes |
| Page tasks | Page `tasks` or OAuth candidate pattern |
| Connection | `channel_connections` row `provider=FACEBOOK` |

**Result:** Facebook binding `ACTIVE`; no Instagram binding row; Instagram `channel_settings` unchanged.

### Facebook + Instagram (`requestedChannels: ["FACEBOOK","INSTAGRAM"]`)

All Facebook requirements plus:

| Requirement | Verification source |
| --- | --- |
| IG Professional Account | Page `instagram_business_account` |
| Relationship | Embedded on same Page node (authoritative for Page-token path) |
| IG identity match | Connection `provider_account_id` vs verified IG id |
| Instagram scopes | `debug_token` granular scopes for IG messaging |

**Result:** Both bindings `ACTIVE`, same `credential_id`, same `credential_version` snapshot on bindings.

### Dual-request partial failure (default contract)

```text
requestedChannels = exact contract

If both requested and Instagram verification fails:
→ full rollback
→ do NOT silently activate Facebook-only
```

Facebook-only downgrade requires explicit `requestedChannels: ["FACEBOOK"]`.

---

## Phase 5 — Scope matrix

Based on current product operations (`facebookOAuthScopes`, `getRequiredFacebookPageTasks`, legacy Page-token Instagram path, outbound adapters).

### Facebook outbound required scopes

| Scope | Required for activation |
| --- | --- |
| `pages_messaging` | **YES** |
| `pages_show_list` | **YES** |
| `pages_read_engagement` | **YES** (inbox/webhook context) |
| `pages_manage_metadata` | **YES** (webhook/subscription maintenance) |

### Facebook inbound / webhook-related scopes

| Scope | Required |
| --- | --- |
| `pages_manage_metadata` | **YES** (subscription management) |
| `pages_read_engagement` | **YES** (comment/reaction context) |

### Instagram DM (Page-token path) required scopes

| Scope | Required when IG binding requested |
| --- | --- |
| `instagram_basic` | **YES** |
| `instagram_manage_messages` | **YES** |
| `pages_show_list` | **YES** (Page→IG discovery) |
| `pages_read_engagement` | **YES** |

### Instagram comment / private-reply

Covered by same Page token + IG messaging permissions in v1 activation (no separate scope set in 1D).

### Health-check-only scopes

None additional beyond activation matrix for v1.

### Optional scopes

| Scope | Behavior if missing |
| --- | --- |
| `business_management` | Optional — do not block activation |
| `pages_read_user_content` | Optional |

### Error behavior

| Condition | Error code | Channel hint |
| --- | --- | --- |
| Missing required scope | `META_SCOPE_MISSING` | `facebook` or `instagram` in response |
| Missing optional scope | Activation proceeds; store granted set |
| Declined scope | `META_SCOPE_MISSING` | sanitized list of missing required |
| Scope removed post-activation | Future health job — out of 1D scope |
| Page task `MESSAGING` missing | `META_PAGE_NOT_ACCESSIBLE` | facebook |

Granular Page task mismatch: use `pageCandidateHasRequiredTasks` pattern against Page `tasks` field when available.

---

## Phase 6 — Verified metadata persistence

### 1C schema review

Present on `meta_page_credentials`:

```text
provider_app_id, facebook_page_id, instagram_professional_account_id
verified_at, last_verified_at, credential_version, token_fingerprint
```

### Gaps for safe activation and proactive health

| Field | Needed | Reason |
| --- | --- | --- |
| `granted_scopes text[]` | **YES** | Scope drift detection, health UI |
| `token_expires_at timestamptz` | **YES** | Expiry policy |
| `data_access_expires_at timestamptz` | **YES** | Meta data-access horizon |
| `provider_token_type text` | **YES** | Store normalized `PAGE` from debug_token |
| `verification_version smallint` | **YES** | Inspector algorithm versioning |
| `provider_user_or_owner_id` | **NO** (v1) | Not required for Page-token resolver |

### Decision

```text
ADDITIVE META-CRED-1D MIGRATION REQUIRED
```

Planned migration (not created in this task):

```text
20260624120000_meta_cred_1d_credential_verification_metadata.sql
```

Contents: `ALTER TABLE meta_page_credentials ADD COLUMN IF NOT EXISTS …` only; no destructive DDL.

**Persistence rules:**

- Normalize scopes: lowercase, dedupe, sort
- Never persist raw `debug_token` JSON
- Never persist provider user names beyond existing nullable IG id fields

---

## Phase 7 — API contract

### Route

```text
POST /api/channel-connect/meta/verify-and-activate
POST /api/channel-connect/meta/rotate          (phase 1D-D)
GET  /api/channel-connect/meta/status          (future; sanitized DTO)
```

### Auth

- `requireAuth(req, ["ADMIN"])` only
- Tenant derived from authenticated sales agent — **never** from request body

### Request (write-only token)

```json
{
  "accessToken": "<write-only>",
  "facebookConnectionId": "<uuid>",
  "instagramConnectionId": "<uuid|null>",
  "requestedChannels": ["FACEBOOK", "INSTAGRAM"],
  "expectedCredentialVersion": 0,
  "idempotencyKey": "<opaque, max 128>"
}
```

| Rule | Enforcement |
| --- | --- |
| `accessToken` write-only | Never in response/logs |
| Connection IDs tenant-scoped | Repository + RPC FK checks |
| Connection provider match | `FACEBOOK` / `INSTAGRAM` |
| `requestedChannels` explicit | Validate ⊆ {FACEBOOK, INSTAGRAM} |
| `instagramConnectionId` required iff INSTAGRAM requested | 400 if missing |
| `expectedCredentialVersion` | `0` = initial create; `N` = rotate/update CAS |
| `idempotencyKey` | Bounded length; tenant-scoped store |

### Response (sanitized)

```json
{
  "credentialId": "<uuid>",
  "credentialVersion": 1,
  "facebook": { "status": "READY", "connectionId": "<uuid>" },
  "instagram": { "status": "READY", "connectionId": "<uuid>" },
  "verifiedAt": "<iso8601>"
}
```

**Must not return:** token, ciphertext, raw Graph payload, full Page/IG identifiers (mask in UI contract if needed), scopes unless product explicitly needs them in v1 (default: omit).

### Feature flag gate

When `HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_ENABLED` is not `true` or DB objects missing:

```text
HTTP 503 — controlled unavailable response
```

---

## Phase 8 — Single-use-case invariant

### Orchestrator

```text
VerifyAndActivateMetaPageCredentialUseCase
```

### Bypass prevention (recommended: Option D)

```text
Provider verifier
  → VerifiedMetaPageCredentialProof (opaque, frozen)
  → MetaPageCredentialActivationPort.activate(proof, encryptedCiphertext, …)
  → RPC only
```

- Move `createVerifiedCredential` behind `MetaPageCredentialActivationPort`
- Export proof constructor only from `application/metaPage/verifyMetaPageCredentialWithProvider.ts`
- Repository port accepts `VerifiedMetaPageCredentialProof` — HTTP routes cannot call without verifier
- `SupabaseMetaPageCredentialRepository.createVerifiedCredential` becomes `internal` / deprecated for external callers

---

## Phase 9 — Atomic database activation

### Problem

Current `SupabaseMetaPageCredentialRepository` issues separate Supabase calls — **not** atomic for credential + multiple bindings.

### Selected design: Postgres RPC

```sql
activate_meta_page_credential_tx(
  p_tenant_id uuid,
  p_encrypted_access_token text,
  p_token_fingerprint text,
  p_provider_app_id text,
  p_facebook_page_id text,
  p_instagram_professional_account_id text,
  p_granted_scopes text[],
  p_token_expires_at timestamptz,
  p_data_access_expires_at timestamptz,
  p_provider_token_type text,
  p_verification_version smallint,
  p_expected_credential_version int,
  p_facebook_connection_id uuid,
  p_instagram_connection_id uuid,
  p_requested_channels text[],
  p_verified_at timestamptz
) returns jsonb
```

### RPC steps (single transaction)

```text
1. Validate tenant owns connection rows (FOR UPDATE)
2. Validate connection providers match requested channels
3. If expected_version = 0: insert new credential (or upsert per tenant ACTIVE policy)
   Else: UPDATE … WHERE credential_version = expected (CAS)
4. Deactivate prior bindings for connections when superseding
5. INSERT/UPDATE Facebook binding ACTIVE with credential_version snapshot
6. INSERT/UPDATE Instagram binding when requested
7. Assert binding credential_version = credential.credential_version
8. COMMIT → return { credentialId, credentialVersion, bindings[] }
```

### Invariants after successful response

| Invariant | Enforced |
| --- | --- |
| Credential without requested bindings | **IMPOSSIBLE** |
| FB ACTIVE + IG failed when both requested | **IMPOSSIBLE** |
| Binding version ≠ credential version | **IMPOSSIBLE** |

### Provider calls

**Outside** DB transaction — sequence: all Graph calls → encrypt → short RPC only.

---

## Phase 10 — RPC security

| Control | Plan |
| --- | --- |
| `SECURITY DEFINER` | Only if required for service role; set `search_path = public` |
| `REVOKE ALL ON FUNCTION … FROM PUBLIC` | **YES** |
| Grant execute | service role / supabase service only |
| Tenant validation | `p_tenant_id` must match all connection rows |
| Dynamic SQL | **Prohibited** |
| Return value | IDs, versions, statuses — **no ciphertext** |
| Plaintext in RPC | **Never** — app passes ciphertext only |

**Preferred flow:** App verifies → app encrypts → RPC receives ciphertext + normalized metadata.

---

## Phase 11 — Idempotency

### Store

New table `meta_page_credential_activation_requests`:

```text
tenant_id, idempotency_key (unique per tenant)
request_fingerprint (sha256 of normalized non-secret inputs + token_fingerprint)
response_json (sanitized success payload)
credential_id, credential_version
status (PROCESSING | COMPLETED | FAILED)
created_at, completed_at
```

### Behavior

| Case | Result |
| --- | --- |
| Same tenant + key + fingerprint | Return stored `response_json` |
| Same key, different fingerprint | `META_ACTIVATION_CONFLICT` (409) |
| Timeout after commit | Retry returns same result |
| Processing lock | 409 or 202 with retry guidance |

**Fingerprint inputs:** tenantId, connectionIds, requestedChannels, expectedVersion, tokenFingerprint — **not** plaintext token.

Existing `idempotency_keys` RPC is global-scope — **not** sufficient alone for tenant-scoped activation replay.

---

## Phase 12 — CAS and concurrent ADMIN requests

| Scenario | Handling |
| --- | --- |
| Two simultaneous activations | Partial unique on ACTIVE credential per tenant → one wins; other gets `META_ACTIVATION_CONFLICT` or `META_CREDENTIAL_VERSION_CONFLICT` |
| Rotation during activation | RPC `FOR UPDATE` on credential row; stale version → `META_CREDENTIAL_VERSION_CONFLICT` |
| Stale `expectedCredentialVersion` | Zero-row update → conflict; no mutation |
| Credential revoked mid-flight | RPC re-checks status before write |
| Connection deleted mid-flight | FK failure → rollback |
| Connection provider changed | Pre-lock validation → `META_CONNECTION_TYPE_MISMATCH` |

```text
WHERE credential_version = p_expected_credential_version
```

No last-write-wins.

---

## Phase 13 — Rotation design

### Selected model: **Update same credential row** (Option A)

Rationale: 1C schema enforces one ACTIVE credential per tenant; bindings reference `credential_id`; simpler audit than rebind to new row.

### Atomic rotation RPC

```text
rotate_meta_page_credential_tx(
  p_tenant_id, p_credential_id,
  p_encrypted_access_token, p_token_fingerprint,
  p_granted_scopes, p_token_expires_at, p_data_access_expires_at,
  p_expected_credential_version,
  p_verified_at
)
```

Steps:

```text
1. Lock credential FOR UPDATE
2. CAS version N → N+1
3. Update ciphertext + fingerprint + expiry metadata
4. UPDATE all ACTIVE bindings SET credential_version = N+1
5. COMMIT
```

### Failure

Provider/encryption/RPC failure → version N and bindings remain active.

---

## Phase 14 — Prior credential preservation

| Failure point | DB mutation |
| --- | --- |
| Provider verification | **None** |
| Encryption | **None** |
| RPC | **Full rollback** |
| Binding conflict | **Full rollback** |
| Post-RPC channel_settings update failure | Compensating: return error but credential active — **avoid** by ordering channel_settings update before declaring success, or include in follow-up health call with explicit `PARTIAL` handling (prefer: health update failure → return 500 with credential committed + ops alert; document in runbook) |

**Do not modify during 1D:**

```text
channel_settings.secret_json
channel_credentials
instagram_oauth_credentials
ENV credentials
```

---

## Phase 15 — Channel status update boundary

### Recommendation: **Hybrid B+**

```text
RPC: credential + bindings only (no channel_settings)

Use case after successful RPC:
  For each activated channel:
    decrypt credential (internal)
    run verifyFacebookChannelHealth / verifyInstagramChannelHealth equivalent
    update channel_settings.status + last_verified_at via existing repository

If post-RPC health fails:
  Return HTTP 500 META_ACTIVATION_FAILED
  Credential/bindings remain (verified at provider layer)
  channel_settings stays non-READY
```

Avoid reporting `READY` in API response unless binding exists **and** post-RPC health succeeded.

**Do not** hold DB transaction during provider calls.

---

## Phase 16 — Sanitized API errors

| Code | HTTP | When |
| --- | --- | --- |
| `META_TOKEN_INVALID` | 400 | debug_token invalid |
| `META_TOKEN_FAMILY_MISMATCH` | 400 | Non-Page token family |
| `META_APP_MISMATCH` | 400 | debug_token app_id ≠ config |
| `META_PAGE_NOT_ACCESSIBLE` | 400 | Page node inaccessible |
| `META_PAGE_IDENTITY_MISMATCH` | 400 | Page id ≠ connection expectation |
| `META_IG_ACCOUNT_NOT_FOUND` | 400 | No IG on Page when requested |
| `META_IG_IDENTITY_MISMATCH` | 400 | IG id ≠ connection |
| `META_SCOPE_MISSING` | 400 | Required scope absent |
| `META_TOKEN_EXPIRED` | 400 | expires_at in past |
| `META_TOKEN_EXPIRY_TOO_NEAR` | 400 | data_access within threshold |
| `META_CONNECTION_NOT_FOUND` | 404 | Connection not in tenant |
| `META_CONNECTION_TYPE_MISMATCH` | 400 | Wrong provider |
| `META_CREDENTIAL_VERSION_CONFLICT` | 409 | CAS failure |
| `META_ACTIVATION_CONFLICT` | 409 | Idempotency / binding conflict |
| `META_ENCRYPTION_UNAVAILABLE` | 503 | Key missing/invalid |
| `META_ACTIVATION_FAILED` | 500 | RPC or post-RPC health failure |

Never include: token, Authorization header, raw Graph body, app secret, encryption key, ciphertext, stack traces.

---

## Phase 17 — Provider timeout and retry

| Parameter | Value |
| --- | --- |
| Per-request timeout | 15s (align with `instagramProfessionalIdentity`) |
| Max response bytes | 64KB |
| Retries | Up to 2 on network error, HTTP 5xx, 429 |
| No retry | 400, 401, 403, deterministic permission/identity errors |
| Correlation ID | Generate per activation; include in audit, not in client error body |
| DB transaction | **Only after** all provider calls complete |

---

## Phase 18 — Audit logging

Mirror `instagramOAuthAudit.ts` pattern.

| Event | When |
| --- | --- |
| `META_PAGE_CREDENTIAL_ACTIVATED` | Successful activation |
| `META_PAGE_CREDENTIAL_ROTATED` | Successful rotation |
| `META_PAGE_CREDENTIAL_ACTIVATION_FAILED` | Sanitized failure |

Allowed metadata: tenantId, actorUserId, credentialId, connectionIds, credentialVersion, requestedChannels, resultCode, tokenFingerprint (if policy permits), timestamp.

Forbidden: token, ciphertext, raw provider response.

---

## Phase 19 — Migration dependency and rollout

```text
1. Merge META-CRED-1D code (after Agent B review) — separate PRs per sub-phase
2. GO META-CRED DATABASE MIGRATION — apply 1C foundation migration
3. GO META-CRED DATABASE MIGRATION — apply 1D additive metadata + RPC migration
4. Deploy API with HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_ENABLED=false
5. Schema verification gate
6. Enable flag for controlled ADMIN test only
```

### Missing-table behavior

```text
Flag OFF → 503 unavailable
Flag ON + missing relation → 503 with sanitized code (fail closed)
Runtime resolvers unchanged — no reads of meta_page_* tables
```

---

## Phase 20 — Feature flags

| Flag | Default | Runtime |
| --- | --- | --- |
| `HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_ENABLED` | `false` | Vercel API |
| `HUBCHAT_META_PAGE_CREDENTIAL_ROTATION_ENABLED` | `false` | Vercel API |

Worker/Railway: **not required** for 1D (activation is API-only). Resolver flags remain separate (META-CRED-1E).

---

## Phase 21 — Test plan summary

| Area | Key cases |
| --- | --- |
| Auth | ADMIN allow; MANAGER/SALES/unauth deny; cross-tenant connections rejected |
| Provider | Valid Page token; invalid/expired; app mismatch; wrong Page; missing scopes; IG absent/mismatch; IGA rejected; non-IGA invalid token rejected by debug_token |
| Atomicity | FB-only commit; dual commit; IG fail rolls back all; stale version; connection race; idempotent retry |
| Rotation | Version++; bindings synced; stale rejected; failure preserves old |
| Security | No token in logs/response; RPC permissions; flag default off |
| Regression | Facebook/Instagram/LINE runtime unchanged; no resolver reads new tables |

---

## Phase 22 — Implementation phases

| Phase | Scope |
| --- | --- |
| **META-CRED-1D-A** | `MetaPageTokenInspector`, `VerifiedMetaPageCredentialProof`, scope/expiry normalization |
| **META-CRED-1D-B** | Additive migration + `activate_meta_page_credential_tx` + `rotate_meta_page_credential_tx` + activation port |
| **META-CRED-1D-C** | ADMIN verify-and-activate route + use case + idempotency table |
| **META-CRED-1D-D** | Rotation route |
| **META-CRED-1D-E** | Independent Agent B review and merge |

---

## Phase 23 — Future authorization gates

```text
GO META-CRED-1D PROVIDER VERIFICATION CODE
GO META-CRED-1D TRANSACTION RPC IMPLEMENTATION
GO META-CRED-1D API ROUTE IMPLEMENTATION
GO META-CRED-1D ROTATION IMPLEMENTATION
GO META-CRED DATABASE MIGRATION
```

**None authorized by this planning task.**

---

## Prohibited-action attestation

| Action | Executed |
| --- | --- |
| API implementation | **NO** |
| Provider call with real token | **NO** |
| Migration file created | **NO** |
| Migration executed | **NO** |
| Credential import/write | **NO** |
| ENV change | **NO** |
| Resolver cutover | **NO** |
| UI change | **NO** |
| Legacy cleanup | **NO** |
| Outbound operation | **NO** |

---

## META-CRED-1D VERIFY-AND-ACTIVATE API PLAN RESULT

```text
META-CRED-1D VERIFY-AND-ACTIVATE API PLAN RESULT

Base master SHA: 90623f578f244758390722824769533706a2f76b
Branch: docs/meta-cred-1d-verify-activate-api-plan
Commit SHA: (set at commit)
PR: (set after gh pr create)

Current code audit:
- Reusable Facebook verifier: verifyFacebookChannelHealth + facebookOAuthOperationalHealth patterns
- Reusable Instagram verifier: verifyInstagramChannelHealth (Page-token path only)
- Token inspection/debug support: NOT PRESENT — must be new (debug_token)
- Scope verification: facebookOAuthScopes + page tasks — needs debug_token granular scopes
- App binding verification: readFacebookOAuthServerConfig appId — needs debug_token match
- Encryption helper: channelCredentialEncryption.ts (reuse)
- Repository foundation: SupabaseMetaPageCredentialRepository (non-atomic; wrap with RPC)

Provider verification:
- Authoritative family verification: debug_token type=PAGE + reject IG Login
- Token validity: debug_token is_valid
- App ID verification: debug_token app_id vs META_APP_ID
- Page identity verification: Graph Page node id/name
- Instagram identity verification: Page instagram_business_account + connection match
- Page/IG relationship verification: embedded Page node field
- Scope verification: normalized granted_scopes vs matrix
- Expiry policy: reject expired; reject data_access within configurable horizon
- Provider timeout/retry: 15s timeout; 2 retries on transient only

Activation modes:
- Facebook-only: supported via requestedChannels=[FACEBOOK]
- Facebook+Instagram: both bindings same credential
- Dual-request partial failure behavior: full rollback (no silent downgrade)

API:
- Route: POST /api/channel-connect/meta/verify-and-activate
- Auth roles: ADMIN only
- Secret write-only: YES
- Request contract: defined above
- Response contract: sanitized IDs/status/version
- Idempotency: meta_page_credential_activation_requests table
- Error mapping: stable META_* codes
- Feature flag: HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_ENABLED default OFF

Atomicity:
- Selected transaction design: Postgres RPC
- RPC required: YES
- Credential create atomic: YES (within RPC)
- Dual binding atomic: YES (within RPC)
- Binding version synchronized: YES (RPC step)
- CAS/version guard: YES
- Prior credential preserved: YES on failure
- Connection race handling: FOR UPDATE + FK rollback

Rotation:
- Selected model: same credential row version increment
- Version update: CAS N→N+1
- Binding version update: all ACTIVE bindings in same RPC
- Rollback behavior: full preserve on failure

Schema:
- Foundation migration dependency: 1C must apply first
- Additional fields required: granted_scopes, token_expires_at, data_access_expires_at, provider_token_type, verification_version
- Additive migration required: YES (planned, not created)
- RPC migration required: YES (planned, not created)
- Granted scopes persistence: YES
- Expiry persistence: YES

Security:
- Plaintext DB write: NO (app encrypts; RPC stores ciphertext)
- Raw provider payload persistence: NO
- Secret logging: NO
- RPC permissions: REVOKE PUBLIC; service role only
- RLS/service-role assumptions: same as 1C — service role path only
- Sanitized audit: YES (new metaPageCredentialAudit module)

Rollout:
- Flags default: OFF
- DB-before-API ordering: foundation migration → 1D migration → deploy API → enable flag
- Missing-table behavior: 503 fail closed
- Runtime resolver affected: NO
- Existing credentials preserved: YES

Implementation phases:
- 1D-A: provider verification + proof types
- 1D-B: RPC + activation port
- 1D-C: ADMIN API route
- 1D-D: rotation API
- 1D-E: independent review

Future authorization gates:
- Provider verification: GO META-CRED-1D PROVIDER VERIFICATION CODE
- RPC implementation: GO META-CRED-1D TRANSACTION RPC IMPLEMENTATION
- API route: GO META-CRED-1D API ROUTE IMPLEMENTATION
- Rotation: GO META-CRED-1D ROTATION IMPLEMENTATION
- Database migration: GO META-CRED DATABASE MIGRATION

Remote DB migration executed: NO
Migration file created: NO
Credential changed: NO
ENV changed: NO
Resolver cutover executed: NO
Legacy plaintext cleaned: NO
Outbound operation executed: NO

Decision: READY FOR AGENT B REVIEW

Recommended next gate: META-CRED-1D-B INDEPENDENT API PLAN REVIEW

Operational state: HOLD — NO DATABASE MIGRATION EXECUTION OR CREDENTIAL CUTOVER
```
