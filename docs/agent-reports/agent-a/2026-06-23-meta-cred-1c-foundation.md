# META-CRED-1C — Shared Meta Page Credential Foundation

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-06-23 |
| Phase | META-CRED-1C (code foundation) |
| Authorization | `GO META-CRED-1C CODE FOUNDATION` |
| Base master SHA | `51ed93bd9a63a246ef1d2b014fc3eeea810d992f` |
| Branch | `feature/meta-cred-1c-foundation` |
| Commit SHA | `cbbcdc69abc3b24877b512d7242c37fd371c1f84` |
| PR | https://github.com/ctarasan/HubChat/pull/283 |
| Prior plan | META-CRED-1B merged (`787d3862812d5308ac2d1a1b82ae6f616e7f0a49`) |

## Executive summary

Additive foundation for shared encrypted Meta Page credentials (`META_PAGE_FACEBOOK_LOGIN` only) with binding table, tenant-isolated composite FKs, encryption reuse, CAS versioning, and repository contract. No resolver, API, UI, ENV, migration execution, or credential import in this phase.

## Scope delivered

| Area | Artifact |
| --- | --- |
| Migration | `supabase/migrations/20260623120000_meta_cred_1c_shared_meta_page_credentials.sql` |
| Schema mirror | `supabase/schema.sql` (additive) |
| Domain | `src/domain/metaPageCredentials.ts`, `metaPageCredentialErrors.ts` |
| Validation | `src/lib/metaPageCredentialValidation.ts` (IGA rejection) |
| DTO/mapping | `src/lib/metaPageCredentialPublicDto.ts` |
| Repository | `src/infrastructure/adapters/repositories/supabaseMetaPageCredentialRepository.ts` |
| Port | `MetaPageCredentialRepository` in `src/domain/ports.ts` |
| Tests | migration contract, domain, repository (39 focused + full regression) |

## Repository contract

- `createVerifiedCredential` — encrypt plaintext in memory, persist ACTIVE with `verified_at`
- `getCredentialById` — tenant-scoped metadata only
- `getActiveCredentialForBinding` — active binding + matching credential version
- `listBindingsForCredential`
- `bindChannelConnection` — idempotent retry, version guard, revoked block
- `rotateCredentialWithExpectedVersion` — CAS increment
- `revokeCredential` — soft revoke (no hard delete)
- `retrieveDecryptedMaterial` — internal runtime only

## RLS and access model

- RLS enabled on `meta_page_credentials` and `meta_page_credential_bindings`
- No permissive policies — direct client/tenant JWT access denied by default
- Repository intended for service-role server paths only
- Metadata selects exclude `encrypted_access_token`

## Encryption

| Item | Value |
| --- | --- |
| Helper | `channelCredentialEncryption.ts` |
| Key | `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` |
| Envelope | AES-256-GCM `v1:{iv}:{ciphertext}:{tag}` |
| Fingerprint | `fingerprintSecretValue()` SHA-256 prefix (12 hex) |
| Missing/wrong/tampered key | Fail closed → sanitized domain errors |
| Plaintext fallback | None |

## Migration safety

| Check | Result |
| --- | --- |
| Version `20260623120000` unique | YES |
| History rewrite | NO |
| Repair required | NO |
| Executed remotely | NO |
| Destructive DDL in forward migration | NO |

## Scope isolation attestation

| Path | Changed |
| --- | --- |
| Facebook runtime resolver | NO |
| Instagram legacy runtime | NO |
| Instagram OAuth resolver | NO |
| LINE | NO |
| API endpoints | NO |
| UI | NO |
| ENV flags | NO |
| Worker / webhooks | NO |

## Verification

| Command | Result |
| --- | --- |
| `git diff --check` | PASS |
| Migration duplicate scan | PASS (`supabaseMigrationVersionUniqueness.test.ts` + migration test) |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS (2306/2306) |
| `npm run build` | PASS |
| Hidden/bidi scan (changed files) | PASS |
| Secret scan (changed files) | PASS |

## Prohibited-action attestation

| Action | Executed |
| --- | --- |
| Remote DB migration | NO |
| Credential import/write to production | NO |
| Resolver cutover | NO |
| Legacy plaintext cleanup | NO |
| Outbound smoke | NO |
| ENV change | NO |

## META-CRED-1C FOUNDATION RESULT

```text
META-CRED-1C FOUNDATION RESULT

Base master SHA: 51ed93bd9a63a246ef1d2b014fc3eeea810d992f
Branch: feature/meta-cred-1c-foundation
Commit SHA: cbbcdc69abc3b24877b512d7242c37fd371c1f84
PR: https://github.com/ctarasan/HubChat/pull/283

Migration:
- File: 20260623120000_meta_cred_1c_shared_meta_page_credentials.sql
- Version unique: YES
- History rewrite: NO
- Repair required: NO
- Executed remotely: NO

Credential family:
- DB guard: meta_page_credential_family enum (META_PAGE_FACEBOOK_LOGIN only)
- Domain guard: assertMetaPageCredentialFamily
- Unsupported family rejection: YES (INSTAGRAM_BUSINESS_LOGIN rejected)
- Instagram OAuth isolation: YES (separate table/path unchanged)

Schema:
- Credential table: meta_page_credentials
- Binding table: meta_page_credential_bindings
- Composite tenant credential FK: YES
- Composite tenant connection FK: YES
- Facebook-only support: YES (IG id nullable; IG binding requires id)
- Binding uniqueness: one ACTIVE per connection; one ACTIVE per credential+channel_type
- Status lifecycle: PENDING | ACTIVE | ERROR | REVOKED
- Versioning: credential_version CAS
- Delete behavior: bindings CASCADE on connection; credential RESTRICT + soft REVOKED

Encryption:
- Helper reused: channelCredentialEncryption.ts
- Envelope: v1 AES-256-GCM
- Key source: HUBCHAT_CREDENTIAL_ENCRYPTION_KEY
- Missing key: fail closed
- Wrong key: fail closed
- Tamper behavior: fail closed
- Plaintext fallback: NO
- Fingerprint: SHA-256 prefix via fingerprintSecretValue

Repository:
- Tenant-scoped: YES
- CAS/version guard: YES
- Rotation: rotateCredentialWithExpectedVersion
- Revocation: revokeCredential (soft)
- Binding transaction: precondition validation; idempotent retry
- Cross-tenant rejection: YES (not-found semantics)

Scope isolation:
- Facebook runtime changed: NO
- Instagram runtime changed: NO
- Instagram OAuth changed: NO
- LINE changed: NO
- API/UI changed: NO
- ENV changed: NO

Verification:
- git diff --check: PASS
- Migration duplicate scan: PASS
- Typecheck: PASS
- Lint: PASS
- Tests: PASS (2306/2306)
- Build: PASS
- Hidden/bidi scan: PASS
- Secret scan: PASS

Remote DB migration executed: NO
Credential imported/changed: NO
Resolver cutover executed: NO
Legacy plaintext cleaned: NO
Outbound operation executed: NO

Decision: READY FOR AGENT B REVIEW

Recommended next gate: META-CRED-1C-B INDEPENDENT FOUNDATION REVIEW

Operational state: HOLD — NO DATABASE MIGRATION EXECUTION OR CREDENTIAL CUTOVER
```
