# META-CRED-1D-C — Activation API Route and Post-Commit Health Orchestration

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-06-24 |
| Phase | META-CRED-1D-C (activation API + orchestration) |
| Authorization | `GO META-CRED-1D-C ACTIVATION API ROUTE IMPLEMENTATION` |
| Base master SHA | `ab0d3c5510289b78476362faa9efda6fd84d0211` |
| Branch | `feature/meta-cred-1d-c-activation-api` |
| Commit SHA | `e7c6499d2736ae2790e9a3c32305ca949bb95457` |
| PR | https://github.com/ctarasan/HubChat/pull/287 |
| 1D-B migration applied remotely | **NO** |

## Executive summary

ADMIN-only `POST /api/channel-connect/meta/verify-and-activate` behind default-OFF feature flag `HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_API_ENABLED`. Orchestrates VerifyMetaPageCredentialUseCase → canonical encryption → MetaPageCredentialActivationPort (single RPC) → read-after-write post-commit health. No resolver/worker/UI cutover, no rotation, no remote migration execution.

## Route

`POST /api/channel-connect/meta/verify-and-activate`

## Orchestration sequence

```text
feature flag → ADMIN auth + trusted tenant → validate body/Idempotency-Key
→ load tenant-scoped connections
→ VerifyMetaPageCredentialUseCase
→ secret-safe request fingerprint
→ encryptChannelCredentialPlaintext (HUBCHAT_CREDENTIAL_ENCRYPTION_KEY)
→ MetaPageCredentialActivationPort.activate (one RPC)
→ retrieve committed credential/bindings
→ post-commit health (decrypt + channel health checks)
→ sanitized response (ACTIVATED_HEALTHY_PENDING_CUTOVER | ACTIVATED_HEALTH_FAILED)
```

## Health semantics

| Outcome | HTTP | State |
| --- | --- | --- |
| Activation + health pass | 200 | `ACTIVATED_HEALTHY_PENDING_CUTOVER` |
| Activation committed, health failed | 202 | `ACTIVATED_HEALTH_FAILED` |
| Provider validation failure | 422 | sanitized error code |
| Conflict | 409 | sanitized error code |
| Feature disabled | 503 | `META_ACTIVATION_DISABLED` |

No `READY` claim. No runtime resolver cutover.

## Review notes carried forward

1. Live-Postgres atomicity tests remain pending (1D-B)
2. First concurrent idempotency insert race maps to generic sanitized error
3. `FAILED` idempotency enum unused in RPC
4. `granted_scopes` normalization in adapter
5. `schema.sql` does not mirror RPC body
6. RPC success = `ACTIVATED_PENDING_HEALTH`, not channel READY
7. Remote migration requires separate operator gate

## Prohibited-action attestation

| Action | Executed |
| --- | --- |
| Remote DB migration | NO |
| Real credential write (production) | NO |
| Feature flag enabled in deployment | NO |
| Resolver cutover | NO |
| Rotation RPC/API | NO |
| UI change | NO |
| ENV deployment change | NO |

## META-CRED-1D-C ACTIVATION API RESULT

```text
META-CRED-1D-C ACTIVATION API RESULT

Base master SHA: ab0d3c5510289b78476362faa9efda6fd84d0211
Branch: feature/meta-cred-1d-c-activation-api
Commit SHA: e7c6499d2736ae2790e9a3c32305ca949bb95457
PR: https://github.com/ctarasan/HubChat/pull/287
Route: POST /api/channel-connect/meta/verify-and-activate

Feature flag:
- Name: HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_API_ENABLED
- Default: OFF
- Deployment value changed: NO
- Provider/DB calls while OFF: NO

Authorization:
- ADMIN-only: YES
- Trusted tenant: YES (x-tenant-id + session)
- Cross-tenant protection: YES

Request:
- Idempotency key: YES (Idempotency-Key header, bounded)
- Body/token bounds: YES
- Exact channel validation: YES
- Expected-version validation: YES

Orchestration:
- Provider verification reused: YES (VerifyMetaPageCredentialUseCase)
- Encryption service reused: YES (encryptChannelCredentialPlaintext)
- Canonical key loader: YES (resolveChannelCredentialEncryptionKey)
- Request fingerprint secret-safe: YES
- Activation port calls: 1
- Direct repository writes: NO
- Legacy/ENV fallback: NO

Post-commit health:
- Stored credential path used: YES (retrieveDecryptedMaterial)
- Exact credential version: YES
- Facebook health: YES (verifyFacebookChannelHealth)
- Instagram health: YES when requested (verifyInstagramChannelHealth)
- Legacy credential used: NO
- Health-pass state: ACTIVATED_HEALTHY_PENDING_CUTOVER
- Health-failure state: ACTIVATED_HEALTH_FAILED
- READY claimed: NO
- Runtime cutover: NO

Secret safety:
- Token logged: NO
- Token in response: NO
- Ciphertext in response: NO
- Raw provider/Supabase error: NO (sanitized mapping)
- Request body serialized: NO (audit/response guards)

Scope:
- Migration added/changed: NO
- Rotation implemented: NO
- Resolver/worker changed: NO
- UI changed: NO
- ENV deployment changed: NO

Verification:
- Focused tests: 24/24 PASS
- Full tests: 2392/2392 PASS
- Typecheck: PASS
- Lint: PASS
- Build: PASS
- git diff --check: PASS
- Hidden/bidi: PASS
- Secret scan: PASS
- Runtime-wiring scan: PASS
- Rotation-absence scan: PASS

Remote migration executed: NO
Real credential changed: NO
Feature flag enabled: NO
Resolver cutover executed: NO
Legacy plaintext cleaned: NO
Outbound operation executed: NO

Decision: READY FOR AGENT B REVIEW

Recommended next gate: META-CRED-1D-C-B INDEPENDENT ACTIVATION API REVIEW

Operational state: HOLD — NO DATABASE MIGRATION EXECUTION OR CREDENTIAL CUTOVER
```
