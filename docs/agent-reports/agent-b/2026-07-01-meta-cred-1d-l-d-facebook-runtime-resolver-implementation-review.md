# META-CRED-1D-L-D — Independent Review of PR #300 (Facebook Meta Page Runtime Resolver)

## Metadata

| Field | Value |
| --- | --- |
| Agent | B |
| Date | 2026-07-01 |
| Phase | META-CRED-1D-L-D (implementation review — not cutover) |
| PR reviewed | [#300](https://github.com/ctarasan/HubChat/pull/300) |
| PR branch | `feature/meta-cred-1d-l-c-facebook-runtime-resolver` |
| PR base SHA | `82de0e46ff3d8683b2cc41d8f12d93c976e75349` |
| Reviewed head SHA | `66a87550be34ec763c98a7d86fee74e804f16fdf` |
| Review lock | DETACHED at PR tip; tracked tree CLEAN |
| PR head unchanged at completion | **YES** |
| Mergeability | MERGEABLE |
| CI | Vercel SUCCESS |
| Prior checkpoint | RETRY-5 PASS; ACTIVATED_HEALTHY_PENDING_CUTOVER; resolver cutover authorization NONE |

## Verdict

**PASS WITH NOTES — READY TO MERGE DISABLED-BY-DEFAULT IMPLEMENTATION**

PR #300 correctly implements Facebook-only Meta Page runtime resolver wiring behind default-OFF `HUBCHAT_META_PAGE_CREDENTIAL_ENABLED`. Flag OFF preserves legacy behavior. Managed/unmanaged distinction and fail-closed semantics are sound. This does **not** authorize production deployment, flag enablement, activation, resolver cutover, or production smoke.

---

## 1. Scope review

| File | Change |
| --- | --- |
| `src/lib/metaPageCredentialRuntimeFlags.ts` | Flag parser (default OFF) |
| `src/lib/metaPageCredentialRuntimeFlags.test.ts` | Parser tests |
| `src/application/metaPageCredentialResolver/resolveMetaPageRuntimeCredential.ts` | Runtime resolver |
| `src/application/metaPageCredentialResolver/resolveMetaPageRuntimeCredential.test.ts` | Behavioral resolver tests |
| `src/domain/metaPageCredentialRuntimeResolver.ts` | Sanitized runtime errors |
| `src/domain/ports.ts` | `listBindingsForChannelConnection` on repository port |
| `src/infrastructure/adapters/repositories/supabaseMetaPageCredentialRepository.ts` | `listBindingsForChannelConnection` impl |
| `src/infrastructure/adapters/repositories/supabaseMetaPageCredentialRepository.test.ts` | Repository tests |
| `src/application/channelConnect/resolveWorkerOutboundWithChannelConnect.ts` | Facebook outbound integration |
| `src/application/channelConnect/resolveWorkerOutboundWithChannelConnect.test.ts` | Flag ON/OFF + fail-closed tests |
| `src/application/facebookOutbound/createFacebookOutboundAdapterResolver.ts` | Pass-through wiring |
| `src/lib/facebookOutboundRuntimeConfig.ts` | `meta_page_credential` source type |
| `src/worker/main.ts` | Conditional repository composition |
| `src/worker/workerMetaPageCredentialComposition.ts` | Repository factory |
| `src/worker/workerOutboundComposition.ts` | Facebook resolver factory |
| `src/application/metaPageCredentialResolver/metaPageCredentialResolverCutoverReadiness.test.ts` | Updated readiness tests |
| `docs/agent-reports/agent-a/2026-07-01-meta-cred-1d-l-c-facebook-runtime-resolver-wiring.md` | Agent A report |

| Prohibited item | Present |
| --- | --- |
| Migrations / schema | **NO** |
| Credential/binding writes | **NO** |
| Activation API execution / replay | **NO** |
| RETRY-5 token access | **NO** |
| Production env files / variable commits | **NO** |
| Instagram resolver wiring | **NO** |
| LINE behavior changes | **NO** |
| Production smoke | **NO** |

Commits: `492f654` (implementation), `66a8755` (docs-only report SHA/PR link).

---

## 2. Feature-flag assessment

`HUBCHAT_META_PAGE_CREDENTIAL_ENABLED` via `isMetaPageCredentialEnabled()`:

| Input | Result |
| --- | --- |
| absent | OFF |
| empty / whitespace-only | OFF (trim !== `"true"`) |
| `"false"` | OFF |
| `"true"` | ON |
| `"TRUE"`, `"1"`, `"yes"`, `"on"`, `" maybe"` | OFF |

Distinct from `HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_API_ENABLED` (activation API only; not referenced in resolver path).

Flag not committed in deployment configuration files. Flag OFF skips Meta Page block entirely in `resolveFacebookWorkerOutboundConfig`.

---

## 3. Runtime flow trace

```text
queue_jobs (message.outbound.requested)
  → OutboundWorker [src/worker/outboundWorker.ts]
  → SendOutboundMessageUseCase.resolveOutboundAdapter()
       passes conversation.channelConnectionId + providerPageId
  → createFacebookOutboundAdapterResolver.resolve()
  → resolveFacebookWorkerOutboundConfig()
       [if flag ON + repository + non-empty channelConnectionId]
         tryResolveFacebookFromMetaPageCredential()
           → resolveMetaPageRuntimeCredentialForFacebook()
             → listBindingsForChannelConnection (managed detection)
             → getActiveCredentialForBinding + retrieveDecryptedMaterial
       [if resolved] return source "meta_page_credential" (early return)
       [else] existing Channel Connect → channel_settings → ENV
  → FacebookAdapter({ pageAccessToken, graphVersion })
```

| Concern | Finding |
| --- | --- |
| Flag evaluated | `resolveFacebookWorkerOutboundConfig`, `worker/main.ts`, `workerOutboundComposition.ts` |
| Repository resolution | `listBindingsForChannelConnection`, `getActiveCredentialForBinding` |
| Decryption | `retrieveDecryptedMaterial` (runtime-only) |
| DTO to adapter | `{ pageAccessToken, graphVersion, providerPageId }` — no ciphertext |
| Legacy order | Meta Page **before** Channel Connect when flag ON + connection id present |
| Double send | Single resolve path; early return prevents second credential resolution |

Worker surface: **Railway only**. Vercel unchanged for outbound.

---

## 4. Managed / unmanaged decision table

| State | Detection (flag ON) | Behavior |
| --- | --- | --- |
| **Unmanaged** | 0 binding rows for tenant + `channel_connection_id` | Fall through to Channel Connect / ENV |
| **Managed valid** | 1 ACTIVE FACEBOOK binding; ACTIVE credential; version match; decrypt OK | META-CRED path; legacy not called |
| **Managed invalid** | Any binding row + inactive / wrong channel / ambiguous / drift / decrypt fail | `MetaPageCredentialRuntimeResolverError` (`blockLegacyFallback: true`); **no** legacy/ENV fallback |

Managed is **not** inferred from lookup errors — only zero rows yields unmanaged.

**NOTE (cutover runbook):** Meta Page path requires non-empty `channelConnectionId`. If flag ON but conversation lacks `channelConnectionId`, integration skips Meta Page block and may use legacy path even when a binding exists. `SendOutboundMessageUseCase` passes `conversation?.channelConnectionId`; cutover must verify bound conversations always carry this field.

---

## 5. Fail-closed assessment

| Case | Fail-closed | Legacy fallback blocked |
| --- | --- | --- |
| Inactive binding | YES | YES |
| Instagram binding channel type | YES | YES |
| Ambiguous bindings (>1) | YES | YES |
| Active credential missing / version drift | YES | YES |
| Decrypt failure | YES | YES |
| Token absent in material | YES | YES |

`MetaPageCredentialRuntimeResolverError` propagates **outside** Channel Connect try/catch — not swallowed into ENV fallback.

Tests: `resolveMetaPageRuntimeCredential.test.ts`, `resolveWorkerOutboundWithChannelConnect.test.ts` ("managed invalid state fails closed without env fallback").

---

## 6. Flag-OFF compatibility

| Check | Result |
| --- | --- |
| Legacy Channel Connect path preserved | **YES** — test: "FACEBOOK flag OFF preserves Channel Connect path" |
| ENV fallback unchanged | **YES** |
| Meta Page credential not selected | **YES** — meta block skipped |
| Worker starts without Meta Page repository | **YES** — `metaPageCredentialRepository` undefined when flag OFF |
| LINE unaffected | **YES** — no changes to LINE resolver path |
| Instagram unaffected | **YES** — no Meta Page imports in Instagram path |
| Extra credential read when flag OFF | **NO** |

No flag-OFF production behavior change identified.

---

## 7. Worker composition

`src/worker/main.ts`:

- `isMetaPageCredentialEnabled(process.env)` at startup (boolean log only)
- `createWorkerMetaPageCredentialRepository` only when flag ON
- Reuses existing Supabase client + `resolveChannelCredentialEncryptionKey`
- Passes repository into `createWorkerFacebookOutboundAdapterResolver`

`src/worker/workerMetaPageCredentialComposition.ts` mirrors encryption-key conventions from Channel Connect.

---

## 8. Security / redaction

| Check | Result |
| --- | --- |
| Plaintext token in logs | **NO** — `toMetaPageRuntimeResolverLogPayload` uses page id prefix/length only |
| Token in errors | **NO** — sanitized messages; tests assert no `EAA` in errors |
| Ciphertext in runtime DTOs | **NO** |
| `META_PAGE_BINDING_METADATA_SELECT` excludes encrypted token | **YES** (existing) |
| Test fixtures | Synthetic placeholders only |
| Secret scan (changed implementation files) | **CLEAN** |

---

## 9. Verification (Agent B independent)

| Command | Result |
| --- | --- |
| Targeted META-CRED + Channel Connect suites | **99/99 PASS** |
| `npm test` (full suite) | **2536/2536 PASS** |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm run build` | PASS |
| `git diff --check` (base..head) | PASS |
| Hidden/bidi scan (changed source) | PASS |
| Secret/token scan (implementation + report) | CLEAN |

---

## 10. Agent A report review

Agent A report accurately records base/head SHA, files, before/after flow, flag semantics, managed/unmanaged rule, fail-closed behavior, worker composition, test counts, and production actions NONE.

Does **not** claim READY FOR CUTOVER, production resolver enabled, deployment complete, or production smoke PASS.

---

## 11. Production configuration event

Recorded per controller evidence:

- Task **"Enable activation flag on Vercel Production"** was **aborted**.
- Log shows one attempted `vercel env add` for `HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_API_ENABLED=true`.
- Fresh production environment listing confirms variable is **absent**.
- **Final verified production state: activation gate OFF / ABSENT.**
- Resolver flags (`HUBCHAT_META_PAGE_CREDENTIAL_ENABLED`) remain **unchanged / absent**.

Agent B performed **no** production changes, env mutations, deployments, activation calls, or credential reads during this review.

---

## 12. Findings

| Severity | Finding |
| --- | --- |
| **NOTE** | Flag ON requires non-empty `channelConnectionId` on outbound conversation context; cutover runbook must validate this for RETRY-5 bound connections. |
| **NOTE** | Readiness tests remain partly source-inspection; supplemented by behavioral tests in resolver and worker outbound suites. |
| **NOTE** | Aborted activation-flag env attempt occurred; final absent state confirmed — not a PR #300 defect. |
| **NOTE** | Dual-credential risk (META-CRED vs legacy `channel_credentials`/ENV) remains until separately authorized Railway cutover with resolver flag ON. |

**BLOCKER findings:** NONE

---

## 13. Final decision

```text
META-CRED-1D-L-D RESULT:
PASS WITH NOTES — READY TO MERGE DISABLED-BY-DEFAULT IMPLEMENTATION

PR: #300
Base SHA: 82de0e46ff3d8683b2cc41d8f12d93c976e75349
Reviewed head SHA: 66a87550be34ec763c98a7d86fee74e804f16fdf

Runtime wiring: IMPLEMENTED (disabled by default)
Resolver cutover authorization: NONE
Production deployment authorization: NONE
```

---

## 14. Recommended next controlled gate

**META-CRED-1D-L-E** (or controller-equivalent): post-merge controlled merge decision → Railway deploy of merged master (still flag OFF) → independent verification that production behavior unchanged → separate controller authorization for `HUBCHAT_META_PAGE_CREDENTIAL_ENABLED=true` on Railway only → pre-cutover checklist (conversation `channelConnectionId`, binding ACTIVE v1, queue idle, dual-credential awareness) → controlled Facebook-only smoke → **not** activation replay.

---

## Operational confirmations

| Check | Result |
| --- | --- |
| PR #300 modified or merged during review | **NO** |
| Production changes during review | **NO** |
| Activation repeated | **NO** |
| RETRY-5 token accessed | **NO** |
| Resolver cutover enabled | **NO** |
