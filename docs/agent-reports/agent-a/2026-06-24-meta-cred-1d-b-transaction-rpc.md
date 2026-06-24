# META-CRED-1D-B — Transactional Activation RPC and Repository Port

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-06-24 |
| Phase | META-CRED-1D-B (transaction RPC + activation port) |
| Authorization | `GO META-CRED-1D-B TRANSACTION RPC IMPLEMENTATION` |
| Base master SHA | `80e118f39b30f02484fe42e7f5260161938e5f3b` |
| Branch | `feature/meta-cred-1d-b-transaction-rpc` |
| Commit SHA | `8b2149bac66896636411cd612bd2721a1855e7d3` |
| PR | _filled at PR creation_ |
| Foundation migration | `20260623120000_meta_cred_1c_shared_meta_page_credentials.sql` |
| Foundation migration applied remotely | **NO** |

## Executive summary

Additive migration and server-side activation port for Meta Page credentials: verified metadata columns, tenant-scoped activation idempotency table, transactional `activate_meta_page_credential_tx` RPC (ciphertext-only input), and `SupabaseMetaPageCredentialActivationRepository` adapter. Stops at port layer — no API route, no rotation RPC, no resolver/worker wiring, no remote migration execution.

## Activation policy (explicit)

| Scenario | Behavior |
| --- | --- |
| No prior ACTIVE shared credential (`expectedCredentialVersion = 0`) | Insert new `meta_page_credentials` row at version 1 ACTIVE; create requested ACTIVE bindings |
| Existing ACTIVE credential (`expectedCredentialVersion ≥ 1`, `credentialId` required) | CAS update `credential_version = expected + 1`; deactivate prior ACTIVE bindings on target connections; insert fresh ACTIVE bindings at new version |
| Tenant already has ACTIVE credential on initial create | `META_ACTIVATION_CONFLICT` — rollback |
| Stale expected version on update | `META_CREDENTIAL_VERSION_CONFLICT` — zero-row update — rollback |
| Dual-channel request | Facebook + Instagram bindings in same transaction; any failure rolls back all |
| One ACTIVE credential per tenant | Enforced by 1C partial unique index `idx_meta_page_credentials_active_tenant` |
| Channel READY status | **Not mutated** — RPC returns `ACTIVATED_PENDING_HEALTH` only |

## Idempotency retention

`meta_page_credential_activation_requests` rows are retained for replay and audit. No purge job in this phase.

## 1D-C orchestration handoff

```text
VerifyMetaPageCredentialUseCase
→ encrypt access token in orchestration (consumeAccessToken)
→ MetaPageCredentialActivationPort.activate (ciphertext + proof metadata)
→ activate_meta_page_credential_tx
```

Proof boundary preserved: port requires `VerifiedMetaPageCredentialProof`; adapter maps `proof.metadata` to RPC parameters only.

## Deliverables

| Area | Artifact |
| --- | --- |
| Migration | `supabase/migrations/20260624120000_meta_cred_1d_activation_rpc.sql` |
| Schema mirror | `supabase/schema.sql` (columns, idempotency table, RLS) |
| Domain | `metaPageCredentialActivation.ts`, `metaPageCredentialActivationErrors.ts` |
| Port | `MetaPageCredentialActivationPort` in `ports.ts` |
| Adapter | `supabaseMetaPageCredentialActivationRepository.ts` |
| Fingerprint helper | `metaPageCredentialActivationFingerprint.ts` |
| Tests | migration contract, adapter, wiring, domain errors |

## Scope isolation

| Path | Changed |
| --- | --- |
| `app/api/channel-connect/meta/*` | NO |
| `rotate_meta_page_credential_tx` | NO |
| Resolvers / worker / webhooks | NO |
| Provider verifier behavior | NO |
| ENV / UI | NO |

## Prohibited-action attestation

| Action | Executed |
| --- | --- |
| Remote DB migration | NO |
| Credential import/write to production | NO |
| Activation API route | NO |
| Rotation RPC | NO |
| Resolver cutover | NO |
| ENV change | NO |

## META-CRED-1D-B TRANSACTION RPC RESULT

```text
META-CRED-1D-B TRANSACTION RPC RESULT

Base master SHA: 80e118f39b30f02484fe42e7f5260161938e5f3b
Branch: feature/meta-cred-1d-b-transaction-rpc
Commit SHA: 8b2149bac66896636411cd612bd2721a1855e7d3
PR: _filled at PR creation_

Migration:
- File: 20260624120000_meta_cred_1d_activation_rpc.sql
- Version unique: YES
- Existing migration changed: NO (1C untouched)
- History rewrite: NO
- Repair required: NO
- Executed: NO

Metadata:
- Granted scopes: YES (text[], active requires non-empty)
- Token expiry: YES
- Data-access expiry: YES
- Provider token type: YES
- Verification version: YES
- Raw provider payload: NO

Idempotency:
- Table: meta_page_credential_activation_requests
- Tenant uniqueness: UNIQUE (tenant_id, idempotency_key)
- Same-key replay: YES (COMPLETED + matching fingerprint)
- Different-payload conflict: META_ACTIVATION_CONFLICT
- Response safety: sanitized JSON only; no ciphertext/token
- Token plaintext in fingerprint: NO (SHA-256 of non-secret inputs + tokenFingerprint)

Activation RPC:
- Function: activate_meta_page_credential_tx
- SECURITY DEFINER: YES
- Search path: public, pg_temp
- Execute grants: REVOKE PUBLIC/anon/authenticated; GRANT service_role
- Ciphertext-only input: YES
- Tenant validation: YES
- Connection locks: SELECT … FOR UPDATE
- Channel-type validation: YES
- Credential family validation: META_PAGE_FACEBOOK_LOGIN only
- CAS: YES (expected credential version)
- FB-only atomicity: YES
- Dual-channel atomicity: YES
- Binding version synchronization: YES
- READY status mutation: NO
- Return payload safety: ACTIVATED_PENDING_HEALTH + IDs/versions only

Activation port:
- Proof required: YES
- One RPC call: YES
- Raw Supabase errors: sanitized
- Provider call: NO
- Legacy fallback: NO
- ENV fallback: NO
- Runtime wiring: NO

Rotation RPC implemented: NO
Activation API implemented: NO
Resolver changed: NO
UI changed: NO

Verification:
- Focused tests: 21/21 PASS
- Full tests: 2368/2368 PASS
- Typecheck: PASS
- Lint: PASS
- Build: PASS
- git diff --check: PASS
- Hidden/bidi scan: PASS
- Secret scan: PASS
- Migration duplicate scan: PASS
- Plaintext SQL parameter scan: PASS
- Runtime wiring scan: PASS

Remote DB migration executed: NO
Credential changed: NO
ENV changed: NO
Resolver cutover executed: NO
Legacy plaintext cleaned: NO
Outbound operation executed: NO

Decision: READY FOR AGENT B REVIEW

Recommended next gate: META-CRED-1D-B-B INDEPENDENT TRANSACTION RPC REVIEW

Operational state: HOLD — NO DATABASE MIGRATION EXECUTION OR CREDENTIAL CUTOVER
```
