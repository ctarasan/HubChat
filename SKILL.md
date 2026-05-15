# SmartKorp HubChat — project skill

Cursor and collaborators: use this file as the source of truth for working rules, Phase II status, workflow, and deployment lessons.

---

## SmartKorp HubChat Working Rules

### Current Phase II status

**DONE:**

- Phase II docs baseline
- Phase II gap analysis / repo-aligned decisions
- Phase II-A1 conversation foundation schema
- Phase II-B1 conversation assignment API foundation
- Phase II-B2 reply ownership guard
- Phase II-B3-1 Dashboard backend support for Team Inbox
- Phase II-B3-2 Dashboard Team Inbox UI
- Phase II-B3-3 Composer ownership UX

**NEXT:**

- Phase II-C1 Conversation Status / Lead Status / SLA Foundation

### Phase II-C1 guardrail (analysis-only until approved)

- Phase II-C1 is **NEXT**, not implicitly in progress: until it is **explicitly approved** for implementation, limit work to **analysis, design, and documentation only**.
- Do **not** add Phase II-C1 migrations, API routes, worker/queue behavior, or UI changes under this guardrail without an approval state (e.g. `APPROVED_TO_COMMIT` or project sign-off).

### Repo-aligned decisions

- `tenant_id` is the current organization boundary.
- `sales_agents` is the operational sales user model.
- Current roles are `SALES`, `MANAGER`, `ADMIN`.
- `conversations.assigned_agent_id` is the Team Inbox ownership source of truth.
- `leads.assigned_sales_id` is the lead-level CRM ownership snapshot.
- `activity_logs` remains lead-level audit.
- `conversation_events` is conversation-level audit.
- Do not introduce `organization_id`, `app_users`, `OWNER`, `SALES_MANAGER`, or `SALES_AGENT` role names unless explicitly approved.
- Do not redesign queue schema until Phase II-F.

### Team Inbox behavior

**Manager/Admin:**

- Can see All / Unassigned / Assigned to me.
- Can assign / reassign / unassign conversations.
- Can reply to conversations in the tenant.

**Sales:**

- Uses My inbox behavior.
- Cannot see All / Unassigned filters.
- Cannot use assignment controls.
- Can reply only to conversations assigned to their `salesAgentId`.
- Cannot reply to unassigned conversations.
- Cannot reply to conversations assigned to another agent.
- Composer should show friendly ownership reasons before send.

### Development workflow

Use this loop:

1. Cursor implements or analyzes.
2. Cursor reports diff summary and validation.
3. ChatGPT reviews.
4. Only after approval:
   - commit
   - push
   - open PR
   - pre-merge verify
   - merge
   - sync master

Use these approval states:

- `PENDING_FULL_DIFF_REVIEW`
- `APPROVED_TO_COMMIT`
- `APPROVED_TO_PUSH_BRANCH`
- `APPROVED_TO_OPEN_PR`
- `APPROVED_TO_MERGE`
- `REQUEST_CHANGES`
- `STOP_AND_REVERT`

### Git safety rules

- Never use `git add .`.
- Always stage explicit paths only.
- Always check staged files before commit:

```bash
git diff --cached --name-only
git diff --cached --stat
git diff --cached --check
```

- Do not stage or commit unrelated untracked files (patches, local env exports, scratch scripts).
- After merge: `git checkout master && git pull origin master` before starting the next branch.

### GitHub CLI workflow

- Install and authenticate once: `gh auth login` (repo scope as needed).
- On Windows, if `gh` is not found in Cursor’s terminal, refresh `PATH` from Machine + User environment variables before running `gh`.
- Inspect PR: `gh pr view <n> --json number,title,state,baseRefName,headRefName,mergeable,mergeStateStatus,statusCheckRollup,files,url`
- Create PR: `gh pr create --base master --head <branch> --title "..." --body-file <path>` (prefer `--body-file` over fragile inline heredocs in PowerShell).
- Merge (when approved): `gh pr merge <n> --squash --subject "..."` — omit `--delete-branch` unless policy says otherwise.
- Do not merge until pre-merge verification passes (diff scope, tests, build, checks green).

### Dashboard 500 incident rule

- If the **Dashboard** shows **“Load conversations failed”** (or similar) and DevTools shows **`GET /api/conversations` → HTTP 500**, treat this as a **production incident**: **do not assume a front-end-only bug first.**
- **Primary hypothesis:** deployed app code queries **`conversations` columns** (e.g. `assignment_status`, `priority`) or related objects that **do not exist yet** on the Supabase project linked to that deployment — often because **Phase II-A1** (or later) migration was **not applied** to that environment.
- **Do not debug only in the browser:** the API may return a **generic “Internal server error”** body; the **real** PostgREST / Postgres message is in **Vercel (or host) runtime logs** and/or Supabase logs.
- **Verify first:** run **Production schema check SQL** (below) on the **correct** Supabase project; compare with repo migration `supabase/migrations/20260512120000_phase_ii_a1_conversation_foundation.sql` when columns match Phase II-A1.
- **Fix path:** after explicit approval, apply the missing **additive** migration to the right project; if REST still fails, run **PostgREST schema reload** (below). Align future **deploy order**: schema/migrations compatible with code **before** or **with** the deploy that selects new columns.

### Production schema check SQL

Run in Supabase **SQL Editor** on the environment you are diagnosing (read-only `SELECT`s):

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'conversations'
  and column_name in (
    'assignment_status',
    'priority',
    'first_response_at',
    'last_customer_message_at',
    'last_agent_message_at',
    'sla_due_at',
    'closed_at'
  )
order by column_name;

select to_regclass('public.conversation_events') as conversation_events_table;
```

- **Interpret:** missing rows for expected columns, or `conversation_events_table` is null → production DB likely **not** on Phase II-A1; apply migration only after approval and normal change controls.

### PostgREST schema reload (after DDL)

- After **DDL** (new columns/tables), **PostgREST** may still serve a stale schema cache. If the migration is applied but errors suggest unknown columns persist, run in **SQL Editor** (requires permission to execute `NOTIFY`):

```sql
notify pgrst, 'reload schema';
```

### Production migration notes (`/api/conversations` and schema drift)

- **Deploy order:** apply additive migrations **before** or **together with** code that depends on new columns — or plan a short coordinated window.
- **Automation:** do **not** apply production migrations from Cursor/agents unless explicitly approved; use backups / org change policy.
- **Vercel logs:** `vercel logs` may stream or filter poorly; prefer **Vercel Dashboard → Logs** when hunting `PGRST` / `column` / `api/conversations` errors.

---

## Production / Staging E2E smoke test protocol

When the user asks Cursor to **test the app**, **test production**, **test staging**, **smoke test**, **check UI**, **verify Dashboard**, or similar, follow this protocol.

### What Cursor cannot do

1. Cursor **cannot** access the user’s active browser session, logged-in Chrome profile, or DevTools directly.
2. Cursor **cannot** assume a logged-in tenant or see Network/Console for a private deployment without automation or pasted evidence.

### What Cursor should do instead

1. **Prefer automated E2E smoke tests** using **Playwright** against a **staging** (or dedicated test) deployment, with **environment variables** for URLs and credentials — never the user’s personal browser session alone.
2. **Check whether E2E support already exists** in the repo:
   - `playwright.config.ts` (includes production-like host guard; see `E2E_ALLOW_PRODUCTION`)
   - `tests/e2e/`
   - `package.json` scripts: `test:e2e`, `test:e2e:ui`, `test:e2e:headed`
   - `.env.example` — Playwright / E2E variable **names** (never commit values)
3. **If E2E support exists** and the user wants verification:
   - When required env vars are **set in the shell** (or CI), run the appropriate command, e.g. `npm run test:e2e` or `npm run test:e2e:headed`.
   - If env vars are **missing**, **do not pretend** a production browser test was run: report which variables are missing and offer to run again once they are set.
4. **If E2E support does not cover** the requested scenario (e.g. follow-up badges, `/api/conversations` non-500, composer send), and the user wants full deployed-app coverage:
   - Propose or implement additional Playwright specs in a **separate feature branch** (not mixed with unrelated product work), following existing patterns under `tests/e2e/`.

### E2E smoke test design expectations

E2E smoke support for HubChat should use:

- **Playwright**
- A **dedicated test tenant** (or staging tenant) with non-production data
- **Test users** with roles **ADMIN**, **MANAGER**, and **SALES** (fixed accounts and/or flows that create a Sales user — see current `tests/e2e/auth-team-members.spec.ts`)
- **Environment variables only** — never hardcoded credentials in repo files
- **Staging by default** for tests that **mutate** data (create user, PATCH follow-up, send messages)
- **Production** only for **read-only** smoke checks, and only when explicitly approved; respect `playwright.config.ts` (`E2E_ALLOW_PRODUCTION` for production-like hosts)

### Required env vars (target contract for comprehensive smoke)

Document **names** in `.env.example` as the repo evolves; do not commit secrets.

**Core URL and roles (extend `.env.example` when specs require them):**

| Variable | Purpose |
|----------|---------|
| `E2E_BASE_URL` | Staging or test deployment origin (e.g. `https://your-staging-app.vercel.app`) |
| `E2E_ADMIN_EMAIL` | Admin login |
| `E2E_ADMIN_PASSWORD` | Admin password |
| `E2E_MANAGER_EMAIL` | Manager login |
| `E2E_MANAGER_PASSWORD` | Manager password |
| `E2E_SALES_EMAIL` | Dedicated Sales login (for flows that need a stable Sales user) |
| `E2E_SALES_PASSWORD` | Sales password |
| `E2E_TENANT_ID` | UUID of dedicated test tenant (when tests must assert tenant-scoped APIs or headers) |

**Currently used by v1 Playwright spec** `tests/e2e/auth-team-members.spec.ts` (in addition to admin/manager above):

| Variable | Purpose |
|----------|---------|
| `E2E_TEST_EMAIL_DOMAIN` | Domain for generated Sales emails (e.g. `example.com`) |
| `E2E_NEW_USER_PASSWORD` | Password assigned when Admin creates a new Sales user in the test |

**Optional (seed / reset / API-side setup — server-side only, never in client bundles):**

| Variable | Purpose |
|----------|---------|
| `E2E_SUPABASE_URL` | Supabase project URL for test data setup scripts |
| `E2E_SUPABASE_SERVICE_ROLE_KEY` | Service role key for **server/CI scripts only** — never browser, never committed |

**Playwright / host guard:**

| Variable | Purpose |
|----------|---------|
| `E2E_ALLOW_PRODUCTION` | Must be `true` to target production-like hosts listed in `playwright.config.ts` |

### Security rules (non-negotiable)

- **Never** commit credentials, tokens, or service role keys.
- **Never** print passwords, tokens, or service role keys in logs, chat, or CI output.
- **Never** expose service role keys to browser or client-side code.
- **Never** use real customer PII or production tenants for destructive tests.
- **Prefer** a dedicated **staging / test tenant** and disposable test users.
- **Production mutation tests** (writes, deletes, follow-up PATCH, message send to real leads) require **explicit user approval** per run.

### Recommended smoke coverage (extend specs over time)

When implementing or extending E2E, aim for:

1. **ADMIN** login succeeds and **Dashboard** loads.
2. **`GET /api/conversations`** does not return **500** (assert response OK or skip with clear reason if unauthenticated in CI).
3. **Conversation list** renders (sidebar list or empty state).
4. **Team Inbox** filters render and can be clicked (role-gated where applicable).
5. **Team Members** page loads for **ADMIN** / **MANAGER**.
6. **SALES** login succeeds and **restricted** pages show **access denied** where expected.
7. **Follow-up / SLA / waiting** badges render when **seeded** conversation rows include those fields (staging data).
8. **Follow-up API** set/clear (`PATCH /api/conversations/[id]/follow-up`) works for **authorized** users against **staging/test tenant** only unless explicitly approved for production read-only checks.
9. **Wrong-assignee SALES** cannot update follow-up (403) — staging.
10. **Message composer** renders for selected conversations; send flows stay covered in dedicated tests when safe.

### When implementing E2E support (separate PR)

- Add tests under `tests/e2e/`.
- Adjust `playwright.config.ts` only if needed (timeouts, projects, guards).
- Ensure `package.json` already has `test:e2e` / `test:e2e:headed` or add them if missing.
- Update **`.env.example` with variable names only** (no real passwords).
- Add seed/reset scripts **only** if they match repo patterns and use service role keys **only** in server/CI context.

### When only reviewing / “smoke test” without implementation

- **Do not** edit application code, tests, or config **unless** the user asked to add missing E2E coverage.
- Report: which commands were run, which env vars were **present vs missing**, pass/fail summary, and whether target was **staging** or **production**.

---

_End of SKILL.md — update this file when Phase II status or working agreements change._
