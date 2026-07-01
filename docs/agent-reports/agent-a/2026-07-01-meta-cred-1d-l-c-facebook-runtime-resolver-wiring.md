# META-CRED-1D-L-C — Facebook Meta Page Runtime Resolver Wiring

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-07-01 |
| Phase | META-CRED-1D-L-C (runtime resolver wiring — code and tests only) |
| Authorization | Facebook-only runtime resolver wiring for future separately authorized cutover |
| Base master SHA | `82de0e46ff3d8683b2cc41d8f12d93c976e75349` |
| Branch | `feature/meta-cred-1d-l-c-facebook-runtime-resolver` |
| Commit SHA | `492f654fa20f80101eac4e9498d9b57b42604ea5` |
| PR | [#300](https://github.com/ctarasan/HubChat/pull/300) |

## Executive summary

Implements Facebook-only Meta Page credential runtime resolver wiring behind **`HUBCHAT_META_PAGE_CREDENTIAL_ENABLED`** (default **OFF**). When the flag is absent or not exactly `"true"`, production behavior is unchanged: Facebook outbound continues through the legacy Channel Connect / ENV path. When the flag is ON, managed Facebook connections (any `meta_page_credential_bindings` row for tenant + `channel_connection_id`) resolve through META-CRED; invalid managed state fails closed with no Channel Connect or ENV fallback. Unmanaged connections (zero binding rows) continue through Channel Connect when distinguishable.

**No production changes occurred** — flag not enabled anywhere, no activation replay, no token access, no deploy, no cutover.

**Decision: READY FOR INDEPENDENT REVIEW** (not READY FOR CUTOVER)

---

## 1. Repository sync

| Check | Result |
| --- | --- |
| Branch | `feature/meta-cred-1d-l-c-facebook-runtime-resolver` |
| Base SHA | `82de0e46ff3d8683b2cc41d8f12d93c976e75349` |
| Tracked working tree at start | **CLEAN** |
| Allowed untracked (excluded from commit) | `.pr-body-meta-cred-1d-*.md`, `docs/agent-reports/agent-a/2026-06-30-meta-cred-1d-o-a-*.md`, `long givity.txt`, `supabase/.temp/` |

---

## 2. Architecture — before / after

### Before (production today, flag OFF)

```text
OutboundWorker
  → SendOutboundMessageUseCase
  → facebookOutboundAdapterResolver.resolve()
  → resolveFacebookWorkerOutboundConfig()
  → resolveOutboundChannelCredential (Channel Connect)
  → channel_connections + channel_credentials / channel_settings / ENV
  → FacebookAdapter(pageAccessToken)
```

### After (flag OFF — unchanged)

Same as before. No `MetaPageCredentialRepository` construction in worker; no META-CRED reads.

### After (flag ON — future cutover only)

```text
OutboundWorker
  → SendOutboundMessageUseCase
  → facebookOutboundAdapterResolver.resolve()
  → resolveFacebookWorkerOutboundConfig()
  → [if flag ON + repo + channelConnectionId]
       tryResolveFacebookFromMetaPageCredential()
         → resolveMetaPageRuntimeCredentialForFacebook()
           → listBindingsForChannelConnection (managed detection)
           → 0 rows → outcome "unmanaged" → fall through
           → 1+ invalid → MetaPageCredentialRuntimeResolverError (blockLegacyFallback)
           → ACTIVE FACEBOOK binding + ACTIVE credential → retrieveDecryptedMaterial
       → return source "meta_page_credential" (no legacy fallback)
  → [else] existing Channel Connect / ENV path
  → FacebookAdapter(pageAccessToken)
```

Instagram and LINE paths are untouched.

---

## 3. Feature flag semantics

| Variable | `HUBCHAT_META_PAGE_CREDENTIAL_ENABLED` |
| --- | --- |
| Default | **OFF** |
| ON | Exact trimmed value `"true"` only |
| OFF | absent, empty, `"false"`, `"1"`, `"yes"`, malformed, or any other value |
| Parser | `isMetaPageCredentialEnabled()` in `src/lib/metaPageCredentialRuntimeFlags.ts` |
| Deployment | **Not set** in Vercel, Railway, local production, or any deployment config in this package |

---

## 4. Managed vs unmanaged rule

| State | Detection | Behavior (flag ON) |
| --- | --- | --- |
| **Unmanaged** | `listBindingsForChannelConnection` returns **0 rows** for tenant + `channel_connection_id` | Fall through to existing Channel Connect / ENV path |
| **Managed + valid** | Exactly **1 ACTIVE FACEBOOK** binding; ACTIVE credential; version consistent; decrypt succeeds | Resolve META-CRED token; `source: "meta_page_credential"`; no legacy fallback |
| **Managed + invalid** | Any binding row present but inactive, wrong channel, ambiguous, version drift, tenant mismatch, decrypt failure, missing credential | **Fail closed** — `MetaPageCredentialRuntimeResolverError` with `blockLegacyFallback: true`; no ENV or Channel Connect fallback |

Managed detection does **not** infer "unmanaged" from lookup errors or partial failures — only an explicit zero-row binding list allows legacy fallback.

---

## 5. Fail-closed behavior

`MetaPageCredentialRuntimeResolverError` extends `Error` with sanitized messages (`sanitizeProviderErrorMessage`). Diagnostic codes: `ambiguous_binding`, `binding_channel_mismatch`, `binding_inactive`, `credential_state_invalid`, `credential_decrypt_failed`, `credential_not_found`.

Errors propagate from `resolveFacebookWorkerOutboundConfig` without catch-and-fallback. Queue retry classification follows existing outbound failure handling (same as other resolver errors).

---

## 6. Worker composition

In `src/worker/main.ts`:

- `isMetaPageCredentialEnabled(process.env)` evaluated at startup
- `createWorkerMetaPageCredentialRepository(supabase, env)` only when flag ON
- Reuses existing Supabase client and `resolveChannelCredentialEncryptionKey` conventions
- Startup log: `[worker] Meta Page credential runtime resolver { metaPageCredentialEnabled }` (boolean only)
- Repository passed into `workerOutboundComposition` → `createFacebookOutboundAdapterResolver`

When flag OFF: `metaPageCredentialRepository` is `undefined`; startup and runtime behavior preserved.

---

## 7. Changed files

### New

- `src/application/metaPageCredentialResolver/resolveMetaPageRuntimeCredential.ts`
- `src/application/metaPageCredentialResolver/resolveMetaPageRuntimeCredential.test.ts`
- `src/domain/metaPageCredentialRuntimeResolver.ts`
- `src/lib/metaPageCredentialRuntimeFlags.ts`
- `src/lib/metaPageCredentialRuntimeFlags.test.ts`
- `src/worker/workerMetaPageCredentialComposition.ts`
- `docs/agent-reports/agent-a/2026-07-01-meta-cred-1d-l-c-facebook-runtime-resolver-wiring.md`

### Modified

- `src/application/channelConnect/resolveWorkerOutboundWithChannelConnect.ts`
- `src/application/channelConnect/resolveWorkerOutboundWithChannelConnect.test.ts`
- `src/application/facebookOutbound/createFacebookOutboundAdapterResolver.ts`
- `src/application/metaPageCredentialResolver/metaPageCredentialResolverCutoverReadiness.test.ts`
- `src/domain/ports.ts` — `listBindingsForChannelConnection` on `MetaPageCredentialRepository`
- `src/infrastructure/adapters/repositories/supabaseMetaPageCredentialRepository.ts`
- `src/infrastructure/adapters/repositories/supabaseMetaPageCredentialRepository.test.ts`
- `src/lib/facebookOutboundRuntimeConfig.ts` — `FacebookOutboundConfigSource` includes `"meta_page_credential"`
- `src/worker/main.ts`
- `src/worker/workerOutboundComposition.ts`

### Explicit exclusions (unchanged)

Instagram outbound, activation API, credential writes, migrations, production env, deploy, cutover execution.

---

## 8. Tests and results

### Targeted

| Command | Result |
| --- | --- |
| `node --import tsx --test src/application/metaPageCredentialResolver/resolveMetaPageRuntimeCredential.test.ts src/lib/metaPageCredentialRuntimeFlags.test.ts src/application/metaPageCredentialResolver/metaPageCredentialResolverCutoverReadiness.test.ts` | **18/18 PASS** |
| `node --import tsx --test src/application/channelConnect/resolveWorkerOutboundWithChannelConnect.test.ts` | **26/26 PASS** (includes flag OFF/ON, managed/unmanaged, fail-closed) |
| `node --import tsx --test src/infrastructure/adapters/repositories/supabaseMetaPageCredentialRepository.test.ts` | PASS (includes `listBindingsForChannelConnection`) |

### Coverage summary

- **Flag:** absent/OFF/malformed → OFF; exact `"true"` → ON
- **Flag OFF:** legacy Channel Connect unchanged; no meta repo selection
- **Flag ON success:** ACTIVE binding + credential; correct tenant/connection/version; legacy not called after success
- **Flag ON fail-closed:** inactive binding, revoked credential, version drift, cross-tenant, provider mismatch, ambiguous binding, decrypt error; no ENV/legacy fallback
- **Flag ON unmanaged:** zero bindings → Channel Connect fallback
- **Security:** no plaintext tokens in errors/logs/fixtures; encrypted token not in result DTOs
- **Readiness tests:** updated from L-A "wiring absent" to L-C "wiring exists"

### Full suite and build

| Command | Result |
| --- | --- |
| `npm test` | **2536/2536 PASS** |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** |

---

## 9. Verification scans

| Scan | Result |
| --- | --- |
| `git diff --check` | **PASS** (CRLF→LF warning on one file only; no conflict markers) |
| Hidden/bidirectional Unicode scan on changed files | **PASS** — no matches |
| Secret/token pattern scan on changed files | **PASS** — no EAA/sk/BEGIN/accessToken literal matches |

---

## 10. Security / redaction

- Resolver logs use `toMetaPageRuntimeResolverLogPayload` — credential ID, version, page ID prefix/length only; no token fields
- `MetaPageCredentialRuntimeResolverError` uses `sanitizeProviderErrorMessage`
- Tests use fake tokens (`fake-access-token-*`) only where adapter contract requires a non-empty string
- No production credential values read, decrypted, or included in commits/reports

---

## 11. Production actions

| Action | Performed |
| --- | --- |
| Enable `HUBCHAT_META_PAGE_CREDENTIAL_ENABLED` | **NO** |
| Modify `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **NO** |
| Activation API / replay | **NO** |
| RETRY-5 token access | **NO** |
| Credential/binding writes | **NO** |
| Migrations | **NO** |
| Deploy | **NO** |
| Production smoke messages | **NO** |
| Resolver cutover | **NO** |

---

## 12. Remaining risks

1. **Cutover gate still required** — flag OFF in all environments until a separately authorized cutover package enables it with operational evidence.
2. **Managed detection depends on binding rows** — legacy Facebook connections with no META-CRED binding continue on Channel Connect when flag ON; connections with binding rows must have valid META-CRED state.
3. **Dual-credential period** — until cutover, RETRY-5 credential in `meta_page_credentials` is not used for outbound while flag remains OFF; legacy path still authoritative in production.
4. **Independent review** — Agent B should verify fail-closed semantics, worker composition, and that Instagram/LINE/activation surfaces remain isolated.

---

## 13. Final decision

**READY FOR INDEPENDENT REVIEW**

Not READY FOR CUTOVER. Runtime wiring is implemented and tested; production behavior unchanged until flag enablement is separately authorized.
