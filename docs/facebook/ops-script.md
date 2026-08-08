# Manual Ops Script — Default Tenant Facebook Subscribe

Operator reference for `scripts/ops/subscribe-default-tenant-facebook-page.mjs`.

---

## Purpose

Repairs Page `subscribed_apps` for the **Default Tenant (App Review) Facebook Page** using the same union-preserving algorithm as production OAuth (PR #316, #318).

Use when:

- Health auto-repair cannot run (e.g. offline ops intervention)
- Verifying subscription state before App Review evidence capture
- Recovering Default Tenant Page after subscription drift

**Do not use for SmartKorp production tenant Pages.** The script refuses SmartKorp by design.

---

## Safety model (post-PR #318)

| Property | Behavior |
| --- | --- |
| Default mode | **Dry-run** — zero Graph POST |
| Write mode | Requires explicit `--apply` |
| GET before POST | Always — GET failure aborts with no POST |
| Union algorithm | Preserves existing fields + adds Messenger + `feed` |
| Idempotent | Skips POST when all required fields already present |
| Token logging | Never — output is redacted |
| Target guards | Default Tenant only; SmartKorp refused |

The script **cannot** repeat the 2026 incident (Messenger-only POST removing `feed`).

---

## Usage

```bash
# Dry-run (default) — plan only, NO Graph POST
node --import tsx scripts/ops/subscribe-default-tenant-facebook-page.mjs

# Apply — GET → union → POST → GET verify
node --import tsx scripts/ops/subscribe-default-tenant-facebook-page.mjs --apply

# Help
node --import tsx scripts/ops/subscribe-default-tenant-facebook-page.mjs --help
```

Requires:

- Node with `tsx` import support
- Vercel CLI authenticated (script pulls production env via `vercel env pull`)
- `META_APP_ID`, Supabase service credentials, credential encryption key in production env

---

## Modes

### Dry-run (default)

1. Pull production env (local temp file, deleted after read)
2. Load Default Tenant Facebook connection + decrypt Page token
3. Assert target guards
4. Verify Page token identity via Graph `/me`
5. GET `subscribed_apps`
6. Plan union (existing + required fields)
7. Print summary — **no POST, no DB write**

Example summary fields:

```text
Mode: DRY RUN
Existing fields: messages, feed, ...
Fields to add: message_echoes
Final fields: ...
Write performed: NO
Verification: NOT RUN
```

Exit code 0 on successful plan (even if fields need adding).

### Apply (`--apply`)

All dry-run steps, then:

1. `subscribeAndVerifyFacebookPageWebhook()` with `skipPostIfAlreadyComplete: true`
2. On success: update `channel_connections.webhook_active` and `webhook_endpoint`
3. Print summary with `Verification: PASS`

Exit code 1 on guard failure, GET failure, POST failure, or verify failure.

---

## Target guards

The script refuses to run unless all guards pass:

| Guard | Error code | Reason |
| --- | --- | --- |
| SmartKorp tenant | `refusing_smartkorp_tenant` | Production tenant must not be modified by this script |
| Wrong tenant ID | `unexpected_tenant_id` | Only Default Tenant UUID allowed |
| Wrong Page ID | `unexpected_page_id` | Only App Review Page ID allowed |
| Missing `META_APP_ID` | `missing_or_invalid_META_APP_ID` | Cannot verify HubChat app subscription |
| Missing Page token | `missing_page_token` | No credential in DB |
| Token identity mismatch | `page_token_resolves_to_different_page` | Token is not for expected Page |

Constants: `DEFAULT_TENANT_SUBSCRIBE_TARGET` in `subscribeDefaultTenantFacebookPageOps.ts`.

---

## Verification output

On successful `--apply`:

```text
Write performed: YES   (or NO if already complete)
Verification: PASS
Action: POST union subscribed_fields   (or SKIP POST (already complete))
```

Final GET confirms HubChat App subscribed with all six required fields.

---

## Redaction

`redactSubscribeOpsText()` strips from all output:

- Page access tokens (`EAA…` pattern)
- `access_token=` query parameters
- Encryption keys and service role key values passed as secrets
- `encrypted_secret_value` field names in errors

Never disable redaction. If output contains `[REDACTED]`, that is expected.

---

## Never run on SmartKorp

SmartKorp production Facebook Page uses Assisted Connection + operational health for subscription repair.

Running this script against SmartKorp:

1. Is blocked by tenant guard (`refusing_smartkorp_tenant`)
2. Would be the wrong operational path even if unblocked
3. Risks unintended Graph writes on production customer Page

For SmartKorp subscription issues → use Channel Settings health or reconnect flow.

---

## When to prefer health over script

| Scenario | Preferred path |
| --- | --- |
| SmartKorp production Page | Channel Settings → Run health |
| Default Tenant, operator has UI access | Assisted Connection health |
| Default Tenant, offline ops / CI | This script (dry-run first) |
| Verify only, no writes | Dry-run (default) |

---

## Related documents

- [webhook-subscription.md](./webhook-subscription.md) — union algorithm detail
- [health-check.md](./health-check.md) — `PAGE_WEBHOOK_SUBSCRIPTION`
- [operator-runbook.md](./operator-runbook.md) — when to escalate
- [../postmortem/2026-facebook-recovery.md](../postmortem/2026-facebook-recovery.md) — why this script was hardened
