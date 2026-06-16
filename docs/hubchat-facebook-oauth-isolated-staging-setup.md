# HubChat Facebook OAuth — Isolated Staging Environment Setup

Operator runbook to provision a **non-Production** stack for FB-OAUTH staging smoke.

**Never modify Production** (`https://smartkorp-hub-chat.vercel.app`, Railway `production` worker, Supabase `dskyvomvpkqqznvmnhyx`) during this procedure.

**Do not enable** `HUBCHAT_FACEBOOK_OAUTH_ENABLED` or `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` until Agent A preflight returns **READY FOR CONTROLLED STAGING SMOKE**.

Related:

- [`hubchat-facebook-oauth-staging-pilot-smoke-runbook.md`](hubchat-facebook-oauth-staging-pilot-smoke-runbook.md)
- [`hubchat-facebook-oauth-ui-smoke-worksheet.md`](hubchat-facebook-oauth-ui-smoke-worksheet.md)

---

## Architecture (required invariant)

```
Vercel staging app  ──┐
                      ├──►  Supabase staging project  ◄──  Railway staging worker
Meta staging callback ┘         (isolated DB + Auth)
```

| Layer | Production (do not change) | Staging (create/configure) |
|-------|---------------------------|----------------------------|
| Vercel | `smartkorp-hub-chat` → `smartkorp-hub-chat.vercel.app` | Custom environment **`staging`** with stable URL |
| Railway | Project `SmartKorp Hub Chat`, env **`production`**, service **`worker`** | New env **`staging`**, separate **`worker`** instance |
| Supabase | Project ref `dskyvomvpkqqznvmnhyx` | **New** project (empty; no Production data copy) |
| Meta | Production Meta app / Page | **Development** Meta app + test Page |

**Preview deployments are not sufficient** — Vercel Preview currently shares the same environment variable set as Production (including `SUPABASE_URL`), so Preview is **not** database-isolated.

---

## Cost / permission gates (owner approval)

| Action | May incur cost | Approval |
|--------|----------------|----------|
| Create new Supabase project | Yes (plan-dependent) | **Required** before Step 1 |
| Create Railway `staging` environment | Yes (additional compute) | **Required** before Step 3 |
| Vercel custom environment `staging` | Plan-dependent | **Required** if not on supported plan |
| Meta Developer app (Development mode) | Free | Owner with Meta Business access |

**Do not** delete or downgrade Production resources to fund staging.

---

## Step 1 — Supabase staging project

1. Owner: create a **new** Supabase project (e.g. `hubchat-staging`) in the Supabase dashboard.
2. Record project ref (identifier only): `________________`
3. **Do not** restore Production backups or copy customer rows.
4. From a trusted operator machine with Supabase CLI authenticated:

   ```bash
   supabase login
   supabase link --project-ref <STAGING_PROJECT_REF>
   supabase db push
   ```

5. Read-only verify tables exist:

   - `channel_connections`, `channel_credentials`
   - `oauth_transactions`
   - `conversations` (with `provider_page_id`)
   - `outbound_queue_jobs`, `outbox_events` (or equivalent queue/outbox tables used by worker)

6. Create **synthetic** staging data only:

   - One tenant UUID
   - One ACTIVE ADMIN `sales_agents` row (or approved setup flow)
   - No Production tenant/message/contact import

---

## Step 2 — Vercel custom environment `staging`

1. Vercel dashboard → `smartkorp-hub-chat` → **Settings → Environments** → create custom environment **`staging`**.
2. Assign branch tracking: `master` (or dedicated `staging` branch if preferred).
3. Set a **stable** deployment URL (custom domain or persistent staging alias). Record:

   - Staging origin: `https://________________`

4. Add **staging-only** environment variables (names only in tickets; values via dashboard):

   | Variable | Required | Notes |
   |----------|----------|-------|
   | `SUPABASE_URL` | Yes | Staging project URL only |
   | `SUPABASE_SERVICE_ROLE_KEY` | Yes | Staging service role |
   | `SUPABASE_ANON_KEY` | Yes | Staging anon key |
   | `NEXT_PUBLIC_APP_BASE_URL` | Yes | Must match staging origin exactly |
   | `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` | Yes | **New** staging key — not Production key |
   | `META_APP_ID` | Yes | Staging Meta app |
   | `FACEBOOK_APP_SECRET` or `META_APP_SECRET` | Yes | Staging app secret |
   | `META_GRAPH_VERSION` | Yes | e.g. `v25.0` |
   | `DEFAULT_TENANT_ID` | Yes | Staging tenant UUID |
   | `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | Yes | `DB_WITH_ENV_FALLBACK` unless runbook says otherwise |
   | `HUBCHAT_FACEBOOK_OAUTH_ENABLED` | Yes | **`false` initially** |
   | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | Absent/false initially | Enable only per smoke runbook |
   | `FACEBOOK_VERIFY_TOKEN` | If webhook tests needed | Staging-only value |
   | LINE/Instagram vars | Optional | Only if cross-channel regression on staging |

5. **Verify** Production environment variables were **not** edited.

6. Deploy `master` to staging; record deployment SHA from Vercel dashboard or GitHub deployment API.

**Callback URL (register in Meta before OAuth smoke):**

```
{NEXT_PUBLIC_APP_BASE_URL}/api/channel-connect/facebook/oauth/callback
```

---

## Step 3 — Railway staging worker

1. Railway dashboard → project `SmartKorp Hub Chat` → **New environment** → name **`staging`**.
2. **Do not** duplicate Production variables blindly. Create a **new** `worker` service (or approved equivalent) with:

   | Variable | Required | Notes |
   |----------|----------|-------|
   | `SUPABASE_URL` | Yes | **Same staging ref as Vercel** |
   | `SUPABASE_SERVICE_ROLE_KEY` | Yes | Staging only |
   | `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` | Yes | **Same staging key as Vercel** |
   | `HUBCHAT_*_RUNTIME_CONFIG_MODE` | Yes | Match approved rollout modes |
   | `META_GRAPH_VERSION` | Yes | Match app |
   | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | Absent/false initially | |
   | `HUBCHAT_FACEBOOK_OAUTH_ENABLED` | N/A on worker | OAuth is Vercel-side |
   | Legacy `FACEBOOK_PAGE_*` | Optional | Staging manual path only if needed |

3. Connect repo `ctarasan/HubChat`, branch `master`, start command unchanged from Production worker.
4. Deploy; record Railway deployment SHA (GitHub deployment or Railway UI).
5. Confirm worker `/ready` healthy (Railway logs or published health URL if configured).
6. **Verify** Production worker service and variables unchanged.

---

## Step 4 — Isolation proof (mandatory)

Record evidence (identifiers only):

| Check | Pass criteria |
|-------|---------------|
| Staging Vercel `SUPABASE_URL` ref | Equals staging Supabase ref — **not** `dskyvomvpkqqznvmnhyx` |
| Staging Railway `SUPABASE_URL` ref | Same staging ref as Vercel |
| Production Vercel/Railway `SUPABASE_URL` ref | Still `dskyvomvpkqqznvmnhyx` — unchanged |
| Staging callback host | Staging origin only — not `smartkorp-hub-chat.vercel.app` |
| Queue jobs | Created in staging DB only during staging smoke |

---

## Step 5 — Meta staging app

1. Meta Developers → create or select **Development** app for staging.
2. Add Facebook Login / required products per FB-OAUTH-1A contract.
3. OAuth redirect URI: exact staging callback URL (Step 2).
4. Add test users and grant **test Facebook Page** admin access.
5. Required Page task: `MESSAGING` (and permissions per runbook P16).
6. Confirm test Page is **not** the same Page driven by uncoordinated Production manual/env integration.
7. Record masked App ID and numeric Page ID in smoke ticket — **no secrets**.

---

## Step 6 — Roles and smoke window

Assign before enablement:

| Role | Name |
|------|------|
| Environment owner | |
| Release owner | |
| Rollback owner | |
| Browser smoke operator | |

Approved smoke window: `________________` (UTC)

---

## Step 7 — Preflight and enablement order

1. Agent A reruns FB-OAUTH-1G preflight against **staging** with flags **disabled**.
2. Verdict must be **READY FOR CONTROLLED STAGING SMOKE** (or **READY WITH ACTIONS**).
3. Only then follow [`hubchat-facebook-oauth-staging-pilot-smoke-runbook.md`](hubchat-facebook-oauth-staging-pilot-smoke-runbook.md) Section 2 enablement:

   - E5 `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` on **staging deploy**
   - E6 `HUBCHAT_FACEBOOK_OAUTH_ENABLED=true` on **staging deploy**
   - OAuth flow + worksheet Sections B–J

4. **Never** enable staging flags on Production.

---

## Rollback (staging)

1. Stop Facebook outbound on staging if active.
2. `HUBCHAT_FACEBOOK_OAUTH_ENABLED=false` on staging Vercel.
3. Do not disable resolver alone for OAuth-managed tenant (runbook §10).
4. Retain OAuth credentials unless release owner approves cleanup.
5. Record owner, SHA, Page ID, timestamp.

---

## Cleanup (deferred)

Staging Supabase/Railway/Vercel resources may be deleted only with environment owner approval after smoke sign-off or explicit cancellation.
