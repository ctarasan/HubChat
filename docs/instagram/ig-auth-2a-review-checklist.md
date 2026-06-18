# IG-AUTH-2A — Agent A PR Review Checklist

Use when Agent A opens the schema/repository foundation PR. **Phase 2A scope:** persistence layer only — public API and Instagram UI unchanged.

References: [`ig-oauth-architecture-adr.md`](ig-oauth-architecture-adr.md), [`ig-auth-2a-public-exposure-matrix.md`](ig-auth-2a-public-exposure-matrix.md), IG-AUTH-1B [`ig-oauth-safe-api-contract.md`](ig-oauth-safe-api-contract.md).

---

## Verdict template

```text
Verdict: PASS | PASS WITH NOTES | CHANGES REQUESTED | BLOCKED

Scope: schema/repository only?  Y/N
Public API unchanged?           Y/N
Instagram UI unchanged?         Y/N
Secret scan clean?              Y/N
```

---

## 1. Schema migration

| # | Check | Pass criteria |
|---|-------|---------------|
| S-01 | Additive only | `ALTER TABLE … ADD COLUMN`; no drop/rename of credential columns in use |
| S-02 | No plaintext token storage | No `access_token text`, `refresh_token text`, or reversible encoding in new columns |
| S-03 | No secret backfill | Migration does not `UPDATE` rows with tokens from ENV or `channel_settings.secret_json` |
| S-04 | Tenant FK | All new tables/columns tied to `tenant_id` with FK or enforced in repository |
| S-05 | Connection FK | Credential rows reference `channel_connection_id` (not tenant-global orphan credentials) |
| S-06 | Safe nullable/defaults | New columns nullable or have safe defaults; no NOT NULL without default on existing rows |
| S-07 | Partial uniqueness | Active credential uniqueness supports history (e.g. one active per type per connection) without blocking audit rows |
| S-08 | No unnecessary table lock | Avoid full-table rewrite; prefer concurrent index if large |
| S-09 | No destructive statements | No `DROP TABLE`, `TRUNCATE`, `DELETE FROM channel_credentials` in migration |
| S-10 | `schema.sql` synced | `supabase/schema.sql` or project convention updated to match migration |
| S-11 | RLS policy review | If RLS enabled, policies do not expose ciphertext to anon/authenticated client roles |
| S-12 | Index scope | Indexes include `tenant_id` for credential lookups |

### Expected logical columns (from IG-AUTH-1A — verify names in PR)

```text
auth_family / auth_method
provider_user_id
credential_version
granted_scopes
token_expires_at
last_refresh_at (internal)
last_refresh_status (internal)
reauth_required_at
```

Ciphertext remains in `encrypted_secret_value` (existing) — not a new plaintext column.

---

## 2. Repository

| # | Check | Pass criteria |
|---|-------|---------------|
| R-01 | Tenant + connection scope | Every read/write includes `tenantId` + `connectionId` (or equivalent composite key) |
| R-02 | No tenant-global lookup | No `findInstagramCredential(tenantId)` without connection for OAuth path |
| R-03 | No environment fallback | Repository does not read `process.env` for Instagram OAuth credentials |
| R-04 | Encrypted storage | Plaintext only in memory during encrypt/decrypt; persisted as ciphertext |
| R-05 | Internal vs public separation | New methods return internal records or metadata DTOs — not raw DB rows |
| R-06 | Optimistic locking | `credential_version` (or equivalent) checked on update; conflict throws typed error |
| R-07 | Atomic replacement | Token rotate = single transaction (ciphertext + expiry + version bump) |
| R-08 | Lifecycle guards | Cannot activate credential on `REVOKED` / `DISCONNECTED` connection without explicit transition |
| R-09 | Revoked/disconnected exclusion | `retrieveDecryptedCredentialForRuntime` excludes revoked rows |
| R-10 | Errors sanitized | Catch paths do not include ciphertext, token fragments, or full provider JSON |
| R-11 | SELECT explicitness | No `select("*")` on `channel_credentials` / `channel_connections` |
| R-12 | Decrypt boundary | Decrypt methods not callable from HTTP route layer in this PR |
| R-13 | Encryption key handling | Uses `channelCredentialEncryption.ts`; missing key fails closed |
| R-14 | Fingerprint only in metadata | Public metadata paths expose fingerprint hash, not plaintext |

### Anti-patterns (auto CHANGES REQUESTED)

```text
return ok(credentialRow)
spread ...row into response
findByProvider(tenantId, "INSTAGRAM") without connectionId for OAuth store
readEnvFallbackWhenDbMissing()
log.debug({ plaintextSecret })
```

---

## 3. Public API no-change gate

| # | Check | Pass criteria |
|---|-------|---------------|
| A-01 | Channel Settings routes untouched | No diff in `app/api/channel-settings/**` OR diff is comment-only |
| A-02 | `ChannelSettingPublicDto` unchanged | Type shape identical; no new fields |
| A-03 | Instagram test-connection unchanged | Still uses `channel_settings` path for Instagram |
| A-04 | No new Instagram HTTP routes | No `app/api/channel-connect/instagram/**` in 2A |
| A-05 | Frontend untouched | No diff in `ChannelSettingsPage.tsx`, `channelSettingsModel.ts` for 2A |
| A-06 | Existing tests pass | `channelSettingsG2A.test.ts` snapshots/allowlists still valid |

---

## 4. Security tests (required in Agent A PR or follow-up)

| # | Test case | Assert |
|---|-----------|--------|
| T-01 | Wrong tenant retrieve | No data / not found |
| T-02 | Wrong connection retrieve | No data / not found |
| T-03 | Duplicate active credential | Rejected by constraint or repository guard |
| T-04 | Version conflict | Second update fails; first credential unchanged |
| T-05 | Serialize public metadata | No `access_token`, `encrypted_secret_value`, `plaintextSecret` in JSON |
| T-06 | Public DTO unchanged | Channel Settings GET response shape match |
| T-07 | Row spread guard | Unit test: mapping raw row throws or strips forbidden keys |
| T-08 | Decrypt failure | Error message sanitized |
| T-09 | Store + retrieve roundtrip | Plaintext never logged in test output |
| T-10 | Migration idempotency | Re-run migration safe (`IF NOT EXISTS`) |

---

## 5. No-change frontend regression (post-merge smoke)

Run on staging after Agent A PR merges (not required for Agent B docs deliverable):

```text
[ ] ADMIN Channel Settings loads
[ ] Instagram card unchanged
[ ] GET channel settings — no OAuth secret/internal fields
[ ] PATCH legacy credential — unchanged behavior
[ ] Test Connection — unchanged
[ ] MANAGER/SALES — unchanged access denial
[ ] No console errors
[ ] No network payload leak (manual DevTools or E2E)
```

---

## 6. Scan gates (Agent B runs on Agent A PR)

```powershell
git diff --check
git diff origin/master...HEAD | rg -n "<secret patterns>"
# Hidden/bidi: U+202A–U+202E, U+2066–U+2069, U+200B–U+200D, U+FEFF
```

Secret patterns:

```text
Bearer [A-Za-z0-9]
access_token=[A-Za-z0-9]
accessToken[=:][[:space:]]*[A-Za-z0-9]
EA[A-Za-z0-9]{10,}
IGA[A-Za-z0-9]{10,}
encrypted_secret_value.*[A-Za-z0-9]{20,}
```

---

## 7. OAuth delivery-path invariant (future wiring — note in review)

Not required to implement in 2A, but repository design must not preclude:

```text
authMethod = OAUTH  must never combine with  deliveryPath = ENVIRONMENT_FALLBACK
```

Repository reads for OAuth-managed credentials: DB-bound only (IG-AUTH-1A ADR-6).

---

## 8. Review workflow

1. Fetch Agent A branch into separate worktree
2. Read migration SQL first
3. Read repository diff second
4. Confirm route/UI diff empty or out-of-scope
5. Run targeted tests: `npm test -- <repository test files>`
6. Run secret + bidi scans on PR diff
7. Post review comment with verdict template
8. Do **not** merge

---

## 9. Block conditions (immediate BLOCKED)

- Plaintext token column or backfill
- `channel_settings` or API route changes that expose new OAuth fields to browser
- Instagram UI changes in 2A PR
- Credential decrypt exposed via HTTP
- Cross-tenant credential read demonstrated in tests or code path
- ENV fallback for OAuth credential resolution in new repository methods
