# META-CRED-1D-L-B — Independent Review of PR #298 (Facebook Resolver Cutover Readiness Audit)

## Metadata

| Field | Value |
| --- | --- |
| Agent | B |
| Date | 2026-07-01 |
| Phase | META-CRED-1D-L-B (independent review of META-CRED-1D-L-A audit artifact) |
| PR reviewed | [#298](https://github.com/ctarasan/HubChat/pull/298) |
| PR branch | `docs/meta-cred-1d-l-facebook-resolver-readiness` |
| PR base SHA | `e6a0903bfaa4a8a7e1eecfbe08848828e480acd8` |
| Reviewed head SHA | `1377ba7a8d832dd21d7301499135918ff52ac4ef` |
| Local review mode | DETACHED at PR tip |
| Working tree | CLEAN |
| Prior checkpoint | RETRY-5 PASS; ACTIVATED_HEALTHY_PENDING_CUTOVER; gate OFF; deploy `dpl_A2moVxVvPCTi8xAfF1mBhJX5cSeC` |

## Verdict

**PASS — HOLD CONFIRMED**

Independent review confirms Agent A's HOLD decision: repository/binding layer is ready, but **runtime Facebook outbound resolver wiring to `meta_page_credentials` is absent**. PR #298 does not implement cutover and must not be merged as a cutover gate. No `READY FOR CUTOVER` authorization.

---

## 1. Preflight

| Check | Result |
| --- | --- |
| `origin` fetched | YES |
| PR head resolved | `1377ba7a8d832dd21d7301499135918ff52ac4ef` |
| PR base (master) | `e6a0903bfaa4a8a7e1eecfbe08848828e480acd8` |
| HEAD mode | DETACHED |
| Tracked tree | CLEAN |
| PR head unchanged at completion | YES |
| Commits on branch | 1 (`1377ba7`) |

Production deployment SHA `e6a0903…` matches PR base master — treated as pre–gate-close redeploy baseline. Newer resolver code is **not** inferred deployed.

---

## 2. Diff scope

| File | Change |
| --- | --- |
| `docs/agent-reports/agent-a/2026-07-01-meta-cred-1d-l-a-facebook-resolver-cutover-readiness-audit.md` | +audit report |
| `src/application/metaPageCredentialResolver/metaPageCredentialResolverCutoverReadiness.test.ts` | +wiring-gap tests (3) |
| `src/infrastructure/adapters/repositories/supabaseMetaPageCredentialRepository.test.ts` | +binding isolation/version-drift tests; mock extended |

| Guardrail | Result |
| --- | --- |
| Unrelated scope | **NONE** — docs + tests only |
| Production environment changes | **NONE** |
| Deployment changes | **NONE** |
| Credential/binding/activation writes | **NONE** |
| Resolver cutover enablement | **NONE** |
| Migration/schema execution | **NONE** |
| Secret/token exposure in diff | **NONE** |

---

## 3. Mock correctness

`buildRepository()` in `supabaseMetaPageCredentialRepository.test.ts` exercises the **real** `SupabaseMetaPageCredentialRepository` against an in-memory Supabase query-builder mock covering:

- Tables: `meta_page_credentials`, `meta_page_credential_bindings`, `channel_connections`
- Operations: `select`, `eq`, `insert`, `update`, `maybeSingle`, `single`, `order` + `then` (list)

| Check | Result |
| --- | --- |
| Mock matches repository query patterns for tested methods | **YES** |
| Tests pass via unrealistic shortcuts | **NO** — real encrypt/decrypt, real domain errors |
| ACTIVE credential + binding resolve | **YES** (`getActiveCredentialForBinding` match) |
| Missing binding → null | **YES** |
| Version drift after rotate → null | **YES** |
| Revoke → null on lookup | **YES** |
| Cross-tenant bind → `MetaPageCredentialNotFoundError` | **YES** |
| Duplicate active binding → `MetaPageCredentialBindingConflictError` | **YES** |
| Instagram bind without IG account on credential → rejected | **YES** |
| Facebook binding isolated from Instagram connection lookup | **YES** |
| Plaintext token excluded from stored row / metadata select | **YES** |
| Error classes carry no token material | **YES** (`metaPageCredentialErrors.ts`) |

**NOTE:** Readiness tests (`metaPageCredentialResolverCutoverReadiness.test.ts`) intentionally use source inspection to prove wiring absence — appropriate for audit scope, not a substitute for future behavioral cutover integration tests.

---

## 4. Runtime wiring trace

### Current outbound path (production behavior)

```text
queue_jobs (message.outbound.requested)
  → OutboundWorker (Railway)
  → SendOutboundMessageUseCase
  → facebookOutboundAdapterResolver.resolve(tenantId, { channelConnectionId, providerPageId })
  → resolveFacebookWorkerOutboundConfig
  → resolveOutboundChannelCredential (Channel Connect)
  → channel_connections + channel_credentials / channel_settings / ENV
  → FacebookAdapter(pageAccessToken)
```

### Key files (verified — no `meta_page_*` references)

| Role | File / function |
| --- | --- |
| Worker entry | `src/worker/main.ts` — `createWorkerFacebookOutboundAdapterResolver` |
| Queue consumer | `src/worker/outboundWorker.ts` → `SendOutboundMessageUseCase` |
| Adapter resolver | `src/application/facebookOutbound/createFacebookOutboundAdapterResolver.ts` |
| Credential selection | `src/application/channelConnect/resolveWorkerOutboundWithChannelConnect.ts` → `resolveFacebookWorkerOutboundConfig` |
| Legacy resolver | `src/application/channelConnect/channelConnectRuntimeResolver.ts` → `resolveOutboundChannelCredential` |

### META-CRED storage (activated, not on outbound path)

| Component | Status |
| --- | --- |
| `SupabaseMetaPageCredentialRepository.getActiveCredentialForBinding` | **Implemented** (repository only) |
| `retrieveDecryptedMaterial` | **Implemented** (repository only) |
| `resolveMetaPageRuntimeCredential.ts` | **ABSENT** |
| `HUBCHAT_META_PAGE_CREDENTIAL_ENABLED` parser | **ABSENT** (`channelConnectRuntimeMode.ts` has no symbol) |
| Worker imports `MetaPageCredentialRepository` | **NO** |
| `resolveFacebookWorkerOutboundConfig` META-CRED branch | **NO** |

### Surfaces affected by future wiring

| Surface | Cutover relevance |
| --- | --- |
| **Railway worker** | **PRIMARY** — Facebook outbound resolves here only |
| **Vercel API** | Activation API only; not outbound path |

**Confirmation:** Runtime resolver wiring is **ABSENT**. PR #298 does **not** silently complete wiring.

---

## 5. HOLD decision review

Agent A HOLD rationale independently validated:

1. RETRY-5 credential lives in `meta_page_credentials` with ACTIVE FACEBOOK binding.
2. Worker still resolves Facebook tokens via legacy Channel Connect / `channel_settings` / ENV.
3. `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` does **not** read `meta_page_credentials`.
4. Enabling existing flags alone would **not** route outbound through RETRY-5 credential.
5. Dual-credential risk (META-CRED vs legacy `channel_credentials`/ENV) remains until explicit cutover implementation.

**Not READY FOR CUTOVER.**

---

## 6. Verification (Agent B independent)

| Command | Result |
| --- | --- |
| `node --import tsx --test src/application/metaPageCredentialResolver/metaPageCredentialResolverCutoverReadiness.test.ts src/infrastructure/adapters/repositories/supabaseMetaPageCredentialRepository.test.ts` | **27/27 PASS** |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `git diff --check e6a0903..1377ba7` | **PASS** |
| Hidden/bidi scan (changed source files) | **PASS** (no bidi override chars) |

---

## 7. Operational confirmations

| Check | Result |
| --- | --- |
| Production changes by Agent B | **NO** |
| Activation replay | **NO** |
| RETRY-5 token accessed | **NO** |
| Resolver cutover enabled | **NO** |
| Activation gate | **OFF / ABSENT** (unchanged) |
| Merge performed | **NO** |

---

## 8. Findings

| Severity | Finding |
| --- | --- |
| **NOTE** | Readiness tests use source-string inspection for wiring gap — correct for audit PR; future implementation PR must add behavioral integration tests. |
| **NOTE** | Production GitHub deployment record at `e6a0903…` aligns with PR base; worker may run same baseline — no newer resolver code deployed. |

**BLOCKER findings:** NONE (blockers correctly attributed to missing implementation, not this audit PR).

---

## 9. Final decision

```text
META-CRED-1D-L-B RESULT:
PASS — HOLD CONFIRMED

PR: #298
Base SHA: e6a0903bfaa4a8a7e1eecfbe08848828e480acd8
Reviewed head SHA: 1377ba7a8d832dd21d7301499135918ff52ac4ef

Runtime resolver wiring: ABSENT
Cutover authorization: NOT GRANTED
Merge recommendation: Do not merge as cutover gate; audit artifact accepted
```

---

## 10. Recommended next work package (META-CRED-1D-L-C or equivalent)

**Scope:** Facebook-only runtime resolver implementation + independent review — **not** cutover execution.

1. Add `src/application/metaPageCredentialResolver/resolveMetaPageRuntimeCredential.ts`:
   - `getActiveCredentialForBinding({ tenantId, channelConnectionId })`
   - `retrieveDecryptedMaterial` on match
   - Fail closed on null binding, version drift, decrypt failure
   - Sanitized errors only; no token in logs

2. Add `HUBCHAT_META_PAGE_CREDENTIAL_ENABLED` parser (e.g. in `src/lib/channelConnectRuntimeMode.ts` or dedicated module) with default **OFF**.

3. Wire into `resolveFacebookWorkerOutboundConfig` **before** legacy Channel Connect / ENV fallback when flag ON and binding present.

4. Compose `SupabaseMetaPageCredentialRepository` in `src/worker/main.ts` (encryption key already probed at boot).

5. Behavioral tests:
   - Flag OFF → legacy path unchanged
   - Flag ON + ACTIVE binding → META-CRED decrypt path
   - Flag ON + missing/drift/revoked → fail closed, no ENV fallback for OAuth-managed connections
   - Log redaction; `resolutionPath` diagnostic

6. **Explicit exclusions:** Instagram resolver path, activation replay, migration, production flag enablement, smoke send — separate controller gates.

7. Agent B review of implementation PR before any production cutover authorization.

---

## Reviewer notes

PR #298 is an audit/readiness artifact only. HOLD is correct and proportionate. Repository mock corrections are sound; targeted tests independently pass at 27/27. No merge or cutover action authorized by this review.
