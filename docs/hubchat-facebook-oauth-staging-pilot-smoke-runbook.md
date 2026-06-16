# HubChat Facebook OAuth — Staging / Pilot Smoke and Rollback Runbook (FB-OAUTH-1F)

Operator-facing guide for **controlled staging and single-tenant pilot** validation of Facebook OAuth assisted connection (Meta OAuth → Page selection → operational health → CONNECTED), plus reconnect and rollback discipline.

**Phase:** FB-OAUTH-1F (documentation only — no runtime changes in this deliverable)

**Production rollout is not complete.** Do not enable OAuth broadly in production until this runbook passes on staging/pilot and release owners sign off.

**Authoritative contracts:**

- [`docs/agent-reports/agent-a/2026-06-13-fb-oauth-1a-discovery-contract.md`](agent-reports/agent-a/2026-06-13-fb-oauth-1a-discovery-contract.md)
- [`docs/agent-reports/agent-a/2026-06-15-fb-oauth-1c-runtime-health-reconnect.md`](agent-reports/agent-a/2026-06-15-fb-oauth-1c-runtime-health-reconnect.md)
- [`docs/agent-reports/agent-b/2026-06-15-fb-oauth-1d-ui-discovery-spec.md`](agent-reports/agent-b/2026-06-15-fb-oauth-1d-ui-discovery-spec.md)

**Related manual runbooks:**

- Channel Settings confidence: [`docs/hubchat-channel-settings-runtime-confidence-runbook.md`](hubchat-channel-settings-runtime-confidence-runbook.md)
- Manual Facebook Page onboarding: [`docs/prod-cutover-1b-operator-runbook.md`](prod-cutover-1b-operator-runbook.md)
- Webhook smoke: [`docs/hubchat-webhook-smoke-runbook.md`](hubchat-webhook-smoke-runbook.md)
- Worker queue observability: [`docs/hubchat-worker-queue-observability-runbook.md`](hubchat-worker-queue-observability-runbook.md)

---

## Capability matrix (read first)

Use this table to know **what you can test today** vs what depends on follow-up work.

| Check area | Available on current `master` (PRs #222–#226) | Requires **FB-OAUTH-1E** (worker outbound) | Requires **Meta configuration / App Review** | Requires **production feature enablement** |
|------------|-----------------------------------------------|---------------------------------------------|---------------------------------------------|---------------------------------------------|
| OAuth UI on Channel Settings | Yes — when `HUBCHAT_FACEBOOK_OAUTH_ENABLED=true` | — | App must exist; redirect URI registered | Flag on target deploy |
| Connect / callback / Page picker / complete | Yes | — | Valid App ID/secret; callback URL; Page admin | OAuth flag + Meta config |
| `POST /health` five-check validation | Yes — active (not 501) | — | Graph reachable; Page token valid | Resolver flag for `RUNTIME_TEST_CONNECTION` PASS |
| UI `CONNECTED` only after all five PASS | Yes | — | — | Resolver flag + successful health |
| Reconnect (`NEEDS_RECONNECT` → Meta) | Yes | — | Same Meta app/callback | OAuth flag |
| Manual Facebook Channel Settings | Yes (unchanged) | — | Manual token if used | Existing runtime mode policy |
| Manual Test Connection | Yes | — | — | — |
| OAuth-managed Test Connection path | Yes (uses `channel_credentials`) | — | — | Resolver flag for OAuth runtime proof |
| **Worker outbound using OAuth credential** | **No** — still legacy path until 1E | **Yes** | Page messaging permissions | `READY` + 1E + outbound smoke |
| Inbound Graph off global env token | No (deferred) | Separate follow-up | — | — |
| Broad production OAuth enablement | No | Recommended before prod outbound | App Review constraints understood | Explicit GO from release owner |

---

## Safety rules (always)

1. **Never** paste Page access tokens, user tokens, app secrets, OAuth `code`/`state`, resume cookie values, JWTs, credential IDs, or raw webhook/Graph payloads into docs, chat, tickets, or screenshots.
2. Channel Settings secret fields and OAuth DTOs are **token-free** — if you see a token in Network/DOM/logs, **stop** and treat as a security incident.
3. Record **metadata only** in evidence: deploy SHA, tenant id, Page id (numeric), HTTP status codes, display states, check codes/statuses, job/message UUIDs, timestamps.
4. Use **one pilot tenant** and **one pilot Page** until staging sign-off.
5. Do **not** delete OAuth credentials during immediate rollback unless release owner approves cleanup (see Rollback).

---

## 1. Preconditions

Complete before starting OAuth pilot smoke.

| # | Prerequisite | Pass criteria | Notes |
|---|--------------|---------------|-------|
| P1 | **Deployed commit / PR** | Record Vercel + Railway SHAs; confirm merges include FB-OAUTH-1B (#225), UI (#224), runtime health/reconnect (#226) | Compare to release tag or `master` HEAD |
| P2 | **Migrations** | `oauth_transactions` and channel credential tables present (FB-OAUTH-1B migration applied) | No new migration in #226 |
| P3 | **Meta App ID** | `META_APP_ID` set on deploy | Env name only in notes |
| P4 | **Meta App Secret** | `FACEBOOK_APP_SECRET` set on deploy | Never log value |
| P5 | **Callback URL** | Registered in Meta app: `{APP_BASE}/api/channel-connect/facebook/oauth/callback` | Staging uses staging base URL |
| P6 | **Graph API version** | `META_GRAPH_VERSION` or `FACEBOOK_GRAPH_VERSION` (e.g. `v25.0`) | Record version string only |
| P7 | **App base URL** | `NEXT_PUBLIC_APP_BASE_URL` matches deployed UI origin | Required for OAuth redirect |
| P8 | **Credential encryption** | `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` configured | Required for OAuth token storage |
| P9 | **Resolver flag (pilot)** | Plan to set `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` for pilot only | **Required** before `RUNTIME_TEST_CONNECTION` can PASS |
| P10 | **OAuth feature flag (pilot)** | Plan to set `HUBCHAT_FACEBOOK_OAUTH_ENABLED=true` for pilot only | Hides UI when false |
| P11 | **Pilot tenant** | Single tenant id chosen; isolated from production customers | ADMIN access confirmed |
| P12 | **Pilot Page** | One Facebook Page id; operator has admin/task access | Record Page id only |
| P13 | **ADMIN account** | HubChat user with ADMIN role for pilot tenant | MANAGER/SALES must not run OAuth connect |
| P14 | **Rollback owner** | Named operator for flag rollback and incident stop | On-call or release owner |
| P15 | **Worker healthy** | Railway `/ready` healthy | [`hubchat-worker-queue-observability-runbook.md`](hubchat-worker-queue-observability-runbook.md) |
| P16 | **Meta App Review** | Permissions needed for pilot (e.g. `pages_messaging`, Page management) approved or available in dev mode | **Required for real Meta sign-in outside test users** |

---

## 2. Safe enablement order

Apply in **staging first**. Do not enable globally in production until Section 11 evidence is signed off.

| Step | Action | Why |
|------|--------|-----|
| E1 | Deploy approved `master` (or release branch) to **staging** | Isolate blast radius |
| E2 | Confirm migrations applied (P2) | OAuth transactions + credentials |
| E3 | Configure Meta app for **staging** callback URL (P5) | Callback mismatch causes loop/failure |
| E4 | Set `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` if not already | Token encrypt/decrypt |
| E5 | Set `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` **on staging pilot deploy only** | `RUNTIME_TEST_CONNECTION` blocks without it |
| E6 | Set `HUBCHAT_FACEBOOK_OAUTH_ENABLED=true` **on staging pilot deploy only** | Surfaces OAuth UI |
| E7 | Keep `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` at approved value (`DB_WITH_ENV_FALLBACK` unless documented otherwise) | Manual/env fallback policy unchanged |
| E8 | Select **one pilot tenant** — do not enable flags on all production tenants | Controlled pilot |
| E9 | Run OAuth flow smoke (Section 3) | Gate before outbound |
| E10 | Merge/deploy **FB-OAUTH-1E** when available; then run outbound smoke (Section 5) | Worker outbound OAuth |
| E11 | Production: repeat E3–E10 on **one production pilot tenant** only after staging PASS | No broad enablement |

**Forbidden:** enabling `HUBCHAT_FACEBOOK_OAUTH_ENABLED` on all production tenants before staging PASS and sign-off.

---

## 3. OAuth flow smoke (Channel Settings)

Path: `/dashboard/channel-settings` → Facebook card → **Assisted connection (Meta OAuth)**

| Step | Action | Expected | Available |
|------|--------|----------|-----------|
| O1 | Reload Channel Settings as ADMIN | `GET /api/channel-connect/facebook/status` → 200; `oauthAvailable: true` when flag on | **Now** |
| O2 | Click **Connect Facebook** | `POST /oauth/start` → 200; browser navigates to Meta | **Now** + Meta config |
| O3 | Complete Meta sign-in (pilot admin) | Redirect to `/dashboard/channel-settings?channel=facebook&oauth=success` | **Now** + Meta config |
| O4 | Confirm UI state | Badge **Select a Page** (`AWAITING_PAGE_SELECTION`); **not** Connected | **Now** |
| O5 | Page list loads | `GET /oauth/session` + `GET /pages` → token-free page options | **Now** |
| O6 | Select pilot Page; confirm | `POST /complete` with `{ "pageId": "..." }` only | **Now** |
| O7 | After complete | UI **Connecting** (`CONNECTING`); **not** Connected | **Now** |
| O8 | Click **Run validation** | `POST /health` → 200 with `checks[]` (five codes) | **Now** |
| O9 | Inspect checks | `CREDENTIAL_RESOLUTION`, `PAGE_ACCESS`, `REQUIRED_TASKS`, `GRAPH_API`, `RUNTIME_TEST_CONNECTION` each `PASS`/`FAIL` | **Now** |
| O10 | All five `PASS` | UI **Connected**; `displayState: CONNECTED`, `healthStatus: OK`, `connectionStatus: READY` | **Now** + resolver flag |
| O11 | Any check `FAIL` | UI stays **Connecting**; no Connected badge | **Now** |
| O12 | Manual setup fallback | `<details>` manual Facebook setup still visible and functional | **Now** |

**Stop if:** UI shows Connected before all five checks PASS (O10 failure).

---

## 4. Reconnect smoke

Run after simulating or reaching `NEEDS_RECONNECT` (revoked token, reconnect-required health, or test tenant in that state).

| Step | Action | Expected | Available |
|------|--------|----------|-----------|
| R1 | Confirm status | `GET /status` → `displayState: NEEDS_RECONNECT` or `reconnectRequired: true` | **Now** |
| R2 | Click **Reconnect Facebook** | `POST /reconnect` → 200 (not 501); `{ authorizeUrl, expiresAt }` token-free | **Now** |
| R3 | Meta redirect | Fresh OAuth flow; **new** state (no reuse of prior transaction) | **Now** |
| R4 | During reconnect initiation | Prior Page credential **still present** until new complete succeeds | **Now** |
| R5 | Complete new OAuth + Page selection | Returns to `CONNECTING`; not Connected until health | **Now** |
| R6 | Run validation again | All five PASS required for Connected | **Now** |
| R7 | Failed reconnect initiation | Sanitized error; existing connection/credential not destroyed | **Now** |

**Stop if:** reconnect deletes working credential or claims Connected without health PASS.

---

## 5. Outbound smoke (after FB-OAUTH-1E)

> **Not available on current `master` alone.** Worker outbound still uses the legacy Facebook runtime resolver until **FB-OAUTH-1E** merges. Skip this section until 1E is deployed to the target environment.

Prerequisites: OAuth flow smoke PASS (Section 3 O10); connection `READY`; 1E deployed; pilot Page unchanged.

| Step | Action | Expected |
|------|--------|----------|
| B1 | Send Messenger **text** from Inbox composer | Outbound queued; delivers to correct PSID |
| B2 | Send **image** attachment (if enabled) | Delivered or documented expected limitation |
| B3 | Verify **Page** | Message sent from pilot Page id — not another Page |
| B4 | Queue / outbox | Job progresses pending → processing → terminal; no stuck storm |
| B5 | Delivery status | Terminal state matches provider outcome — **no false DONE** |
| B6 | Cross-Page routing | No message routes to wrong tenant/Page |
| B7 | Ops snapshot | `/dashboard/ops` — dead-letter not spiking |

Reference: [`hubchat-worker-queue-observability-runbook.md`](hubchat-worker-queue-observability-runbook.md)

---

## 6. Manual Facebook regression

Run on the **same pilot tenant** after OAuth smoke (or on a separate staging tenant without OAuth enabled).

| Step | Action | Expected |
|------|--------|----------|
| M1 | Disable OAuth flag **or** use tenant without OAuth connect | Assisted UI unavailable or not used |
| M2 | Manual Provider Page ID + Page access token (write-only) | Save/reload; secrets blank; badge SET |
| M3 | **Test connection** | `POST /api/channel-settings/facebook/test-connection` → success when configured |
| M4 | Manual inbound smoke | Webhook → Inbox row (see webhook runbook) |
| M5 | Manual outbound smoke | Composer send — **legacy path** per runtime mode |
| M6 | Environment fallback | With `DB_WITH_ENV_FALLBACK`, behavior matches rollout policy when DB unset |

OAuth-managed connection must **not** silently fall back to manual token when OAuth credential is invalid (health should FAIL / NEEDS_RECONNECT).

---

## 7. LINE / Instagram regression

Quick non-regression pass on staging/pilot deploy (no OAuth UI spillover).

| Channel | Check | Expected |
|---------|-------|----------|
| LINE | Channel Settings card loads; test connection; optional inbound/outbound | Unchanged |
| Instagram | Channel Settings card loads; test connection; optional inbound/outbound | Unchanged |
| UI | No Facebook OAuth controls on LINE/Instagram cards | **Now** |
| API | No `/api/channel-connect/facebook/*` calls from non-Facebook flows | — |

---

## 8. Security checks

Run during OAuth flow smoke (browser DevTools + platform logs).

| # | Check | Pass criteria |
|---|-------|---------------|
| S1 | DOM / localStorage / sessionStorage | No `EAA…`, `access_token`, `code`, `state`, cookie value, credential id |
| S2 | Network — status/session/pages/complete/health/reconnect | JSON bodies token-free; only `authorizeUrl` on start/reconnect |
| S3 | Network — Channel Settings APIs | No secrets in responses |
| S4 | Vercel logs | No token, secret, raw Graph body, Authorization header values |
| S5 | Railway worker logs | No token-bearing outbound debug |
| S6 | Provider errors | Operator sees sanitized copy only — no raw Meta JSON |
| S7 | Queue / message metadata | No token in job payload or message metadata fields |

**Stop condition:** any token or secret in DOM, API response, or log line.

---

## 9. Expected status transitions (UI display states)

| Display state | When (pilot) |
|---------------|--------------|
| `NOT_CONNECTED` | No OAuth progress; no manual configured |
| `AWAITING_PAGE_SELECTION` | Callback success; before Page confirm |
| `CONNECTING` | After complete; or health not all PASS; or resolver off |
| `CONNECTED` | **Only** when all five health checks PASS and `healthStatus: OK` |
| `NEEDS_RECONNECT` | Revoked/invalid token or reconnect-required health |
| `ERROR` | OAuth failed/expired session (sanitized banner) |
| `MANUAL_CONFIGURED` | Manual setup without OAuth connect |

**Forbidden:** `CONNECTED` immediately after callback or complete without health PASS.

---

## 10. Rollback

### 10.1 Immediate rollback (incident or failed smoke)

| Step | Action | Purpose |
|------|--------|---------|
| RB1 | Set `HUBCHAT_FACEBOOK_OAUTH_ENABLED=false` | Hide OAuth UI; stop new connects |
| RB2 | Set `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=false` if pilot enabled it | Restore legacy runtime path for non-OAuth tenants |
| RB3 | Redeploy or apply env change per platform | Flags take effect |
| RB4 | Verify `GET /status` with flag off | `oauthAvailable: false`; manual setup still available |
| RB5 | Verify manual Test Connection still works | Manual regression M3 |
| RB6 | Verify health/reconnect | New connects blocked; existing OAuth tenants may show unavailable guidance |
| RB7 | **Do not** bulk-delete `channel_credentials` | Preserve audit/recovery |
| RB8 | Outbound | Confirm worker uses approved **legacy** path after RB2 (until 1E, already legacy) |

### 10.2 After FB-OAUTH-1E rollback

If 1E was deployed and outbound used OAuth credentials:

| Step | Action |
|------|--------|
| RB9 | Disable resolver flag (RB2) |
| RB10 | Confirm outbound uses manual/env per runtime mode |
| RB11 | Run manual outbound smoke (M5) |

### 10.3 Credential cleanup (deferred — not immediate rollback)

Safe only when release owner approves:

- Tenant intentionally abandons OAuth pilot
- Replacement manual token verified
- Document tenant id + Page id + date

**Not safe during:** active pilot, incident investigation, or before manual fallback verified.

---

## 11. Evidence capture

Use one evidence pack per staging/pilot cycle.

| Field | Record |
|-------|--------|
| Date/time (UTC+7) | Start/end of smoke |
| Operator | Name/role |
| Environment | staging / production-pilot |
| Deploy SHA | Vercel + Railway |
| Tenant id | UUID only |
| Page id | Numeric Page id only |
| PRs verified | #222–#226 (+ #224 UI); #226 health/reconnect |
| FB-OAUTH-1E SHA | If outbound section run |
| Meta app id | Numeric id only — not secret |

### PASS/FAIL table (template)

| Section | Result | Notes |
|---------|--------|-------|
| Preconditions P1–P16 | | |
| Enablement E1–E8 | | |
| OAuth O1–O12 | | |
| Reconnect R1–R7 | | |
| Outbound B1–B7 | N/A until 1E | |
| Manual M1–M6 | | |
| LINE/Instagram | | |
| Security S1–S7 | | |
| Rollback drill RB1–RB8 | | |

### Screenshot list (no secrets)

1. Channel Settings — Facebook card before connect  
2. Page selector  
3. Connecting + health checks list (codes/statuses only)  
4. Connected badge (after all PASS)  
5. Reconnect banner (if tested)  
6. Ops queue snapshot (if outbound run)

### Log search terms (safe)

- `Facebook outbound runtime config resolved`
- `channel-connect/facebook/health`
- `oauth_transactions`
- HTTP status codes: `200`, `400`, `403`, `501` (501 should **not** appear on health/reconnect after #226)

### Operator sign-off

| Role | Name | Date | GO / NO-GO |
|------|------|------|------------|
| Operator | | | |
| Release owner | | | |

---

## 12. Stop conditions (abort pilot)

Stop immediately and execute Rollback (Section 10) if any occur:

| # | Condition |
|---|-----------|
| SC1 | Wrong Page selected or bound vs pilot Page id |
| SC2 | Cross-tenant or cross-Page message routing |
| SC3 | Token, code, state, cookie, or credential id in DOM/API/logs |
| SC4 | OAuth callback redirect loop |
| SC5 | Health reports PASS/Connected with resolver off or checks incomplete |
| SC6 | Outbound **false DONE** (after 1E) |
| SC7 | Reconnect destroys working credential on failed initiation |
| SC8 | LINE or Instagram regression (settings, inbound, or outbound) |
| SC9 | Raw Meta error or Graph body exposed to operator UI |

---

## Rollout gates (summary)

1. Staging deploy with migrations + Meta staging app config  
2. Resolver flag on **pilot staging only**  
3. OAuth flag on **pilot staging only**  
4. Section 3 + 4 PASS on staging  
5. Security S1–S7 PASS  
6. Manual + LINE/IG regression PASS  
7. FB-OAUTH-1E merged → Section 5 outbound PASS on staging  
8. Production pilot: repeat on **one tenant**  
9. Release owner sign-off — **not** broad production enablement  

---

## Rollback summary

| Lever | Effect |
|-------|--------|
| `HUBCHAT_FACEBOOK_OAUTH_ENABLED=false` | Disable OAuth UI and new flows |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=false` | Block OAuth runtime proof; legacy paths for manual/env |
| Manual Channel Settings | Preserved — primary fallback |
| OAuth credentials | **Retain** on immediate rollback; cleanup only with approval |
| Code revert | Last resort — revert #226/#225/#224 per incident scope |
