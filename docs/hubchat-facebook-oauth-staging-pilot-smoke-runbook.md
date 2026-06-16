# HubChat Facebook OAuth — Staging / Pilot Smoke and Rollback Runbook (FB-OAUTH-1F)

Operator-facing guide for **controlled staging and single-tenant pilot** validation of Facebook OAuth assisted connection (Meta OAuth → Page selection → operational health → CONNECTED → worker outbound), plus reconnect and rollback discipline.

**Phase:** FB-OAUTH-1F (documentation only — no runtime changes in this deliverable)

**Production rollout is not complete.** Do not enable OAuth broadly in production until this runbook passes on staging/pilot and release owners sign off.

**Authoritative contracts and implementation reports:**

- [`docs/agent-reports/agent-a/2026-06-13-fb-oauth-1a-discovery-contract.md`](agent-reports/agent-a/2026-06-13-fb-oauth-1a-discovery-contract.md)
- [`docs/agent-reports/agent-a/2026-06-15-fb-oauth-1c-runtime-health-reconnect.md`](agent-reports/agent-a/2026-06-15-fb-oauth-1c-runtime-health-reconnect.md)
- [`docs/agent-reports/agent-a/2026-06-16-fb-oauth-1e-worker-outbound-credential.md`](agent-reports/agent-a/2026-06-16-fb-oauth-1e-worker-outbound-credential.md)
- [`docs/agent-reports/agent-b/2026-06-15-fb-oauth-1d-ui-discovery-spec.md`](agent-reports/agent-b/2026-06-15-fb-oauth-1d-ui-discovery-spec.md)

**Related manual runbooks:**

- Channel Settings confidence: [`docs/hubchat-channel-settings-runtime-confidence-runbook.md`](hubchat-channel-settings-runtime-confidence-runbook.md)
- Manual Facebook Page onboarding: [`docs/prod-cutover-1b-operator-runbook.md`](prod-cutover-1b-operator-runbook.md)
- Webhook smoke: [`docs/hubchat-webhook-smoke-runbook.md`](hubchat-webhook-smoke-runbook.md)
- Worker queue observability: [`docs/hubchat-worker-queue-observability-runbook.md`](hubchat-worker-queue-observability-runbook.md)

---

## Capability matrix (read first)

| Check area | On `master` (PRs #222–#228) | Requires **Meta config / App Review** | Requires **pilot deployment + ops discipline** |
|------------|------------------------------|---------------------------------------|-----------------------------------------------|
| OAuth UI on Channel Settings | Yes — when `HUBCHAT_FACEBOOK_OAUTH_ENABLED=true` | App + redirect URI | Environment-wide flag on **isolated staging/pilot deploy** |
| Connect / callback / Page picker / complete | Yes | Valid App ID/secret; callback URL; Page admin | OAuth flag on pilot deploy |
| `POST /health` five-check validation | Yes (not 501) | Graph reachable | Resolver flag for `RUNTIME_TEST_CONNECTION` PASS |
| UI `CONNECTED` only after all five PASS | Yes | — | Resolver flag + successful health |
| Reconnect (`NEEDS_RECONNECT` → Meta) | Yes | Same Meta app/callback | OAuth flag |
| **Worker outbound via OAuth `channel_credentials`** | **Yes** — PR [#228](https://github.com/ctarasan/HubChat/pull/228) (FB-OAUTH-1E) | Page messaging permissions | Connection `READY` + resolver enabled |
| Manual Facebook Channel Settings | Yes (unchanged) | Manual token if used | Existing runtime mode policy |
| OAuth-managed Test Connection path | Yes | — | Resolver flag |
| Inbound Graph off global env token | No (deferred) | — | Separate follow-up |
| Broad production OAuth enablement | No | App Review understood | Staging/pilot smoke PASS + sign-off |

---

## Worker outbound path (FB-OAUTH-1E)

Document this chain when capturing outbound evidence:

```
Queue job (token-free OutboundMessageRequestedPayload)
  → OutboundWorker
  → SendOutboundMessageUseCase.execute()
      → conversation lookup (providerPageId)
      → Facebook outbound adapter resolver
      → resolveFacebookWorkerOutboundConfig()
      → resolveOutboundChannelCredential()
      → encrypted channel_credentials (server-side decrypt)
      → FacebookAdapter → Graph send
      → existing delivery / retry / idempotency / dead-letter handling
```

**Operator facts:**

- Credential resolves at **worker execution time**; each retry re-resolves (no cached token in job metadata).
- No token in queue jobs, outbox rows, message metadata, activity metadata, or browser DTOs.
- Credential/resolver failure occurs **before** Graph send.
- Resolver failure must **not** mark the message DONE (existing terminal-state rules apply).
- Retry, delivery, dead-letter, and idempotency semantics are **unchanged** from pre-1E.

---

## Feature flags (environment-wide)

Both flags are **environment-wide** on a given Vercel/Railway deployment:

- `HUBCHAT_FACEBOOK_OAUTH_ENABLED`
- `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED`

**Pilot scoping** requires **deployment/environment isolation** (e.g. staging only) and strict operational selection of **one pilot tenant** and **one pilot Page** — not per-tenant flag gating in code.

Do **not** document “enable the flag for one tenant” as though the flag is tenant-scoped.

---

## Safety rules (always)

1. **Never** paste Page access tokens, user tokens, app secrets, OAuth `code`/`state`, resume cookie values, JWTs, credential IDs, or raw webhook/Graph payloads into docs, chat, tickets, or screenshots.
2. Channel Settings secret fields and OAuth DTOs are **token-free** — if you see a token in Network/DOM/logs/queue/metadata, **stop** and treat as a security incident.
3. Record **metadata only** in evidence: deploy SHA, tenant id, connection id (UUID), Page id (numeric), HTTP status codes, display states, check codes/statuses, job/message UUIDs, sanitized log labels, timestamps.
4. Use **one pilot tenant** and **one pilot Page** until staging sign-off.
5. Do **not** delete OAuth credentials during immediate rollback unless release owner approves cleanup (see Rollback).

---

## 1. Preconditions

| # | Prerequisite | Pass criteria |
|---|--------------|---------------|
| P1 | **Deployed commit** | Record Vercel + Railway SHAs; merges include #225, #224, #226, **#228** |
| P2 | **Migrations** | `oauth_transactions` + `channel_credentials` present |
| P3–P8 | **Meta + encryption** | App ID, secret, callback URL, Graph version, `NEXT_PUBLIC_APP_BASE_URL`, `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` |
| P9 | **Resolver flag** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` on **pilot/staging deploy** (environment-wide) |
| P10 | **OAuth flag** | `HUBCHAT_FACEBOOK_OAUTH_ENABLED=true` on **pilot/staging deploy** (environment-wide) |
| P11–P12 | **Pilot tenant + Page** | Single tenant UUID; single numeric Page id |
| P13 | **ADMIN account** | HubChat ADMIN for pilot tenant |
| P14 | **Rollback owner** | Named operator |
| P15 | **Worker healthy** | Railway `/ready` healthy |
| P16 | **Meta App Review** | Required permissions for pilot (e.g. `pages_messaging`) |

---

## 2. Safe enablement order

Apply on **staging first**. Production pilot only after staging PASS.

| Step | Action |
|------|--------|
| E1 | Deploy `master` including PR #228 to **staging** (isolated env) |
| E2 | Confirm migrations (P2) |
| E3 | Configure Meta app for staging callback URL |
| E4 | Set `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` |
| E5 | Set `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` on **staging deploy** (required for OAuth health PASS and worker outbound) |
| E6 | Set `HUBCHAT_FACEBOOK_OAUTH_ENABLED=true` on **staging deploy** |
| E7 | Keep `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` at approved value (`DB_WITH_ENV_FALLBACK` unless documented otherwise) |
| E8 | Operate on **one pilot tenant** and **one pilot Page** only |
| E9 | Run OAuth flow smoke (Section 3) |
| E10 | Run outbound smoke (Section 5) — requires `READY` |
| E11 | Production pilot: repeat on isolated production-pilot deploy after staging sign-off |

**Forbidden:** enabling OAuth flags on shared production serving all customers before staging PASS.

---

## 3. OAuth flow smoke (Channel Settings)

Path: `/dashboard/channel-settings` → Facebook card → **Assisted connection (Meta OAuth)**

| Step | Action | Expected |
|------|--------|----------|
| O1 | Reload as ADMIN | `GET /status` → 200; `oauthAvailable: true` when OAuth flag on |
| O2 | **Connect Facebook** | `POST /oauth/start` → 200; Meta redirect |
| O3 | Meta sign-in | Redirect `?channel=facebook&oauth=success` |
| O4 | UI state | **Select a Page** (`AWAITING_PAGE_SELECTION`) — not Connected |
| O5 | Page list | Token-free page options |
| O6 | Select pilot Page; confirm | `POST /complete` with `{ "pageId": "..." }` only |
| O7 | After complete | **Connecting** — not Connected |
| O8 | **Run validation** | `POST /health` → 200; five checks |
| O9 | Inspect checks | All five codes present |
| O10 | All five `PASS` | UI **Connected**; `connectionStatus: READY`, `healthStatus: OK` |
| O11 | Any `FAIL` | Stays **Connecting** |
| O12 | Manual setup | `<details>` manual fallback still available |

**Five checks (all must PASS for `READY`):** `CREDENTIAL_RESOLUTION`, `PAGE_ACCESS`, `REQUIRED_TASKS`, `GRAPH_API`, `RUNTIME_TEST_CONNECTION`.

**Stop if:** Connected before O10.

---

## 4. Reconnect smoke

| Step | Action | Expected |
|------|--------|----------|
| R1 | Status | `NEEDS_RECONNECT` or `reconnectRequired: true` |
| R2 | **Reconnect Facebook** | `POST /reconnect` → 200; token-free `authorizeUrl` |
| R3 | Meta redirect | Fresh OAuth state |
| R4 | During initiation | Prior credential retained |
| R5 | Complete + health | `CONNECTING` until all five PASS |
| R6 | Failed initiation | Sanitized error; credential not destroyed |

---

## 5. Outbound smoke (FB-OAUTH-1E on `master`)

**Prerequisites:** Section 3 O10 PASS; `connectionStatus: READY`; resolver enabled; pilot Page unchanged.

### 5.1 READY gate (record before send)

| Assertion | Expected |
|-----------|----------|
| Connection status | `READY` (from `GET /status` or ops evidence) |
| Health checks | All five previously `PASS` |
| **Must NOT send** while | `AUTHORIZING`, `RECONNECT_REQUIRED`, `REVOKED`, `ERROR`, or other non-outbound-ready status |

Record **exact connection status** in evidence before text and image sends.

### 5.2 OAuth-managed outbound rules

**When an OAuth-managed connection exists** (`providerPageId` + `connectedAt` + credential `SET`):

| Rule | Expected |
|------|----------|
| Credential source | Encrypted `channel_credentials` only |
| Connection status | `READY` |
| Page binding | Conversation `providerPageId` **matches** OAuth connection Page |
| Tenant / connection / Page | Must align — no cross-tenant or cross-Page routing |
| Defective OAuth credential | Outbound **blocked** — no manual/env fallback while resolver enabled |
| Resolver disabled | **Not** a safe way to continue OAuth-managed sends (see Rollback) |

**When no OAuth-managed connection applies:**

- Manual `channel_settings` and approved env fallback per runtime mode — unchanged legacy behavior.

### 5.3 Outbound smoke steps

| Step | Action | Expected |
|------|--------|----------|
| B0 | Record `connectionStatus` + conversation `providerPageId` + connection `providerPageId` | All match pilot Page; status `READY` |
| B1 | Send Messenger **text** | Queued; delivers on **pilot Page** |
| B2 | Send **image** (if enabled) | Same Page; or document limitation |
| B3 | Verify Page in Meta UI | Message on intended Page — not another Page |
| B4 | Queue / outbox | pending → processing → terminal; no storm |
| B5 | Delivery status | Accurate terminal state — **no false DONE** |
| B6 | Page mismatch test (optional) | Mismatched `providerPageId` blocks send (staging only) |
| B7 | Ops snapshot | `/dashboard/ops` — dead-letter stable |

### 5.4 Page-binding evidence

Capture:

- Expected Facebook Page ID (numeric)
- Conversation `providerPageId`
- Connection `providerPageId` from status
- Confirmation message appeared on **that Page only**
- Stop if outbound succeeds using a different manual/env Page

Phase 1: one Facebook connection per tenant (`findByTenantAndProvider`) — Page binding still **must** be verified; worker must not route by tenant alone when Page metadata disagrees.

### 5.5 Worker observability (sanitized)

When reviewing Railway worker logs, these **sanitized** fields may appear (verify at runtime; do not log tokens):

| Evidence | Source (implementation) |
|----------|-------------------------|
| `channelConnectResolver: "enabled"` | Worker outbound resolution |
| `resolutionPath: "channel_connect_db"` | OAuth credential from DB path |
| `runtimeSource: "db"` | Facebook adapter resolver |
| `providerPageId` | Numeric Page id only |
| `routeUsed`, `pageId` | Pre-send route selection log |
| Message text | `"Facebook outbound runtime config resolved"`, `"Channel Connect outbound credentials resolved from channel_connections"`, `"Facebook outbound pre-send route selection"` |

Do **not** record Authorization headers, tokens, or raw Graph bodies.

Reference: [`hubchat-worker-queue-observability-runbook.md`](hubchat-worker-queue-observability-runbook.md)

---

## 6. Manual Facebook regression

Run on a **separate staging tenant without OAuth-managed connection**, or after disabling OAuth flag on an isolated deploy.

| Step | Action | Expected |
|------|--------|----------|
| M1 | Tenant **without** OAuth-managed connection | No `connectedAt` + OAuth credential row pattern |
| M2 | Manual Provider Page ID + token (write-only) | Save/reload; secrets blank; badge SET |
| M3 | **Test connection** | Success when configured |
| M4 | Manual inbound smoke | Webhook → Inbox (webhook runbook) |
| M5 | Manual text/image outbound | Legacy path per runtime mode |
| M6 | Environment fallback | Only per approved `DB_WITH_ENV_FALLBACK` / `ENV_ONLY` policy |

**Distinct from OAuth-managed:**

- Defective OAuth-managed credential → health FAIL / NEEDS_RECONNECT / outbound block — **not** equivalent to “no OAuth connection.”
- With resolver **enabled**, invalid OAuth credential must **not** silently reach manual/env path.

---

## 7. LINE / Instagram regression

| Channel | Check | Expected |
|---------|-------|----------|
| LINE | Settings, test connection, optional inbound/outbound | Unchanged |
| Instagram | Settings, test connection, optional inbound/outbound | Unchanged |
| UI | No Facebook OAuth controls on LINE/Instagram cards | Unchanged |
| Resolver | No Facebook OAuth regression in shared worker paths | LINE/IG sends still work |

---

## 8. Security checks

Verify no sensitive data in:

| Surface | Sensitive items to reject |
|---------|---------------------------|
| DOM / storage | Page token, code, state, cookie value |
| Network responses | Tokens, secrets, credential IDs |
| Callback query after redirect | `code`, `state` persisted in UI |
| Vercel / Railway logs | Tokens, Authorization headers, raw Graph JSON |
| Queue jobs | `access_token`, credential plaintext |
| Outbox / bridge rows | Provider secrets |
| `messages.metadata_json` | Token or credential material |
| Activity / audit metadata | Credential identifiers |
| Delivery snapshots | Token-bearing fields |
| Screenshots | Any of the above |

---

## 9. Expected status transitions (UI)

| Display state | When |
|---------------|------|
| `NOT_CONNECTED` | No OAuth progress |
| `AWAITING_PAGE_SELECTION` | Callback success |
| `CONNECTING` | After complete; or health incomplete |
| `CONNECTED` | All five checks PASS + `healthStatus: OK` |
| `NEEDS_RECONNECT` | Reconnect-required health |
| `ERROR` | OAuth failed/expired |

**Forbidden:** `CONNECTED` without health PASS. **Forbidden:** outbound while not `READY`.

---

## 10. Rollback

### 10.1 What is NOT safe

**`HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=false` is NOT a safe standalone rollback for an active OAuth-managed Facebook tenant.**

When the resolver is disabled, Facebook outbound **skips channel-connect resolution** and may use **legacy manual/env credentials** — potentially a **different Page or token**. Do **not** describe resolver-off as “restore safe legacy fallback.”

### 10.2 Safe rollback sequence (OAuth-managed tenant)

1. **Stop or pause Facebook outbound** for the pilot where operationally possible.
2. **Disable `HUBCHAT_FACEBOOK_OAUTH_ENABLED` first** — stop new OAuth UI/flows.
3. **Do not disable the resolver alone** for an active OAuth-managed tenant still expected to send.
4. Before legacy outbound: **explicitly verify** intended manual Page ID and that the manual token belongs to **that same Page**.
5. **Retain OAuth credentials** in `channel_credentials` — do not bulk-delete on immediate rollback.
6. **Disable resolver only after** legacy path validated **or** outbound stopped.
7. Verify outbound text/image through intended Page after rollback.
8. Verify no queued retries send through wrong credential (ops queue review).
9. Record rollback owner, timestamp, deploy SHA, Page id, verification result.
10. **Reverting PR #228** restores pre-1E behavior including **silent-fallback risk** on OAuth defects — use only with awareness.

### 10.3 Legacy / non-OAuth tenants

For tenants with **no OAuth-managed connection**, resolver-off returns Facebook outbound to manual/env per existing rollout rules — still subject to environment-wide flag scope.

### 10.4 Credential cleanup (deferred)

Only with release-owner approval after manual fallback verified.

---

## 11. Evidence capture

| Field | Record |
|-------|--------|
| Date/time, operator, environment | |
| Deploy SHA | Vercel + Railway |
| Tenant id, connection id | UUIDs only |
| Page id | Numeric |
| `connectionStatus` before outbound | Must be `READY` for OAuth sends |
| Conversation + connection `providerPageId` | Must match |
| PRs verified | #222–#228 |
| Resolver / OAuth flags | On/off on **which deploy** |

### PASS/FAIL table

| Section | Result | Notes |
|---------|--------|-------|
| Preconditions | | |
| Enablement | | |
| OAuth O1–O12 | | |
| Reconnect R1–R7 | | |
| Outbound B0–B7 | | |
| Manual M1–M6 | | |
| LINE/Instagram | | |
| Security | | |
| Rollback drill | | |

### Log search terms (safe)

- `Facebook outbound runtime config resolved`
- `Channel Connect outbound credentials resolved from channel_connections`
- `Facebook outbound pre-send route selection`
- `channelConnectResolver`
- `resolutionPath`
- `channel-connect/facebook/health`

---

## 12. Stop conditions (abort pilot)

| # | Condition |
|---|-----------|
| SC1 | Outbound sends while connection is `AUTHORIZING` or otherwise not outbound-ready |
| SC2 | Outbound before all five health checks PASS |
| SC3 | OAuth health PASS but worker uses manual/env credential |
| SC4 | Resolver disabled and OAuth tenant continues sending without manual Page validation |
| SC5 | Wrong Page selected, bound, or receives message |
| SC6 | Cross-tenant or cross-Page routing |
| SC7 | Page mismatch not blocking send |
| SC8 | Token, code, state, cookie, Authorization header, or credential id in UI/Network/logs/queue/metadata |
| SC9 | Resolver failure marks message DONE |
| SC10 | Outbound false DONE |
| SC11 | Reconnect destroys working credential on failed initiation |
| SC12 | OAuth callback loop |
| SC13 | LINE or Instagram regression |
| SC14 | Raw Meta error exposed to operator |

---

## Rollout gates (summary)

1. Staging deploy with #225–#228 + migrations + Meta staging app
2. Resolver + OAuth flags on **isolated staging deploy** (environment-wide on that deploy)
3. OAuth + reconnect + security smoke PASS
4. Connection `READY` (five checks PASS)
5. Outbound text/image on correct Page PASS
6. Manual + LINE/IG regression PASS
7. Production pilot on isolated deploy — release owner sign-off
8. **Not** broad production enablement

**Production OAuth remains disabled** until all gates pass.

---

## Rollback summary

| Lever | Effect |
|-------|--------|
| Stop outbound | First when possible |
| `HUBCHAT_FACEBOOK_OAUTH_ENABLED=false` | Stop new OAuth activity |
| Resolver-off **alone** | **Unsafe** for OAuth-managed tenants |
| Validated manual Page/token | Explicit operator action — not automatic |
| OAuth credentials | Retain on immediate rollback |
| Revert #228 | Restores silent-fallback risk |
