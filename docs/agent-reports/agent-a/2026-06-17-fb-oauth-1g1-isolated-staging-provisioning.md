# Agent Report — FB-OAUTH-1G.1 Isolated Staging Provisioning

## Metadata

| Field | Value |
|---|---|
| Agent | A |
| Date | 2026-06-17 |
| Phase | FB-OAUTH-1G.1 — Isolated staging environment provisioning and readiness |
| Branch | `docs/fb-oauth-1g1-isolated-staging-provisioning` |
| Local `master` SHA | `cebb2521f59b297c6545ec8844ffc4951951572a` |
| Prior preflight | [#229](https://github.com/ctarasan/HubChat/pull/229) — **BLOCKED** (no isolated env) |
| Setup runbook | [`docs/hubchat-facebook-oauth-isolated-staging-setup.md`](../../hubchat-facebook-oauth-isolated-staging-setup.md) |

---

## Guardrails confirmation

| Guardrail | Status |
|---|---|
| Production resources modified | **Not performed** |
| Production redeployed | **Not performed** |
| Production env vars changed | **Not performed** |
| OAuth flags enabled | **Not performed** |
| Real OAuth / outbound | **Not performed** |
| Production customer data copied | **Not performed** |
| Secrets in repository | **None** |

---

## Final verdict

### **BLOCKED**

**HALT — DO NOT ENABLE FACEBOOK OAUTH**

Isolated staging was **designed and documented** but **not provisioned** in this session. Owner approval and manual infrastructure steps are required before preflight can pass.

**Deliverable:** architecture selection, Production inventory, owner setup runbook, and staging preflight checklist — **not** a live staging stack.

---

## Selected staging architecture

| Component | Decision | Rationale |
|-----------|----------|-----------|
| Vercel | Custom environment **`staging`** with stable HTTPS origin | Preview shares Production env vars (same `SUPABASE_URL` names on Preview + Production) — **not isolated** |
| Railway | New environment **`staging`** + separate `worker` service | Only `production` exists today |
| Supabase | **New empty project** + `supabase db push` | Production ref `dskyvomvpkqqznvmnhyx` must not be used for OAuth smoke |
| Meta | Development-mode app + test Page | Separate callback on staging origin |
| Data | Synthetic tenant/ADMIN only | No Production copy |

**Invariant:** staging app + staging worker + staging database + staging Meta callback = one isolated environment.

---

## Production inventory (excluded — read-only, unchanged)

| Resource | Safe metadata | Deployed SHA (2026-06-17) |
|----------|---------------|---------------------------|
| Vercel project | `ctarasans-projects/smartkorp-hub-chat` | `cebb252` (Production Ready) |
| Vercel URL | `https://smartkorp-hub-chat.vercel.app` | — |
| Vercel targets | Production (`master`), Preview (all branches), Development (CLI) | No custom `staging` target |
| Railway project | `SmartKorp Hub Chat` (`3a558fe2-408b-4729-ba55-2c83828bf492`) | `cebb252` |
| Railway environments | **`production` only** | Worker `worker` Online, Asia Southeast |
| Supabase (prod) | Project ref `dskyvomvpkqqznvmnhyx` (from Railway key names only) | — |

### Production variable names (SET / NOT SET — values not recorded)

**Vercel Production** — SET includes: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY`, `FACEBOOK_APP_SECRET`, `FACEBOOK_PAGE_ACCESS_TOKEN`, `DEFAULT_TENANT_ID`, channel webhook/outbound vars.

**NOT SET on Vercel Production:** `HUBCHAT_FACEBOOK_OAUTH_ENABLED`, `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED`, `META_APP_ID`, `NEXT_PUBLIC_APP_BASE_URL`.

**Railway Production worker** — SET includes: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY`, `HUBCHAT_*_RUNTIME_CONFIG_MODE`, legacy `FACEBOOK_PAGE_*`, `META_GRAPH_VERSION`.

**NOT SET on Railway Production:** `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED`, `HUBCHAT_FACEBOOK_OAUTH_ENABLED`.

**Production unchanged confirmation:** Re-checked after session — Production deploy SHA still `cebb252`; OAuth/resolver flags still absent; Railway environment list still `production` only.

---

## Staging provisioning status

| Step | Status | Evidence / blocker |
|------|--------|-------------------|
| Supabase staging project | **NOT CREATED** | Supabase CLI: `Access token not provided` — owner must `supabase login` and create project (**cost approval**) |
| Migrations on staging DB | **NOT APPLIED** | No staging project |
| Vercel custom env `staging` | **NOT CREATED** | `vercel target ls` shows only Production/Preview/Development |
| Railway env `staging` | **NOT CREATED** | `railway environment list` → production only (**cost approval**) |
| Staging deploy (app + worker) | **NOT DEPLOYED** | — |
| Staging variables | **NOT CONFIGURED** | Runbook §Steps 2–3 |
| Synthetic tenant + ADMIN | **NOT CREATED** | Requires staging DB |
| Meta staging app + callback | **NOT VERIFIED** | Owner UI action |
| Roles assigned | **NOT ASSIGNED** | — |

---

## Cost / permissions requiring owner approval

| # | Action | Owner |
|---|--------|-------|
| 1 | Create Supabase staging project (paid plan may apply) | Infrastructure owner |
| 2 | `supabase login` + link staging + `db push` | Operator with Supabase access |
| 3 | Create Vercel custom environment `staging` | Vercel project owner |
| 4 | `railway environment new staging` (do **not** duplicate prod secrets without review) | Railway project owner |
| 5 | Generate **new** staging `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` (not Production key) | Security / release owner |
| 6 | Meta Development app + staging redirect URI + test Page | Meta Business admin |

**Agent A did not create paid resources** — stopped at approval gate per task §4.

---

## Staging targets (to be filled after provisioning)

| Field | Value |
|-------|-------|
| Vercel staging URL | _pending_ |
| Vercel staging SHA | _pending_ |
| Railway staging env | `staging` (planned) |
| Railway staging SHA | _pending_ |
| Supabase staging ref | _pending_ |
| Staging tenant UUID | _pending_ |
| Staging Facebook Page ID | _pending_ |
| Meta App ID (masked) | _pending_ |

---

## Migration readiness (repository)

Migrations present on `master` for FB-OAUTH staging (apply to **staging DB only** after link):

| Migration | Purpose |
|-----------|---------|
| `20260604120000_ccp_1_channel_connection_foundation.sql` | `channel_connections`, `channel_credentials` |
| `20260614120000_fb_oauth_1b_oauth_transactions.sql` | `oauth_transactions` |
| Plus prior conversation/queue/outbox foundation migrations | Worker + Page binding |

**Applied on staging:** NOT VERIFIED (no staging project).

---

## Staging variable plan (initial — flags disabled)

| Variable | Vercel staging | Railway staging | Initial value |
|----------|----------------|-----------------|---------------|
| `HUBCHAT_FACEBOOK_OAUTH_ENABLED` | SET | N/A | **`false`** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | SET | SET | **absent / `false`** |
| `NEXT_PUBLIC_APP_BASE_URL` | SET | N/A | staging origin |
| `META_APP_ID` | SET | N/A | staging app |
| `FACEBOOK_APP_SECRET` | SET | N/A | staging secret |
| `SUPABASE_URL` / keys | SET | SET | **staging ref only** |

---

## Staging safety record (template)

| Field | Assignment |
|-------|------------|
| Environment owner | _unassigned_ |
| Release owner | _unassigned_ |
| Rollback owner | _unassigned_ |
| Smoke window | _not scheduled_ |
| Flags at provision | OAuth **off**, resolver **off** |
| Cleanup owner | _unassigned_ |

---

## Staging preflight rerun (flags disabled)

Authoritative runbook: [`hubchat-facebook-oauth-staging-pilot-smoke-runbook.md`](../../hubchat-facebook-oauth-staging-pilot-smoke-runbook.md)

| Check | Expected | Observed | Result | Required action |
|-------|----------|----------|--------|-----------------|
| Isolated staging environment | Dedicated app/worker/DB | Not provisioned | **BLOCKED** | Execute setup runbook Steps 1–3 |
| App/worker SHA match | Same `master` SHA on both | N/A | **NOT VERIFIED** | Deploy staging after provision |
| Same staging database | App + worker same Supabase ref | N/A | **NOT VERIFIED** | Configure vars per runbook |
| Migrations applied | CCP-1 + FB-OAUTH-1B tables | N/A | **NOT VERIFIED** | `supabase db push` on staging |
| Meta callback ready | Staging URL in Meta app | N/A | **NOT VERIFIED** | Owner Step 5 |
| ADMIN operator | ACTIVE ADMIN on staging tenant | N/A | **NOT VERIFIED** | Synthetic seed |
| Logs accessible | Vercel + Railway staging | Tooling available; no staging service | **NOT VERIFIED** | Create staging services |
| Rollback owner | Named | Unassigned | **NOT VERIFIED** | Assign roles |
| Test tenant/Page | Designated | N/A | **NOT VERIFIED** | Owner + Meta |
| OAuth flag | `false` / absent | Staging N/A | **PASS** (by absence) | Keep off until preflight PASS |
| Resolver flag | `false` / absent | Staging N/A | **PASS** (by absence) | Keep off until enablement order |
| Secret leakage in evidence | None | None in repo | **PASS** | — |
| Production isolation | Prod unchanged | Confirmed read-only | **PASS** | — |

---

## Stop conditions (still active)

- No isolated staging stack → **HALT**
- Staging app/worker pointing at Production Supabase → **HALT** (Preview must not be used as staging)
- Enabling OAuth flags before preflight PASS → **HALT**

---

## Next enablement sequence (after BLOCKED cleared)

1. Owner completes [`hubchat-facebook-oauth-isolated-staging-setup.md`](../../hubchat-facebook-oauth-isolated-staging-setup.md) Steps 1–6.
2. Agent A reruns FB-OAUTH-1G preflight against live staging URLs/SHAs.
3. Verdict **READY FOR CONTROLLED STAGING SMOKE**.
4. Runbook E5 → resolver `true` on **staging Vercel + Railway**.
5. Runbook E6 → OAuth `true` on **staging Vercel only**.
6. Agent B worksheet Sections B–J (browser smoke).
7. Operator runbook Sections 3–7 (OAuth + outbound).

**Production OAuth remains disabled** until staging smoke PASS + release owner sign-off.

---

## Files delivered (this PR)

| File | Purpose |
|------|---------|
| `docs/hubchat-facebook-oauth-isolated-staging-setup.md` | Owner infrastructure runbook |
| `docs/agent-reports/agent-a/2026-06-17-fb-oauth-1g1-isolated-staging-provisioning.md` | This report |
| `docs/agent-reports/agent-a/latest.md` | Index update |

No runtime code changes.

---

## Agent B handoff

Staging stack is **not live**. Browser worksheet ([#230](https://github.com/ctarasan/HubChat/pull/230)) remains **blocked** until this provisioning completes and preflight passes. Use setup runbook + safety record template when scheduling smoke window.
