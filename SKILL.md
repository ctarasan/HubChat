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

### AI agent collaboration (Agent A / Agent B / ChatGPT)

Multi-agent work on HubChat follows **[docs/ai-agent-collaboration-rules.md](docs/ai-agent-collaboration-rules.md)**:

- **Agent A** — backend, DB, API, domain, workers, channel adapters.
- **Agent B** — frontend, UX, UI tests, Playwright E2E.
- **ChatGPT** — planner, reviewer, merge traffic controller; outcomes: PASS, PASS WITH NOTES, NEEDS CHANGES, BLOCKED; `origin/master` is source of truth.
- **Parallel work** only after ChatGPT freezes an Interface Technical Spec (incl. Work Order ID); merge **backend first**, then UI.
- Agents must not merge without ChatGPT review; use the required report format and verification commands defined in that doc.

### Universal AI Agent Project Workflow

Reusable operating model for this and future projects.

Full detail:

- [docs/ai-agent-project-workflow.md](docs/ai-agent-project-workflow.md)

| Role | Responsibility |
|------|----------------|
| **ChatGPT** | Planner, reviewer, merge controller, rollout controller |
| **Agent A** | Backend, API, worker, runtime, security, rollouts |
| **Agent B** | UI/UX/E2E when assigned; do not overwrite Agent A reports |
| **Human** | Secrets in consoles; production approval; smoke confirmation |

**Handoff (read order):**

1. `docs/agent-reports/LATEST.md`
2. Relevant `agent-*/latest.md`
3. `docs/agent-reports/PROJECT_STATE.md` (project-specific only)

**Rules:**

- No secrets in reports
- One task per branch; scoped PRs
- Default verification: `git diff --check`, typecheck, lint, test, build
- Production rollouts: pre/post smoke and rollback in reports
- Handoff markdown uses physical LF newlines (one line per heading, bullet, table row)

**HubChat product state** stays in `PROJECT_STATE.md` and `LATEST.md` only.

Do not duplicate it in the universal workflow doc.

### Agent Report Handoff Protocol

Repo-based handoff lives under **[docs/agent-reports/](docs/agent-reports/)**:

- At the end of every task, update **`docs/agent-reports/agent-a/latest.md`** or **`docs/agent-reports/agent-b/latest.md`** (from [`REPORT_TEMPLATE.md`](docs/agent-reports/REPORT_TEMPLATE.md)).
- Update **`docs/agent-reports/LATEST.md`** with the current handoff (master commit, runtime status, next action).
- For meaningful phases, hotfixes, or rollouts, add a **dated** historical report under the agent folder.
- **Never** include secrets or raw env values—use present/missing, mode names, and safe statuses only.
- **ChatGPT** should read **`docs/agent-reports/LATEST.md` first** for continuity (see also [docs/ai-agent-project-workflow.md](docs/ai-agent-project-workflow.md)).

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

## HubChat Testing Strategy

Use this section to choose the right verification depth for HubChat work. Do **not** run every E2E spec on every small PR.

### 1. Test levels

#### PR / Daily verification

Run on every PR or local implementation **before** commit/merge:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

If a PR touches a **critical UI/API flow**, also run the **relevant E2E spec only** (not the full suite).

Examples:

| Change area | Focused E2E command |
|-------------|---------------------|
| Team Members UI | `npx playwright test tests/e2e/auth-team-members.spec.ts -g "Team Members"` |
| Dashboard / Team Inbox | `npx playwright test tests/e2e/dashboard-smoke.spec.ts` |
| Follow-up UI/API | `npx playwright test tests/e2e/follow-up-smoke.spec.ts` |

#### Smoke test

Run **after** staging deploy, production deploy, hotfix, migration, or when the user asks to **test production**, **test staging**, **test the app**, or **test UI**.

Smoke tests should answer:

- Can users log in?
- Does Dashboard load?
- Does `GET /api/conversations` avoid **500**?
- Does the conversation list render?
- Do key pages render?
- Do critical **read-only** UI elements still work?
- Are there obvious network/API/browser errors?

**Production** smoke tests should be **read-only** unless the user **explicitly approves** mutation tests and a **dedicated test tenant** is configured.

#### Full loop / regression test

Run **before launch**, before a **major demo**, after a **major refactor**, after **schema/auth/dashboard/worker/channel** changes, or when the user explicitly asks for a **full loop test**.

Full loop should include (on **staging/test tenant** unless noted):

- Admin login
- Manager login
- Sales login
- Team Members create/edit/activate/deactivate (**mutation** — test tenant only)
- Sales access-denied rules
- Dashboard load
- `GET /api/conversations` non-500
- Conversation list render
- Conversation select
- Composer render
- Status controls
- Assignment / Team Inbox controls
- Follow-up set/clear (**staging/test tenant**)
- Follow-up / SLA / waiting badges
- Message send flow (**safe test channel only**)
- Worker/outbound status (**safe test channel only**)
- Channel-specific smoke (LINE / Facebook / Instagram) **only** when safe test credentials/channels exist

### 2. When full loop is required

Full loop / regression is **required or strongly recommended** when changes touch:

- Auth / login / session
- Roles / permissions
- Team Members / `sales_agents`
- Dashboard / conversation list
- `/api/conversations`
- Assignment / status / follow-up
- Supabase migrations / schema
- Message send flow
- Queue / outbox / worker
- Channel adapters
- Environment / config / deployment
- Broad UI layout or app shell changes

### 3. Test selection rule

| Situation | What to run |
|-----------|-------------|
| Small CSS/UI fix | typecheck, lint, unit, build + **focused** E2E for that surface |
| API route change | typecheck, lint, unit, build + route/unit tests + **related E2E** if it exists |
| Migration / schema change | typecheck, lint, unit, build + migration/deploy smoke + **affected API E2E** |
| Major feature / refactor | full **smoke** or **full loop** |
| Launch / demo preparation | **full loop** |

Do **not** run every E2E file for every tiny PR.

### 4. Production safety rules

- Do **not** mutate real customer data.
- **Production mutation tests** require **explicit user approval** per run.
- Use a **dedicated test tenant** and **test accounts**.
- Do **not** send real customer messages.
- Message-send tests must use **safe test channels** only.
- Do **not** print secrets or env values in chat, logs, or CI output.
- Use **`.env.e2e.local`** locally (gitignored); **never** commit it.
- If `E2E_BASE_URL` is **production-like**, `E2E_ALLOW_PRODUCTION=true` is required (`playwright.config.ts` guard).
- **Prefer staging** for mutation tests and full loop.

### 5. Required smoke test inventory

Keep smoke and regression coverage as **permanent specs** under `tests/e2e/` — not one-off manual steps.

**Recommended files** (each should be safe, documented, and **skippable** when required env vars are missing):

| Spec | Purpose |
|------|---------|
| `tests/e2e/auth-team-members.spec.ts` | Auth + Team Members (exists) |
| `tests/e2e/dashboard-smoke.spec.ts` | Dashboard, conversations API, inbox shell |
| `tests/e2e/follow-up-smoke.spec.ts` | Follow-up set/clear and badges |
| `tests/e2e/message-compose-smoke.spec.ts` | Composer and send (safe channel) |
| `tests/e2e/channel-line-smoke.spec.ts` | LINE channel smoke |
| `tests/e2e/channel-facebook-smoke.spec.ts` | Facebook channel smoke |
| `tests/e2e/channel-instagram-smoke.spec.ts` | Instagram channel smoke |

Add missing specs in **separate PRs** when coverage is needed; do not block unrelated fixes on inventing full E2E in the same change.

### 6. Current known coverage

| Area | Status |
|------|--------|
| Auth + Team Members | `auth-team-members.spec.ts` — login, Team Members CRUD/provisioning (mutation on test tenant), Sales access denied, manager roster rules, navigation regression; roster scroll (read-only test **E**) after scroll fix is deployed |
| Dashboard / `GET /api/conversations` / badges / composer / filters | **Not fully covered** until `dashboard-smoke.spec.ts` (and related specs) exist |
| Follow-up | **Not fully covered** until `follow-up-smoke.spec.ts` exists |
| Message send / channels | **Not fully covered** until compose/channel specs exist |

When reporting gaps, say which spec is missing vs which env vars are missing.

### 7. Reporting format

When Cursor runs tests, report:

- **Branch** and **commit**
- **Target host** only (from `E2E_BASE_URL` hostname) — **no secrets**
- **Env vars** present/missing — **names only**
- **Commands** run
- **Pass/fail** results per command/spec
- **Browser / API / network** failures (safe error text only)
- Whether the **deployed app** was actually opened (Playwright `baseURL`)
- **Coverage gaps** (missing spec vs missing env)
- Whether the result is safe for **merge**, **deploy**, or **launch**

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
