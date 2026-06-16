# Agent Report — FB-OAUTH-1G Facebook OAuth Staging / Pilot Preflight (Phase 1)

## Metadata

| Field | Value |
|---|---|
| Agent | A |
| Date | 2026-06-16 |
| Phase | FB-OAUTH-1G — Staging/pilot **preflight only** (no OAuth enablement, no smoke execution) |
| Branch | `docs/fb-oauth-1g-staging-pilot-preflight` |
| Local `master` SHA | `a9e593daeb61ed401e0c910b0c990eae8be62742` |
| Authoritative runbook | [`docs/hubchat-facebook-oauth-staging-pilot-smoke-runbook.md`](../../hubchat-facebook-oauth-staging-pilot-smoke-runbook.md) |
| Merged prerequisites | [#226](https://github.com/ctarasan/HubChat/pull/226) (1C), [#228](https://github.com/ctarasan/HubChat/pull/228) (1E), [#227](https://github.com/ctarasan/HubChat/pull/227) (1F runbook) |

---

## Guardrails confirmation

| Guardrail | Status |
|---|---|
| Facebook OAuth enabled | **Not performed** |
| Production environment variables changed | **Not performed** |
| Real OAuth connection / callback | **Not performed** |
| Facebook outbound message sent | **Not performed** |
| Runtime code modified | **Not performed** |
| Credential migration `--execute` | **Not performed** |
| Secrets in this artifact | **None** (names, statuses, masked IDs only) |

---

## Final verdict

### **BLOCKED**

**HALT — DO NOT ENABLE FACEBOOK OAUTH**

Controlled staging or isolated pilot smoke **cannot begin** until an **isolated deployment/environment** exists and safety-critical operator/Meta/database items below are verified. Shared Production (`https://smartkorp-hub-chat.vercel.app`) must **not** be treated as an isolated pilot merely by selecting one tenant.

---

## Target environment assessment

| Item | Recorded value |
|---|---|
| Intended smoke model | **Neither A nor B verified** — no documented isolated staging or separate pilot deploy |
| Documented shared Production | `https://smartkorp-hub-chat.vercel.app` (Vercel **Production** + Railway **SmartKorp Hub Chat / production**) |
| Vercel project | `ctarasans-projects/smartkorp-hub-chat` |
| Railway service | `worker` (Asia Southeast, **production** environment) |
| Supabase project ref (Railway) | `dskyvomvpkqqznvmnhyx` (identifier only) |
| App ↔ worker DB alignment | **Likely same** — both deploy from same repo SHA to production; explicit read-only schema verification **NOT VERIFIED** (Supabase CLI not linked) |
| Isolated staging/pilot deploy | **Absent / not verified** |

**Stop condition triggered:** `BLOCKED — ISOLATED_ENVIRONMENT_REQUIRED`

---

## Deployed version evidence

| Surface | SHA | Timestamp (UTC) | Includes #228 (1E) | Includes #227 (1F) |
|---|---|---|---|---|
| Local `master` | `a9e593d` | — | Yes (`45eaf83` ancestor) | Yes (merge commit) |
| GitHub → Vercel **Production** | `a9e593d` | `2026-06-16T04:13:18Z` | Yes | Yes |
| GitHub → Railway **production** | `a9e593d` | `2026-06-16T04:12:39Z` | Yes | Yes |
| Vercel `vercel inspect` (canonical alias) | Ready @ ~`2026-06-16T04:12:40Z` | — | Yes | Yes |
| Latest Vercel **Preview** (reference only) | `205e7a6` | `2026-06-16T03:37:48Z` | Yes | Yes (pre-merge head) |

App and worker production deployments are **aligned** on `a9e593d`.

---

## Merged implementation confirmation (`master`)

Repository inspection at `a9e593d` confirms merged FB-OAUTH capabilities (no code changes in this phase):

| Capability | Evidence path |
|---|---|
| OAuth status / start / callback / session / pages / complete | `app/api/channel-connect/facebook/**` |
| Health endpoint (five-check) | `app/api/channel-connect/facebook/health/route.ts` → `facebookOAuthOperationalHealth.ts` |
| Reconnect endpoint | `app/api/channel-connect/facebook/reconnect/route.ts` |
| Five readiness checks | `CREDENTIAL_RESOLUTION`, `PAGE_ACCESS`, `REQUIRED_TASKS`, `GRAPH_API`, `RUNTIME_TEST_CONNECTION` in `facebookOAuthOperationalHealth.ts` |
| Worker outbound OAuth credential | `resolveFacebookWorkerOutboundConfig` → `resolveOutboundChannelCredential` in `resolveWorkerOutboundWithChannelConnect.ts` |
| Page binding | `sendOutboundMessage.ts` passes `conversation.providerPageId`; resolver validates binding |
| No silent fallback (OAuth-managed, resolver on) | `ChannelConnectRuntimeResolverError.blockLegacyFallback` in `channelConnectRuntimeResolver.ts` |
| Staging/pilot smoke runbook | `docs/hubchat-facebook-oauth-staging-pilot-smoke-runbook.md` (merged #227) |

---

## Preflight checklist

| Check | Expected | Observed | Result | Evidence | Required action |
|---|---|---|---|---|---|
| **G1** Working tree clean on `master` | Clean before branch | Clean | **PASS** | `git status --short` empty | — |
| **G2** Merged prerequisites on `master` | #226, #228, #227 | Present in `git log` | **PASS** | `a9e593d` ← #227; ancestors include #228, #226 | — |
| **G3** Isolated staging **or** separate pilot deploy | Dedicated env; not shared multi-customer Production | Only shared Production documented and verified | **BLOCKED** | FB-OAUTH-1A canonical prod URL; runbook §1 forbids shared-prod pilot | Provision isolated Vercel + Railway + Supabase (or confirmed preview-isolated stack); document URLs |
| **G4** App deployed SHA includes #228 | `a9e593d` or later with #228 | Vercel Production `a9e593d` | **PASS** | GitHub deployments API | — |
| **G5** Worker deployed SHA includes #228 | Matches app | Railway production `a9e593d` | **PASS** | GitHub deployments API | — |
| **G6** App/worker same database | Same Supabase project | Same production pairing; schema not read | **NOT VERIFIED** | Railway has `SUPABASE_URL`; Vercel has `SUPABASE_URL` (names only) | Read-only confirm same project ref on both; optional `supabase link` + migration list |
| **G7** `HUBCHAT_FACEBOOK_OAUTH_ENABLED` | `false` or **ABSENT** before smoke | **ABSENT** on Vercel Production | **PASS** | `vercel env ls production` — name not listed | Keep absent until isolated deploy + runbook enablement order |
| **G8** `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | `false` or **ABSENT** before smoke | **ABSENT** on Vercel Production and Railway worker | **PASS** | `vercel env ls production`; Railway variable **names** only | Keep absent until isolated deploy; enable only per runbook on pilot deploy |
| **G9** Flags environment scope | Environment-wide | Production-wide when set | **PASS** | Runbook §Feature flags; prior 1E report | Do not enable “for one tenant” on shared Production |
| **G10** Unexpected flags already on | None | None observed for OAuth/resolver | **PASS** | Vercel/Railway name scans | Re-scan before enablement window |
| **G11** Staging/test Meta App designated | Separate app for pilot/staging | **NOT VERIFIED** | **BLOCKED** | No staging Meta app documented in repo | Create/configure staging Meta app; record masked App ID |
| **G12** `META_APP_ID` server-side (pilot deploy) | SET on app host | **ABSENT** on Vercel Production | **BLOCKED** | `vercel env ls production` — not listed | Add `META_APP_ID` on **isolated** deploy only |
| **G13** Meta App Secret server-side | SET (encrypted) | `FACEBOOK_APP_SECRET` / `META_APP_SECRET` name present on Vercel | **PASS** (name only) | Vercel env name list | Confirm staging app secret on pilot deploy — do not reuse prod app without review |
| **G14** OAuth redirect URI in Meta matches code | `{APP_BASE}/api/channel-connect/facebook/oauth/callback` | Code path verified; Meta console **NOT VERIFIED** | **NOT VERIFIED** | `facebookOAuthConfig.ts` `buildFacebookOAuthCallbackUrl` | Register exact HTTPS callback on staging Meta app |
| **G15** Application origin / HTTPS | HTTPS canonical origin | `https://smartkorp-hub-chat.vercel.app` (Production) | **PASS** (prod origin only) | FB-OAUTH-1A contract | Use **isolated** origin for pilot, not shared prod |
| **G16** Callback path | `/api/channel-connect/facebook/oauth/callback` | Matches implementation | **PASS** | `app/api/channel-connect/facebook/oauth/callback/route.ts` | — |
| **G17** Post-callback redirect | `/dashboard/channel-settings?channel=facebook&oauth=…` | Documented + implemented | **PASS** | `facebookOAuthService.ts` | — |
| **G18** `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` | SET on app + worker | **SET** (names on Vercel + Railway) | **PASS** | Env name lists | — |
| **G19** `NEXT_PUBLIC_APP_BASE_URL` | SET or explicit Vercel fallback | **ABSENT** on Vercel Production | **NOT VERIFIED** | Not in Vercel prod env list; code falls back to `VERCEL_URL` | Set explicit base URL on pilot deploy to avoid callback mismatch |
| **G20** DB migrations present in repo | CCP-1 + FB-OAUTH-1B | `20260604120000_ccp_1_channel_connection_foundation.sql`, `20260614120000_fb_oauth_1b_oauth_transactions.sql` | **PASS** (repo) | `supabase/migrations/` | — |
| **G21** Migrations applied on target DB | `channel_connections`, `channel_credentials`, `oauth_transactions` | **NOT VERIFIED** | **NOT VERIFIED** | `supabase migration list` → project not linked | `supabase link` + read-only migration list on **pilot** database |
| **G22** Pilot tenant designated | Single tenant UUID | **NOT VERIFIED** | **NOT VERIFIED** | — | Operator record tenant UUID (sanitized) |
| **G23** Pilot Facebook Page designated | Single numeric Page ID | **NOT VERIFIED** | **NOT VERIFIED** | — | Operator record Page name + ID |
| **G24** Page attribution safety | No uncoordinated prod/manual integration on same Page | **NOT VERIFIED** — legacy `FACEBOOK_PAGE_ACCESS_TOKEN` **SET** on Vercel + Railway | **BLOCKED** | Railway/Vercel env **names**; PROD-CUTOVER-1A notes | Confirm pilot Page is not concurrently driven by Production manual/env path |
| **G25** Existing OAuth-managed connection data | Documented if present | **NOT VERIFIED** | **NOT VERIFIED** | No DB read in this phase | Read-only status query on pilot tenant |
| **G26** ADMIN operator for pilot tenant | ACTIVE ADMIN | **NOT VERIFIED** | **NOT VERIFIED** | — | Nominate operator; verify Channel Settings access |
| **G27** Meta test account + Page admin | Sufficient tasks | **NOT VERIFIED** | **NOT VERIFIED** | — | Verify `pages_messaging` / `MESSAGING` task on pilot Page |
| **G28** Vercel log access | Operator can search OAuth routes | Agent A has Vercel CLI (`ctarasan`) | **PASS** (tooling) | `vercel whoami` | Confirm smoke operator has dashboard access |
| **G29** Railway worker log access | Operator can search resolver logs | Agent A has Railway CLI (production worker linked) | **PASS** (tooling) | `railway status` | Confirm smoke operator has log access |
| **G30** Observability fields (code) | Sanitized fields exist | `channelConnectResolver`, `resolutionPath`, `runtimeSource`, `providerPageId`, `routeUsed`, `pageId` | **PASS** (code) | `resolveWorkerOutboundWithChannelConnect.ts`, `createFacebookOutboundAdapterResolver.ts`, `sendOutboundMessage.ts` | Verify in pilot worker logs during smoke |
| **G31** Rollback procedure understood | Runbook §10 sequence | Documented in runbook; owners **not assigned** | **NOT VERIFIED** | FB-OAUTH-1F runbook | Assign smoke operator, release owner, rollback owner |
| **G32** Production OAuth rollout | Not authorized | Runbook states not complete | **PASS** | Runbook header + gates | Complete staging smoke before any prod pilot |

---

## Feature-flag state (target: shared Production — reference only)

| Variable | Vercel Production | Railway worker (production) | Safe pre-smoke baseline |
|---|---|---|---|
| `HUBCHAT_FACEBOOK_OAUTH_ENABLED` | **NOT SET** (absent) | **NOT SET** (absent) | false or absent ✓ |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **NOT SET** (absent) | **NOT SET** (absent) | false or absent ✓ |

**Scope:** Both flags are **environment-wide** when enabled. Enabling on shared Production would affect all tenants.

---

## Callback URL (implementation-derived)

| Item | Value |
|---|---|
| Application origin (Production reference) | `https://smartkorp-hub-chat.vercel.app` |
| Callback path | `/api/channel-connect/facebook/oauth/callback` |
| Expected complete callback URL (Production) | `https://smartkorp-hub-chat.vercel.app/api/channel-connect/facebook/oauth/callback` |
| Post-auth UI redirect | `/dashboard/channel-settings?channel=facebook&oauth=success` or `oauth=error&errorCategory=…` |
| HTTPS | Yes (canonical alias) |
| Meta App redirect URI registered | **NOT VERIFIED** |

**Note:** Pilot smoke must use the **isolated deploy origin**, not shared Production, once provisioned.

---

## Worker outbound path (reference — matches #228)

```
Queue (token-free OutboundMessageRequestedPayload)
  → OutboundWorker
  → SendOutboundMessageUseCase.execute()
  → conversation lookup (providerPageId)
  → Facebook outbound adapter resolver
  → resolveFacebookWorkerOutboundConfig()
  → resolveOutboundChannelCredential()
  → encrypted channel_credentials
  → FacebookAdapter → Graph send
  → existing delivery / retry / idempotency / dead-letter handling
```

---

## Rollback readiness (procedure only — not executed)

| Role | Assignment |
|---|---|
| Smoke operator | **NOT ASSIGNED** |
| Release owner | **NOT ASSIGNED** |
| Rollback owner | **NOT ASSIGNED** |

Operators must understand before enablement (per FB-OAUTH-1F runbook):

1. Disable `HUBCHAT_FACEBOOK_OAUTH_ENABLED` first.
2. Resolver-off alone is **unsafe** for OAuth-managed tenants.
3. Stop or pause Facebook outbound before changing resolver behavior.
4. Validate manual Page ID and token belong to the same intended Page before legacy fallback.
5. Retain OAuth credentials during immediate rollback.
6. Inspect queued retries for wrong-Page risk.
7. Reverting #228 restores silent-fallback risk.

---

## Stop conditions triggered

| # | Condition | Triggered |
|---|---|---|
| SC-ENV | No isolated staging/pilot environment | **Yes** |
| SC-PAGE | Page may be used by uncontrolled Production manual/env integration | **Yes** (risk — verify before pilot) |
| SC-META | Meta OAuth app not ready for staging (`META_APP_ID` absent on app host) | **Yes** |
| SC-DB | Migration applied state uncertain | **Yes** (not verified) |
| SC-OPS | No assigned rollback owner / pilot operator | **Yes** |
| SC-FLAG | Flags unexpectedly enabled | **No** |
| SC-LEAK | Secret in this artifact | **No** |

---

## Blockers (must resolve before smoke)

1. **ISOLATED_ENVIRONMENT_REQUIRED** — provision and document isolated staging or pilot Vercel + Railway + database; do not use shared Production.
2. **META_APP_ID / staging Meta App** — configure staging/test Meta app; set server env on isolated deploy only.
3. **Pilot tenant + Page** — designate and record sanitized IDs; confirm Page attribution safety vs legacy manual/env credentials.
4. **Database migration verification** — read-only confirm `oauth_transactions` and channel-connect tables on pilot database.
5. **Operator assignments** — smoke operator, release owner, rollback owner with ADMIN + log access.
6. **`NEXT_PUBLIC_APP_BASE_URL`** — set explicitly on pilot deploy to lock callback URL.

---

## Non-blocking notes

- Production app/worker already run `a9e593d` with #228 + #227 — code/runbook alignment is good **once an isolated env exists**.
- Vercel Preview deployments exist but are not documented as operational staging and latest preview SHA may lag `master`.
- `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` is present on both surfaces — prerequisite for OAuth credential storage.
- Observability log field names match merged code; live log confirmation deferred to smoke phase.

---

## Next steps (after blockers cleared)

1. Stand up isolated staging stack (or approved pilot deploy).
2. Deploy `master` (`a9e593d` or later) to that stack.
3. Apply/verify migrations read-only on pilot database.
4. Configure staging Meta app + callback URL for **pilot origin only**.
5. Assign operators and re-run FB-OAUTH-1G preflight (Phase 2) with target-env evidence.
6. Only then follow FB-OAUTH-1F runbook enablement order (E1–E11).

---

## Agent B handoff

No UI changes. Agent B may use this report to track staging/pilot readiness gates before scheduling smoke execution.
