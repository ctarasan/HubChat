# META-CRED-1D-N-C — Correct Diagnostic Review Blockers

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-06-29 |
| Phase | META-CRED-1D-N-C |
| PR | [#295](https://github.com/ctarasan/HubChat/pull/295) |
| Previous reviewed PR head | `a65e7db4114d07cc6c7137ec28bf1af02bb86e56` |
| Correction commit | `2d1269ed494537f2d71b162759af2a91ad123a7b` |
| New PR head | `2d1269ed494537f2d71b162759af2a91ad123a7b` |
| Branch | `fix/meta-cred-activation-diagnostics-hardening` |

## Blockers addressed

### BLOCKER-1 — commitReached semantics

**Before:** `commitReached` inferred from stage (`ACTIVATION_RPC` → true).

**After:**
- Route initializes `createActivationExecutionState()` with `commitReached: false`.
- Sets `commitReached = true` only after `useCase.execute()` returns a committed outcome.
- Failures use `resolveActivationFailurePersistence(error, execution)`:
  - Pre-commit paths → `commitReached: false`
  - RPC conflict/rollback → `rpcInvoked: true`, `commitReached: false`
  - Post-commit health / decryption failure → `commitReached: true`, `rpcInvoked: true`
- Structured logs receive explicit `commitReached` and `rpcInvoked` (not derived from stage).

### HIGH-1 — Activation error message allowlist

**Before:** `MetaPageCredentialActivationError.message` forwarded to public JSON.

**After:**
- `safeActivationPublicMessage(code)` allowlists all API error codes.
- `mapMetaPageCredentialActivationFailure` uses code-based messages for domain, provider, and API errors.
- `buildPublicActivationErrorJson` always emits allowlisted text.
- Unknown/internal errors → generic: *"Activation failed. Contact engineering with the correlation reference."*

## Changed files

- `app/api/channel-connect/meta/verify-and-activate/route.ts`
- `src/lib/metaPageCredentialActivationDiagnostics.ts`
- `src/lib/metaPageCredentialActivationApiErrors.ts`
- `src/domain/metaPageCredentialActivationErrors.ts` (export `safeActivationMessage`)
- `src/lib/metaPageCredentialActivationDiagnostics.test.ts`
- `src/lib/metaPageCredentialActivationApiErrors.test.ts`
- `src/interfaces/api/metaPageCredentialActivationRoute.test.ts`

## commitReached semantics (final)

| Path | commitReached | rpcInvoked |
| --- | --- | --- |
| Route validation | false | false |
| Authorization | false | false |
| Target validation | false | false |
| Provider verification | false | false |
| Encryption precheck | false | false |
| RPC conflict / rollback | false | true |
| RPC thrown before result | false | true |
| Successful RPC (use case returns) | true | true |
| Post-commit health failure | true | true |

## Prohibited-action attestation

| Action | Executed |
| --- | --- |
| Production flag enabled | NO |
| Production activation call | NO |
| Production write | NO |
| Merge / deploy | NO |
| Migration | NO |

## Verification (Agent A)

| Check | Result |
| --- | --- |
| `git diff --check` | PASS |
| hidden/bidi scan | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| Targeted diagnostics tests | PASS (35) |
| `npm test` | PASS (2481) |
| `npm run build` | PASS |
