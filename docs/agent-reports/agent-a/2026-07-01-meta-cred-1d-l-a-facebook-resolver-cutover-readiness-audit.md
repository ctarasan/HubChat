# META-CRED-1D-L-A — Facebook Resolver Cutover Readiness Audit

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-07-01 |
| Phase | META-CRED-1D-L-A (readiness audit only — no cutover execution) |
| Authorization | Facebook resolver cutover readiness audit after RETRY-5 PASS |
| Base master SHA | `e6a0903bfaa4a8a7e1eecfbe08848828e480acd8` |
| Branch | `docs/meta-cred-1d-l-facebook-resolver-readiness` |
| Prior checkpoint | RETRY-5 PASS; gate OFF; deploy `dpl_A2moVxVvPCTi8xAfF1mBhJX5cSeC` |

## Executive summary

RETRY-5 successfully activated **one ACTIVE Meta Page credential (version 1)** with **one ACTIVE FACEBOOK binding** to connection `507d…279d`. Repository-layer binding resolution and fail-closed semantics are **implemented and tested**.

**Critical finding:** outbound Facebook delivery still resolves credentials through the **legacy Channel Connect path** (`channel_connections` + `channel_credentials` / `channel_settings` / ENV). There is **no worker wiring** to `meta_page_credentials` / `meta_page_credential_bindings`, and the planned cutover flag **`HUBCHAT_META_PAGE_CREDENTIAL_ENABLED`** is **not implemented** in code. Enabling today's resolver flags alone would **not** route outbound through the RETRY-5 credential.

**Decision: HOLD — RUNTIME RESOLVER WIRING NOT IMPLEMENTED (READY FOR INDEPENDENT REVIEW OF THIS AUDIT)**

Independent review should approve a **separate implementation gate (META-CRED-1D-L-B or equivalent)** before any production cutover authorization.

No production changes, activation replay, token access, resolver enablement, deploy, or migration occurred in this task.

---

## 1. Scope and guardrails

### Permitted

- Read-only code audit
- Read-only production probes (counts, flag names, sanitized binding facts)
- Documentation and wiring/readiness tests
- Branch, commit, push, PR (not merged)

### Prohibited (observed)

- Activation replay — **NO**
- RETRY-5 token retrieval/decrypt — **NO**
- Activation API calls — **NO**
- Credential/binding writes — **NO**
- Resolver cutover enablement — **NO**
- Vercel/Railway env changes — **NO**
- Production deploy — **NO**
- Production smoke message — **NO**
- Migrations / SQL writes — **NO**

---

## 2. Repository sync

| Check | Result |
| --- | --- |
| Branch | `docs/meta-cred-1d-l-facebook-resolver-readiness` |
| Base SHA | `e6a0903bfaa4a8a7e1eecfbe08848828e480acd8` |
| `HEAD` = `origin/master` at branch creation | **YES** |
| Tracked modifications on base | **NONE** |
| Allowed untracked artifacts | `.pr-body-meta-cred-1d-*.md`, `docs/agent-reports/agent-a/2026-06-30-meta-cred-1d-o-a-*.md`, `long givity.txt`, `supabase/.temp/` |

---

## 3. Resolver architecture findings

### 3.1 Outbound entry path (current production behavior)

```text
queue_jobs (message.outbound.requested)
  → OutboundWorker (Railway worker)
  → SendOutboundMessageUseCase
  → facebookOutboundAdapterResolver.resolve(tenantId, { channelConnectionId, providerPageId })
  → resolveFacebookWorkerOutboundConfig
  → resolveOutboundChannelCredential (Channel Connect resolver)
  → channel_connections + channel_credentials decrypt OR legacy channel_settings OR ENV fallback
  → FacebookAdapter(pageAccessToken)
```

Key files:

- `src/worker/outboundWorker.ts`
- `src/worker/main.ts` (wires `createWorkerFacebookOutboundAdapterResolver`)
- `src/application/facebookOutbound/createFacebookOutboundAdapterResolver.ts`
- `src/application/channelConnect/resolveWorkerOutboundWithChannelConnect.ts`
- `src/application/channelConnect/channelConnectRuntimeResolver.ts`

### 3.2 META-CRED storage layer (activated, not yet on outbound path)

```text
meta_page_credentials (ACTIVE, encrypted)
  ↔ meta_page_credential_bindings (ACTIVE, per channel_connection_id)
```

Repository resolution API (worker-internal, not HTTP-exposed):

- `SupabaseMetaPageCredentialRepository.getActiveCredentialForBinding({ tenantId, channelConnectionId })`
  - Requires `binding_status = ACTIVE`
  - Requires credential `status = ACTIVE` (`isMetaPageCredentialResolvableStatus`)
  - Requires `credential.credentialVersion === binding.credentialVersion` (stale binding → **null**)
- `retrieveDecryptedMaterial({ tenantId, credentialId })` — runtime-only decrypt; throws `MetaPageCredentialDecryptionFailedError` on failure

**Gap:** no `resolveMetaPageRuntimeCredential.ts` (planned in META-CRED-1B plan) and no imports of `MetaPageCredentialRepository` in worker/outbound composition.

### 3.3 Tenant and connection scoping

| Layer | Scoping |
| --- | --- |
| Outbound queue payload | `tenantId`, `channel`, optional `channelConnectionId`, `providerPageId` |
| Channel Connect lookup | `resolveOutboundChannelConnectionLookup` + tenant `listByTenant` |
| Meta Page binding lookup | `tenant_id` + `channel_connection_id` composite |
| Cross-tenant binding | Rejected at bind time (`MetaPageCredentialNotFoundError`) |

### 3.4 Provider / channel enforcement

| Check | META-CRED repository | Channel Connect resolver |
| --- | --- | --- |
| FACEBOOK binding on FACEBOOK connection | Enforced at `bindChannelConnection` via `assertConnectionOwnedByTenant(..., expectedProvider)` | `connection.provider === input.provider` |
| Instagram binding without IG account on credential | **Rejected** (`MetaPageCredentialBindingConflictError`) | N/A for META-CRED path |
| Instagram cannot consume Facebook binding row | **YES** — lookup is per `channel_connection_id`; IG connection has no binding → null | Separate INSTAGRAM provider path |

### 3.5 Fail-closed and fallback behavior (today vs target)

**Today (legacy path):**

| Condition | OAuth-managed Facebook | Non-OAuth Facebook |
| --- | --- | --- |
| DB credential missing/invalid | `blockLegacyFallback=true` → **fail closed** | `DB_WITH_ENV_FALLBACK` may fall back to ENV / `channel_settings` |
| Connection not READY | OAuth: fail closed | May ENV fallback |

**Target cutover (META-CRED-1B plan, not implemented):**

| Condition | Expected |
| --- | --- |
| ACTIVE meta_page FACEBOOK binding present | Decrypt shared credential → **only path** |
| Binding present but decrypt/version invalid | **FAIL CLOSED** — no ENV/legacy fallback |
| Binding absent during transition | Legacy path only if explicit transition flag allows |

**Risk for premature cutover:** RETRY-5 token lives in `meta_page_credentials`; legacy `channel_credentials` may still hold a **different** token. Worker would continue using legacy path until META-CRED resolver is wired.

### 3.6 Token/secret redaction

- `src/domain/metaPageCredentialErrors.ts` — sanitized error classes; no token fields
- Repository tests assert metadata selects exclude `encrypted_access_token`
- Channel Connect diagnostics use `sanitizeResolverErrorMessage` / `toChannelConnectResolverLogPayload`
- OAuth outbound failures emit structured logs without token material (`buildFacebookOAuthOutboundFailureLogPayload`)

### 3.7 Runtime surfaces and flags

| Flag / config | Surface | Production today (names only) | Cutover relevance |
| --- | --- | --- | --- |
| `HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_API_ENABLED` | Vercel API | **ABSENT** (gate closed) | Activation only — **not** resolver |
| `HUBCHAT_META_PAGE_CREDENTIAL_ENABLED` | Planned worker/API | **NOT IN CODE** | **Primary planned cutover flag** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | Vercel + Railway worker | **PRESENT** | Legacy CCP resolver — does **not** read `meta_page_credentials` |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | Railway worker | Not enumerated (encrypted) | `DB_WITH_ENV_FALLBACK` / `DB_ONLY` / `ENV_ONLY` for **legacy** path |
| `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` | Vercel + Railway | **PRESENT** | Required for META-CRED decrypt |
| `FACEBOOK_PAGE_ACCESS_TOKEN` / `FACEBOOK_PAGE_ID` | Railway ENV | Likely present (legacy) | Fallback hazard if META-CRED wiring incomplete |

**Participation:** Facebook outbound resolution runs on **Railway worker only** (not Vercel API). Cutover implementation + flag propagation must include **Railway worker** at minimum.

---

## 4. Test evidence

### 4.1 New / extended tests (this branch)

| File | Coverage |
| --- | --- |
| `src/application/metaPageCredentialResolver/metaPageCredentialResolverCutoverReadiness.test.ts` | Wiring gap audit; planned flag absent; OAuth `blockLegacyFallback` preserved |
| `src/infrastructure/adapters/repositories/supabaseMetaPageCredentialRepository.test.ts` | + missing binding, IG isolation, version drift after rotate |

### 4.2 Existing relevant suites (master)

| Suite | Coverage |
| --- | --- |
| `supabaseMetaPageCredentialRepository.test.ts` | ACTIVE resolve, revoke → null, decrypt fail-closed, version conflict, channel type enforcement |
| `channelConnectRuntimeResolver.test.ts` | Tenant scope, OAuth fail-closed, ambiguous connection, sanitized errors |
| `resolveWorkerOutboundWithChannelConnect.test.ts` | Facebook DB path, OAuth `blockLegacyFallback`, log redaction |

### 4.3 Commands run

```text
npm test -- src/application/metaPageCredentialResolver/metaPageCredentialResolverCutoverReadiness.test.ts
npm test -- src/infrastructure/adapters/repositories/supabaseMetaPageCredentialRepository.test.ts
npm run typecheck
npm run lint
git diff --check
```

(Full `npm test` also executed via project script glob — all pass including new tests.)

---

## 5. Read-only production evidence

UTC ~2026-07-01 (sanitized; no ciphertext/token reads):

| Probe | Result |
| --- | --- |
| `meta_page_credentials` ACTIVE | **1** |
| `meta_page_credential_bindings` FACEBOOK ACTIVE | **1** (`507d…279d`, version **1**) |
| `meta_page_credential_bindings` INSTAGRAM | **0** |
| Activation gate | **ABSENT** (`HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_API_ENABLED` not listed) |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **PRESENT** (value not read) |
| `HUBCHAT_META_PAGE_CREDENTIAL_ENABLED` | **ABSENT** (not in code or Vercel env list) |
| Verified production deploy (controller checkpoint) | `dpl_A2moVxVvPCTi8xAfF1mBhJX5cSeC` |
| GitHub Production deployment SHA (may lag redeploy) | `e6a0903…` |
| Activation repeated | **NO** |
| RETRY-5 token accessed | **NO** |

---

## 6. Future execution runbook (NOT EXECUTED)

### 6.1 Prerequisites (blockers from this audit)

1. Implement `resolveMetaPageRuntimeCredential` (or equivalent) and wire into `resolveFacebookWorkerOutboundConfig` **before** legacy fallback when cutover flag on.
2. Implement `HUBCHAT_META_PAGE_CREDENTIAL_ENABLED` parser + fail-closed semantics per META-CRED-1B plan.
3. Add worker composition for `SupabaseMetaPageCredentialRepository`.
4. Independent review + Agent B verification of implementation PR.
5. Controller authorization for production cutover gate.

### 6.2 Cutover sequence (Facebook-only)

1. **Pre-cutover read-only:** queue/outbox idle, incident NONE, binding ACTIVE version 1, activation gate OFF.
2. **Railway:** set `HUBCHAT_META_PAGE_CREDENTIAL_ENABLED=true` (after implementation lands).
3. **Railway:** set `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE=DB_ONLY` (recommended end-state per 1B plan).
4. **Railway:** redeploy/restart worker; confirm propagation logs show `meta_page_credential` resolution path.
5. **Do not** enable activation flag.
6. **Facebook-only smoke:** one controlled outbound Messenger send via approved tenant/connection; verify delivery + sanitized logs.
7. **Explicit exclusion:** no Instagram binding, no Instagram outbound, no activation replay.

### 6.3 Propagation checks

- Worker boot log: encryption key configured
- Outbound resolver log: `resolutionPath` indicates meta page credential (once implemented)
- No `legacy_fallback` for target connection when binding ACTIVE

### 6.4 Rollback triggers

- Outbound failures spike for Facebook tenant
- Resolver returns null / decrypt errors for ACTIVE binding
- Unexpected ENV fallback for OAuth-managed or META-CRED-bound connection
- Provider auth errors (190/102) on first smoke send

### 6.5 Rollback steps

1. Set `HUBCHAT_META_PAGE_CREDENTIAL_ENABLED` → remove or `false` on Railway.
2. Restore `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` to pre-cutover value if changed.
3. Redeploy/restart worker.
4. Verify outbound resumes on legacy path (pre-agreed).
5. Confirm activation route still **503 META_ACTIVATION_DISABLED**.
6. Confirm META-CRED rows unchanged (no activation replay).

---

## 7. Remaining risks and blockers

| ID | Risk / blocker | Severity |
| --- | --- | --- |
| B1 | **Runtime wiring missing** — worker does not read `meta_page_credentials` | **BLOCKER** |
| B2 | **Cutover flag not implemented** — `HUBCHAT_META_PAGE_CREDENTIAL_ENABLED` absent from code | **BLOCKER** |
| B3 | **Dual credential sources** — RETRY-5 token in META-CRED tables vs legacy `channel_credentials`/ENV | **HIGH** until cutover |
| B4 | **ENV fallback** on non-OAuth Facebook in `DB_WITH_ENV_FALLBACK` could mask META-CRED failures pre-cutover | **MEDIUM** |
| B5 | **Railway-only** cutover — Vercel deploy SHA does not move worker resolver | **OPERATIONAL** |
| B6 | Instagram explicitly out of scope — must not enable IG binding or IG resolver path | **CONSTRAINT** |

---

## 8. Rollback readiness (current state)

| Check | Status |
| --- | --- |
| Activation gate closable | **YES** — flag absent today |
| Resolver cutover flag to remove | **N/A** — not enabled / not implemented |
| Credential data reversible without SQL | **NO** — rollback is flag/path only; no DELETE authorized |
| Legacy outbound path still available | **YES** — unchanged on master |

---

## 9. Final decision

```text
META-CRED-1D-L-A RESULT:
HOLD

Decision for independent review:
READY FOR INDEPENDENT REVIEW

Cutover execution:
NOT READY — requires META-CRED runtime resolver implementation + separate controller authorization

Rationale:
Repository and binding invariants are production-ready after RETRY-5, but outbound worker
still resolves Facebook tokens exclusively via legacy Channel Connect / channel_settings / ENV.
No production cutover flag exists in code. Enabling HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED
alone does not consume the RETRY-5 meta_page_credentials row.
```
