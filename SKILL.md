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

_End of SKILL.md — update this file when Phase II status or working agreements change._
