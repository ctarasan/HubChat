# Channel Connect — Outbound Rollout Readiness (CCP-3.1)

**Status:** Rollout-readiness documentation only — **no production flag flip in this phase**  
**Audience:** SmartKorp HubChat ops / Agent A–B rollout owners  
**Last updated:** 2026-06-06

**CCP-3.9 (2026-06-06):** [`channel-connect-db-only-readiness-assessment.md`](channel-connect-db-only-readiness-assessment.md) — analysis-only **`DB_ONLY` readiness assessment**. Verdict: **`DB_ONLY` NOT READY** for long-running production; remain on **`DB_WITH_ENV_FALLBACK`**.

**CCP-4.0 (2026-06-06):** [`channel-connect-db-only-rehearsal-plan.md`](channel-connect-db-only-rehearsal-plan.md) — controlled **`DB_ONLY` rehearsal plan**.

**CCP-4.2 (2026-06-06):** [`channel-connect-db-only-rollout-decision.md`](channel-connect-db-only-rollout-decision.md) — rollout decision; next candidate **CCP-4.3**.

**CCP-4.3 (2026-06-06):** [`docs/agent-reports/agent-a/2026-06-06-ccp-4-3-line-db-only-extended-pilot-evidence.md`](agent-reports/agent-a/2026-06-06-ccp-4-3-line-db-only-extended-pilot-evidence.md) — LINE **`DB_ONLY` extended pilot evidence (**HOLD**); 30-minute window.

---

## Purpose and scope

This runbook describes how to **safely prepare and execute** a controlled rollout of outbound credential resolution from legacy **ENV / `channel_settings`** paths to **CCP-1** (`channel_connections` / `channel_credentials`), using **CCP-3** worker integration behind `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED`.

**In scope**

- Railway worker outbound (LINE, Facebook Messenger, Instagram DM / existing outbound routes)
- Credential migration **planning** and verification steps (placeholders only — no real secrets in git)
- Controlled enablement of `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` with `DB_WITH_ENV_FALLBACK` per provider

**Out of scope (this rollout)**

- Inbound webhooks (still legacy ENV verification)
- Setup Wizard UI, Meta OAuth, LINE Module Channel
- `DB_ONLY` production cutover
- Marketplace module
- Vercel/Railway env changes via this documentation PR

---

## Current state after CCP-3

| Layer | What exists | Production today |
|-------|-------------|------------------|
| **CCP-1** | `channel_connections`, `channel_credentials`, AES-256-GCM vault, repository | Tables exist; credentials populated per tenant when ops/scripts run |
| **CCP-2** | `resolveOutboundChannelCredential`, sanitized diagnostics, runtime mode parsing | Code only; not wired to send path without flag |
| **CCP-3** | Worker outbound bridge + `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **Flag default off** → outbound still **legacy** |

**Critical:** `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` must remain **unset or `false`** until a planned rollout window. While off:

- Worker does **not** instantiate `SupabaseChannelConnectionRepository` for outbound
- LINE / Facebook / Instagram outbound use existing `channel_settings` + deployment ENV behavior
- Inbound webhooks remain unchanged (global routes, platform secrets)

**Future phases (not this rollout):** Setup Wizard, OAuth, LINE Module Channel, inbound connection-specific webhooks (CCP-4+), `DB_ONLY` per provider.

---

## Required prerequisites

Before any provider rollout:

1. **CCP-1 migration applied** in production Supabase (`channel_connections`, `channel_credentials`).
2. **`HUBCHAT_CREDENTIAL_ENCRYPTION_KEY`** set in **Railway worker** (and any runtime that writes credentials). Same key material as used when encrypting stored credentials.
3. **Legacy outbound smoke passes** with flag **off** (baseline).
4. **Per-tenant `channel_connections` row** for each provider being migrated (`status` at least `CONNECTED` / outbound-ready set: `READY`, `OUTBOUND_VERIFIED`, etc.).
5. **Credential metadata** shows `credential_state = SET` for required types (see migration section) — verify via metadata/fingerprint only, never plaintext.
6. **Provider account / page IDs** on the connection row match the channel that already works in production.
7. **Rollback owner** and maintenance window agreed (who can set flag false + redeploy worker).
8. **Do not enable `DB_ONLY`** until `DB_WITH_ENV_FALLBACK` has passed for all target providers with **no unexpected `ENV_FALLBACK`** when DB credentials are expected.

---

## Environment and flag inventory

| Variable | Where | Purpose | Safe rollout values |
|----------|-------|---------|---------------------|
| `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` | Railway worker (required for CCP decrypt); Vercel if writing credentials | AES key for `channel_credentials.encrypted_secret_value` | Must be set **before** storing credentials; never log or commit |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | Railway worker | Gates CCP-3 outbound DB reads | **Before rollout:** unset or `false`. **During controlled test:** `true` only in planned window |
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | Railway worker | Legacy + CCP mode for LINE | **Before:** current ops value (often `ENV_ONLY` or `DB_WITH_ENV_FALLBACK`). **During CCP test:** `DB_WITH_ENV_FALLBACK` for LINE |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | Railway worker | Same for Facebook | **During CCP test:** `DB_WITH_ENV_FALLBACK` for Facebook |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | Railway worker | Same for Instagram | **During CCP test:** `DB_WITH_ENV_FALLBACK` for Instagram |

**Literal flag rule:** Only the string `true` enables the resolver (`HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true`). Values like `TRUE` or `1` do **not** enable it.

**Do not set (this phase)**

- `DB_ONLY` on any provider until all targets pass `DB_WITH_ENV_FALLBACK` with stable `configSource: DB` and rollback is proven.

**Legacy ENV (remain during rollout as fallback)**

Examples (keep configured until cutover complete):

- LINE: `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`
- Facebook: `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_PAGE_ID`, graph version vars
- Instagram: `INSTAGRAM_ACCESS_TOKEN` / `FACEBOOK_PAGE_ACCESS_TOKEN`, page/account IDs, graph version vars

---

## Credential migration strategy

### Legacy sources → CCP target

| Provider | Legacy sources | CCP tables | Runtime mapping (CCP-3) |
|----------|----------------|------------|-------------------------|
| LINE | `channel_settings` secrets, worker ENV | `channel_connections` + `channel_credentials` | `ACCESS_TOKEN` → channel access token; `CHANNEL_SECRET` → channel secret |
| FACEBOOK | `channel_settings`, `FACEBOOK_PAGE_*` ENV | same | `ACCESS_TOKEN` → page access token; `provider_page_id` on connection |
| INSTAGRAM | `channel_settings`, page/token ENV | same | `ACCESS_TOKEN` → access token; `provider_page_id`, `provider_ig_account_id` |

**DB credential types (CCP-1)** — store via encrypted vault only:

- LINE: `ACCESS_TOKEN`, `CHANNEL_SECRET`
- FACEBOOK: `ACCESS_TOKEN` (page token)
- INSTAGRAM: `ACCESS_TOKEN`

Inbound-only types (`APP_SECRET`, `VERIFY_TOKEN`) are **not** required for this outbound rollout.

### Recommended migration path (no secrets in git)

1. **Prefer application/repository path:** server-side script or admin tool calling `ChannelConnectionRepository.storeEncryptedCredential` with plaintext supplied **only** in secure runtime (Railway one-off, local with env file excluded from git).
2. **Alternative:** Supabase SQL editor with **placeholders** replaced offline — never commit filled SQL.

**Placeholder reference (replace outside git only):**

```
LINE access token:     <LINE_CHANNEL_ACCESS_TOKEN>
LINE channel secret:   <LINE_CHANNEL_SECRET>
Facebook page token:   <FACEBOOK_PAGE_ACCESS_TOKEN>
Facebook page id:      <FACEBOOK_PAGE_ID>
Instagram access token:<INSTAGRAM_ACCESS_TOKEN> or <FACEBOOK_PAGE_ACCESS_TOKEN>
Instagram page id:     <INSTAGRAM_PAGE_ID> / <FACEBOOK_PAGE_ID>
Instagram business id: <INSTAGRAM_ACCOUNT_ID> (if used)
```

**Example metadata-only verification (safe to run):**

```sql
-- Replace <TENANT_ID> and <PROVIDER> — no secrets in query
SELECT cc.id, cc.provider, cc.status, cc.provider_account_id, cc.provider_page_id,
       cred.credential_type, cred.credential_state, cred.secret_fingerprint
FROM channel_connections cc
LEFT JOIN channel_credentials cred ON cred.connection_id = cc.id
WHERE cc.tenant_id = '<TENANT_ID>' AND cc.provider = '<PROVIDER>';
```

**Do not** insert raw tokens into `channel_connections` columns. Secrets belong only in `channel_credentials.encrypted_secret_value` via CCP-1 encryption.

### Connection lifecycle

After credentials stored:

- Set connection `status` to an outbound-ready value (e.g. `READY` or `OUTBOUND_VERIFIED`) per ops policy.
- Record `provider_account_id` / `provider_page_id` matching the live channel.

---

## Safe migration notes

- **Never** paste secrets into logs, GitHub PRs, docs, chat tools, or screenshots.
- **Never** commit `.env`, SQL dumps, or migration files containing real tokens.
- Use **fingerprints / `credential_state` / `SET`** for verification — not decrypted values.
- If decrypt fails during rollout, fix key alignment or re-store credential — do not log ciphertext or plaintext.
- Public APIs and DTOs must not expose `encrypted_secret_value` or plaintext (CCP-1 design).
- Manual DB writes: if unavoidable, use encryption-compatible format from CCP-1 library in a secure script — not ad-hoc plaintext columns.

---

## Per-provider rollout checklist

Repeat for **LINE**, then **FACEBOOK**, then **INSTAGRAM** (one provider per window recommended).

### Pre-check (flag off)

- [ ] Outbound smoke passes with `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` unset/false
- [ ] `channel_connections` row exists for tenant + provider
- [ ] Required `channel_credentials` metadata: `credential_state = SET` for provider types above
- [ ] No raw secret in public views, API responses, or worker logs
- [ ] `provider_account_id` / `provider_page_id` / `provider_ig_account_id` match working channel
- [ ] `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` present on worker

### Rollout (controlled window)

- [ ] Set **only this provider** to `HUBCHAT_*_RUNTIME_CONFIG_MODE=DB_WITH_ENV_FALLBACK`
- [ ] Set `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` on **Railway worker only**
- [ ] Redeploy / restart worker; confirm startup log `channelConnectResolverEnabled: true`
- [ ] Send outbound test message (see smoke section)
- [ ] Confirm `delivery_status` → `SENT`, `external_message_id` populated
- [ ] Confirm `queue_jobs` terminal `DONE`, `last_error` null
- [ ] Worker logs: `resolutionPath: channel_connect_db` or acceptable `legacy_fallback` with documented reason — **no token substrings**

### Rollback (practice before go-live)

- [ ] Set `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=false`
- [ ] Redeploy / restart worker
- [ ] Outbound works via legacy path
- [ ] Leave DB credentials in place (do not delete on incident)

---

## Controlled rollout sequence

1. **Baseline (production):** flag off, document current runtime modes, run full legacy smoke.
2. **Data prep (per tenant):** create/update `channel_connections`, store encrypted credentials, verify metadata SET.
3. **Single-provider pilot:** enable `DB_WITH_ENV_FALLBACK` for one provider + flag `true` on worker during window.
4. **Observe** 24–48h: queue depth, error rate, diagnostic codes, no secret leak.
5. **Repeat** for next provider; keep legacy ENV/channel_settings as fallback.
6. **Stabilize:** flag may return to `false` between providers if desired; DB rows remain for next attempt.
7. **Future (not now):** after all providers stable on DB path with no unexpected fallback → plan `DB_ONLY` per provider in a separate phase.

---

## Smoke test checklist

### LINE

- [ ] Outbound text to known test user/conversation
- [ ] Optional image outbound if enabled in tenant
- [ ] Worker logs: no `LINE_CHANNEL_ACCESS_TOKEN`, Bearer prefixes, or EA* token patterns

### Facebook

- [ ] Messenger DM text
- [ ] Comment-thread conversation: public acknowledgement path unchanged
- [ ] Private reply path unchanged (no new stuck `PENDING` idempotency loop)
- [ ] Logs: no page access token leakage

### Instagram

- [ ] DM text
- [ ] Image outbound if tenant uses it (media policy unchanged)
- [ ] Comment private reply path unchanged
- [ ] Logs: no access token leakage

### Common (all providers)

- [ ] `queue_jobs.status` → `DONE` (or expected terminal success)
- [ ] `messages.delivery_status` → `SENT`
- [ ] `messages.external_message_id` not null
- [ ] Worker structured logs include safe fields only (`diagnosticCode`, `resolutionPath`, `runtimeSource`)
- [ ] No provider token in HTTP API responses or browser network tab from HubChat APIs

---

## Observability and diagnostics

Expected **safe** log / diagnostic codes (CCP-2/3):

| Code / field | Meaning |
|--------------|---------|
| `resolutionPath: legacy` | Flag off or ENV_ONLY — legacy path |
| `resolver_disabled_legacy_env` | Flag off |
| `resolutionPath: channel_connect_db` | CCP credential used |
| `resolutionPath: legacy_fallback` | CCP miss; fell back to `channel_settings`/ENV |
| `db_connection_missing` | No connection row |
| `db_credential_missing` | Connection exists, credential not SET |
| `credential_decrypt_failed` | Vault/decrypt issue |
| `encryption_key_missing` | Worker key not configured |
| `credential_state_invalid` | Metadata not SET |
| `provider_account_mismatch` | Account/page id mismatch |
| `configSource` (internal) | `DB` / `ENV_FALLBACK` / `ENV_ONLY` |

**During rollout**

- **`ENV_FALLBACK` / `legacy_fallback` when DB was expected** → NO-GO for that provider until root-caused (wrong tenant, status, missing SET, key mismatch).
- **Do not enable `DB_ONLY`** until DB path is consistently used and fallback is no longer needed.

**Railway checks**

- Worker boot: `[worker] Channel Connect outbound resolver { channelConnectResolverEnabled: ... }`
- Per-send logs: `LINE/Facebook/Instagram outbound runtime config resolved` with `runtimeSource`, no secret fields

---

## Rollback plan

**Fast rollback (< 15 min target)**

1. Set `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=false` on Railway worker.
2. Redeploy or restart worker processes.
3. Confirm boot log shows `channelConnectResolverEnabled: false`.
4. Run one outbound smoke per active provider (legacy path).
5. **Do not delete** `channel_connections` / `channel_credentials` during incident.
6. Inspect sanitized logs + `queue_jobs.last_error` (sanitized) for root cause.
7. Optionally revert provider runtime mode to pre-rollout value if needed.

Legacy ENV and `channel_settings` remain the source of truth while flag is off.

---

## Go / no-go gates

### GO (per provider)

- Flag-off legacy smoke passed immediately before window
- DB credential metadata shows **SET** for required types
- `DB_WITH_ENV_FALLBACK` + flag `true` smoke: message **SENT** with `external_message_id`
- Logs show `channel_connect_db` when DB prep complete (or documented acceptable fallback)
- No token/secret-like substrings in worker logs
- No new dead letters / stuck `PROCESSING` outbound jobs
- Rollback steps documented and tested or dry-run

### NO-GO

- `credential_decrypt_failed` or `encryption_key_missing` unresolved
- `provider_account_mismatch`
- Unexpected `ENV_FALLBACK` / `legacy_fallback` after credentials verified SET
- Suspected token leak in logs or API
- Outbound `FAILED` / `DEAD_LETTER` spike
- Provider error rate increase vs baseline
- Any pressure to enable **`DB_ONLY`** before fallback-free DB path — **stop**

---

## Warnings

> **Do not enable `DB_ONLY` in production during CCP-3.1.** Use `DB_WITH_ENV_FALLBACK` until every target provider consistently resolves from `channel_connections` without relying on legacy fallback.

> **Do not paste or commit real tokens/secrets** in docs, SQL files, PRs, or chat. Use placeholders and secure channels only.

> **Do not set `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` in production** until this runbook’s pre-checks and migration steps are complete for that tenant/provider.

---

## Related documents

- [CCP-0 architecture](../agent-reports/agent-a/2026-06-04-ccp-0-channel-connect-platform-audit-and-architecture.md)
- [CCP-1 foundation](../agent-reports/agent-a/2026-06-04-ccp-1-channel-connection-credential-foundation.md)
- [CCP-2 resolver](../agent-reports/agent-a/2026-06-04-ccp-2-db-runtime-resolver-foundation.md)
- [CCP-3 worker integration](../agent-reports/agent-a/2026-06-04-ccp-3-feature-flagged-worker-outbound-integration.md)
