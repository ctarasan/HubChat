# META-CRED-1D-A — Authoritative Meta Page Provider Verification and Proof Types

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-06-23 |
| Phase | META-CRED-1D-A (provider verification code) |
| Authorization | `GO META-CRED-1D-A PROVIDER VERIFICATION CODE` |
| Base master SHA | `6d4e65def8f5d5aaa0123597e323ca80dac66e22` |
| Branch | `feature/meta-cred-1d-a-provider-verification` |
| Commit SHA | `b17a8bdeea025fd37853a73e9de7e218f44b9c5b` |
| PR | _filled at PR creation_ |
| Prior plan | META-CRED-1D merged (`eeccb7144a7f87383a8d5a0ae670d28cb7367da0` on PR #284) |
| Foundation | META-CRED-1C (`7cb47adeb4b0a5f7fbd0d45a73a1e0a70f8a8093` on PR #283) |
| Foundation migration applied remotely | **NO** |

## Executive summary

Inert provider verification stack for Meta Page credentials (`META_PAGE_FACEBOOK_LOGIN`): authoritative `debug_token` inspection, Facebook Page identity verification, optional Instagram Professional Account relationship verification (Page-token path only), centralized scope/expiry policy, opaque verified-proof type, sanitized domain errors, and mock-only tests. Stops at proof return — no encrypt, persist, RPC, API route, resolver, or UI wiring.

## Current-code reuse audit

| Module | Classification | Notes |
| --- | --- | --- |
| `verifyFacebookChannelHealth` / `verifyInstagramChannelHealth` | **REUSE AS-IS** (patterns) | Page node + IG relationship probe patterns informed identity verifiers; not imported at runtime |
| `facebookOAuthOperationalHealth` | **REUSE AS-IS** (orchestration pattern) | Multi-step verification sequence mirrored in use case |
| `facebookOAuthConfig` | **REUSE AS-IS** | `facebookOAuthScopes()`, `getRequiredFacebookPageTasks()` sourced into scope policy |
| `resolveOAuthPageSelectionTasks` | **REUSE AS-IS** (via config) | Page task requirements via `getRequiredFacebookPageTasks()` |
| `facebookGraphOAuth` | **EXTRACT/REFACTOR SAFELY** | New bounded `MetaGraphHttpClient`; OAuth exchange not reused |
| `instagramIdentityValidation` / `instagramProfessionalIdentity` | **MUST NOT REUSE** | `graph.instagram.com` Instagram Login path isolated |
| `FacebookAdapter` / `InstagramAdapter` | **MUST NOT REUSE** | Outbound adapters not wired |
| `sanitizeProviderError` | **REUSE AS-IS** | HTTP client error messages |
| `channelCredentialEncryption.ts` | **MUST NOT REUSE** (this phase) | No encrypt/persist in 1D-A |
| `metaPageCredentialValidation.ts` | **REUSE AS-IS** | Local `IGA…` / `IG_…` pre-check only; provider remains authoritative |
| `SupabaseMetaPageCredentialRepository` | **MUST NOT REUSE** (this phase) | No repository writes |
| `fingerprintSecretValue` | **REUSE AS-IS** | Proof metadata fingerprint |

## Scope policy

Centralized in `src/lib/metaPageCredentialScopes.ts`:

| Constant | Source / purpose |
| --- | --- |
| `FACEBOOK_REQUIRED_SCOPES` | `facebookOAuthScopes()` — Page messaging, discovery, engagement, metadata |
| `FACEBOOK_OPTIONAL_SCOPES` | `business_management`, `pages_read_user_content` |
| `INSTAGRAM_REQUIRED_SCOPES` | `instagram_basic`, `instagram_manage_messages`, `pages_show_list`, `pages_read_engagement` — IG DM + Page linkage |
| `INSTAGRAM_OPTIONAL_SCOPES` | _(none)_ |
| `META_PAGE_REQUIRED_FACEBOOK_TASKS` | `getRequiredFacebookPageTasks()` — `MESSAGING` task for Page access |

Normalization: trim, lowercase, deduplicate, deterministic sort; invalid/empty entries rejected.

## Deliverables

| Area | Artifact |
| --- | --- |
| Domain ports/errors | `src/domain/metaPageCredentialVerification.ts`, `metaPageCredentialVerificationErrors.ts` |
| Scope policy | `src/lib/metaPageCredentialScopes.ts` |
| Expiry policy | `src/lib/metaPageCredentialExpiryPolicy.ts` (7-day near-expiry horizon) |
| Serialization safety | `src/lib/metaPageCredentialVerificationSerialization.ts` |
| App token helper | `src/lib/metaPageCredentialProviderConfig.ts` |
| HTTP client | `src/infrastructure/adapters/meta/metaGraphHttpClient.ts` |
| Token inspector | `src/infrastructure/adapters/meta/metaPageTokenInspector.ts` |
| Page identity | `src/infrastructure/adapters/meta/metaPageIdentityVerifier.ts` |
| IG relationship | `src/infrastructure/adapters/meta/metaInstagramRelationshipVerifier.ts` |
| Use case | `src/application/metaPageCredentialVerification/verifyMetaPageCredential.ts` |
| Opaque proof | `src/application/metaPageCredentialVerification/verifiedMetaPageCredentialProofFactory.ts` |
| Tests | 41 focused + full regression |

## Provider HTTP safety

| Control | Value |
| --- | --- |
| Timeout | 15 seconds |
| Response cap | 64 KB |
| Max retries | 2 (transient network, timeout, 5xx, bounded 429) |
| No retry | Invalid token, app mismatch, scope/page/IG mismatch, expired, malformed JSON |

## Scope isolation attestation

| Path | Changed |
| --- | --- |
| `supabase/migrations/*` | NO |
| Activation/rotation RPC | NO |
| `app/api/channel-connect/meta/*` | NO |
| Facebook/Instagram resolvers | NO |
| Worker / webhooks | NO |
| Channel Settings / Setup Wizard | NO |
| Test Connection routes | NO |
| ENV files | NO |

## Verification

| Command | Result |
| --- | --- |
| `git diff --check` | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| Focused provider-verifier tests | PASS (41/41) |
| `npm test` | PASS (2347/2347) |
| `npm run build` | PASS |
| Hidden/bidi scan (changed files) | PASS |
| Secret scan (changed files) | PASS |
| Migration duplicate scan | PASS (no new migration; wiring test) |
| Runtime wiring scan | PASS (`metaPageCredentialVerificationWiring.test.ts`) |
| Raw-token fixture scan | PASS (placeholder tokens only in tests) |
| Real provider token used | **NO** |

## Prohibited-action attestation

| Action | Executed |
| --- | --- |
| Remote DB migration | NO |
| Credential import/write | NO |
| Resolver cutover | NO |
| Legacy plaintext cleanup | NO |
| Outbound operation | NO |
| ENV change | NO |
| API route | NO |

## META-CRED-1D-A PROVIDER VERIFICATION RESULT

```text
META-CRED-1D-A PROVIDER VERIFICATION RESULT

Base master SHA: 6d4e65def8f5d5aaa0123597e323ca80dac66e22
Branch: feature/meta-cred-1d-a-provider-verification
Commit SHA: b17a8bdeea025fd37853a73e9de7e218f44b9c5b
PR: _filled at PR creation_

Current-code reuse:
- Facebook verifier reuse: channelHealthCheck patterns + facebookOAuthConfig scopes/tasks
- Instagram Page relationship reuse: Page-node instagram_business_account path (not Instagram Login)
- Scope/task reuse: facebookOAuthScopes + getRequiredFacebookPageTasks
- Provider HTTP client reuse: new MetaGraphHttpClient with sanitizeProviderError
- Sanitizer reuse: sanitizeProviderError.ts

Provider inspector:
- Authoritative token inspection: debug_token via GraphMetaPageTokenInspector
- Provider token type verification: PAGE type required; USER/others rejected
- App ID verification: inspected app_id vs expectedAppId; META_APP_MISMATCH
- Validity verification: is_valid === true
- Expiry verification: token + data-access with 7-day horizon
- Data-access expiry: evaluated before proof; inconsistent timestamps rejected
- Timeout: 15s
- Response cap: 64 KB
- Retry policy: max 2 on transient only

Scope policy:
- Facebook required: pages_show_list, pages_messaging, pages_read_engagement, pages_manage_metadata
- Facebook optional: business_management, pages_read_user_content
- Instagram required: instagram_basic, instagram_manage_messages, pages_show_list, pages_read_engagement
- Instagram optional: none
- Normalization: trim/dedupe/sort lowercase

Identity verification:
- Facebook Page: GraphMetaPageIdentityVerifier id+tasks match
- Page tasks/access: MESSAGING required
- Instagram optional: skipped when requestedChannels=[FACEBOOK]
- Page/IG relationship: GraphMetaInstagramRelationshipVerifier on same Page token
- Dual-request failure: full reject (META_IG_*); no silent Facebook-only downgrade

Proof:
- Type: VerifiedMetaPageCredentialProof (opaque)
- Construction restricted: VERIFIED_META_PAGE_PROOF_FACTORY symbol gate
- Credential family: META_PAGE_FACEBOOK_LOGIN
- Normalized metadata: app/page/IG/scopes/expiry/fingerprint
- Plaintext serialization: excluded from metadata JSON; consumeAccessToken callback only
- Raw response persistence: none
- Public DTO safety: forbidden-key guards + assertProofJsonExcludesSecrets

Errors:
- Stable codes: META_TOKEN_*, META_APP_MISMATCH, META_PAGE_*, META_IG_*, META_SCOPE_MISSING, META_PROVIDER_*
- Retryable classification: provider timeout/unavailable retryable; deterministic failures not
- Provider sanitization: sanitizeProviderError + URL param redaction helper
- Secret-safe serialization: toPublicJson / proof DTO guards

Scope isolation:
- Migration created: NO
- RPC implemented: NO
- API route implemented: NO
- Repository write called: NO
- Credential persisted: NO
- Resolver wired: NO
- UI changed: NO
- ENV changed: NO

Verification:
- Focused tests: 41/41 PASS
- Full tests: 2347/2347 PASS
- Typecheck: PASS
- Lint: PASS
- Build: PASS
- git diff --check: PASS
- Hidden/bidi scan: PASS
- Secret scan: PASS
- Runtime wiring scan: PASS
- Real provider token used: NO

Remote migration executed: NO
Credential changed: NO
Resolver cutover executed: NO
Legacy plaintext cleaned: NO
Outbound operation executed: NO

Decision: READY FOR AGENT B REVIEW

Recommended next gate: META-CRED-1D-A-B INDEPENDENT PROVIDER VERIFICATION REVIEW

Operational state: HOLD — NO DATABASE MIGRATION EXECUTION OR CREDENTIAL CUTOVER
```
