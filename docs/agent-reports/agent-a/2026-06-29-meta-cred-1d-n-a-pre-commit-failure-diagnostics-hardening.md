# META-CRED-1D-N-A — Pre-Commit Failure Diagnostics Hardening

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-06-29 |
| Phase | META-CRED-1D-N-A |
| Starting master SHA | `3de19314317f90578dda1809100bf24d6bd25f54` |
| Branch | `fix/meta-cred-activation-diagnostics-hardening` |
| RETRY-2 state | CONSUMED (no re-attempt) |

## RETRY-2 observed outcome

- Operator submitted exactly once during gate-open window.
- UI showed generic: *"Activation failed. Contact engineering with the correlation reference if provided."*
- META-CRED rows remained **0 / 0 / 0** (no activation_request, credential, or binding writes).
- Production flag restored immediately after attempt.

## Classification

| Level | Finding |
| --- | --- |
| **PROVEN** | PRE-COMMIT FAILURE — no DB credential writes |
| **SUSPECTED** | META PROVIDER VERIFICATION (heuristic only; no historical log evidence retrieved) |
| **NOT PROVEN** | EXACT FAILING BRANCH |

## Root cause of generic operator message (code-path proven)

`mapActivationFetchError` previously read `body.error` while the activation API returns sanitized `body.message` and `body.code` via `toPublicJson()`. RETRY-2 therefore could show the generic fallback even when the API returned a specific sanitized failure.

## Activation call sequence (pre-commit branches)

```
POST /api/channel-connect/meta/verify-and-activate
├─ correlationId := createActivationCorrelationId()          [per request]
├─ flag OFF → 503 META_ACTIVATION_DISABLED                 [ROUTE_VALIDATION]
├─ body size assert                                          [ROUTE_VALIDATION → 400]
├─ requireAuth(ADMIN)                                        [AUTHORIZATION → 401/403]
├─ idempotency key parse                                     [ROUTE_VALIDATION → 400]
├─ JSON parse / parse body / contract validate               [ROUTE_VALIDATION → 400]
├─ useCase.execute
│  ├─ loadTrustedConnection                                  [TARGET_VALIDATION → 400]
│  ├─ verifyMetaPageCredential (provider)                    [PROVIDER_VERIFICATION → 422/503]
│  ├─ resolveChannelCredentialEncryptionKey + encrypt        [ENCRYPTION_PRECHECK → 503]
│  ├─ activationPort.activate (RPC)                          [ACTIVATION_RPC → 409/503]
│  └─ post-commit health                                     [POST_COMMIT_HEALTH → 202]
└─ catch → map failure → stage log → public JSON + correlationId
```

### Branches that can produce 0/0/0

| Branch | Can produce 0/0/0? | Notes |
| --- | --- | --- |
| Route / request validation | YES | Before use case |
| Authorization | YES | Before use case |
| Target / version validation | YES | `loadTrustedConnection` and contract checks |
| Provider verification | YES | Before encryption/RPC |
| Encryption precheck | YES | Before RPC |
| Activation RPC | NO | Would insert `meta_page_credential_activation_requests` |
| Post-commit health | NO | Would have credential rows |

### Static narrowing for RETRY-2 generic failure + 0/0/0

| Branch | Could match RETRY-2? |
| --- | --- |
| Provider verification | YES (suspected, not proven) |
| Encryption precheck | YES |
| Request validation | YES |
| Target/version validation | YES |
| RPC | NO |
| Post-commit handling | NO |

**Exact failure branch proven:** NO → `PRE-COMMIT FAILURE — EXACT BRANCH UNKNOWN`

## Changes

### API / route

- Per-request `correlationId` generated at route entry.
- Unified `activationFailureResponse` path: stage inference, sanitized structured log, public JSON with `code`, `message`, `error` alias, `retryable`, `correlationId`.
- Injectable `randomUuid` and `logFailure` for tests.

### Diagnostics module (`metaPageCredentialActivationDiagnostics.ts`)

- Stage enum: `ROUTE_VALIDATION`, `AUTHORIZATION`, `TARGET_VALIDATION`, `PROVIDER_VERIFICATION`, `ENCRYPTION_PRECHECK`, `ACTIVATION_RPC`, `POST_COMMIT_HEALTH`, `UNKNOWN`.
- Sanitized log fields: `correlationId`, `stage`, `sanitizedCode`, `httpStatus`, hash-safe `tenantRef`/`connectionRef`, `requestedChannels`, `expectedCredentialVersion`, `commitReached`, `timestamp`.
- Safety assertions block tokens, Authorization, raw provider payloads in logs and public JSON.

### UI error contract

- `parseActivationFailureBody` reads `message`, `code`, `correlationId` (with legacy `error` alias).
- `formatActivationFailurePresentation` / `mapActivationFetchError` surface safe message, code, and correlation reference.
- Null/non-object body handled safely (generic fallback).

## Prohibited-action attestation

| Action | Executed |
| --- | --- |
| Production flag enabled | NO |
| Production activation API call | NO |
| Production credential write | NO |
| Resolver cutover | NO |
| Migration | NO |
| Production deploy/merge | NO |

## Changed files

- `app/api/channel-connect/meta/verify-and-activate/route.ts`
- `src/lib/metaPageCredentialActivationDiagnostics.ts` (new)
- `src/lib/metaPageCredentialActivationApiErrors.ts`
- `src/ui/metaPageCredentialActivationUiModel.ts`
- `src/lib/metaPageCredentialActivationDiagnostics.test.ts` (new)
- `src/lib/metaPageCredentialActivationApiErrors.test.ts` (new)
- `src/interfaces/api/metaPageCredentialActivationRoute.test.ts`
- `src/ui/metaPageCredentialActivationUiModel.test.ts`
