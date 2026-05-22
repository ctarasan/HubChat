# AI Agent Project Workflow

## Purpose

This workflow is for software projects where:

- **ChatGPT** acts as planner, reviewer, merge controller, and rollout controller.
- **Agent A / Agent B** (or other coding agents) perform implementation, analysis, documentation, verification, and rollout execution.
- The **GitHub repository** stores both application code and **operational handoff reports**.
- The goal is to **reduce copy/paste context** between sessions and make work **auditable**, **scoped**, and **safe for production**.

The model was proven on SmartKorp HubChat.

The **universal process** lives in this file and in [`SKILL.md`](../SKILL.md).

**Project-specific** architecture and runtime state belong only in:

- [`docs/agent-reports/PROJECT_STATE.md`](./agent-reports/PROJECT_STATE.md)
- [`docs/agent-reports/LATEST.md`](./agent-reports/LATEST.md)

---

## Roles

### ChatGPT

- **Planner** — scopes tasks, writes agent prompts, defines guardrails and acceptance criteria.
- **Reviewer** — reviews diff, risk, verification, and report quality before merge.
- **Merge controller** — approves merge only when scope, verification, and guardrails are satisfied.
- **Rollout controller** — approves production env/runtime changes and post-rollout sign-off.
- **Risk controller** — blocks scope creep, secret leakage, and unintended migrations/package/runtime changes.
- **Prompt writer** — produces copy-paste-ready prompts for agents with explicit file scope and “do not change” lists.
- **Final decision maker** before merge and production deploy.

Outcomes: **PASS**, **PASS WITH NOTES**, **NEEDS CHANGES**, **BLOCKED**.

### Agent A

Typical ownership (adjust per project):

- Backend, API, domain logic, workers, queues, adapters, integrations.
- Security-sensitive paths, runtime config, migrations (when the phase requires them).
- Production analysis, hotfixes, controlled rollouts.
- **Report updates** in `docs/agent-reports/agent-a/`.

### Agent B

Typical ownership (only when explicitly assigned):

- UI, UX, frontend, CSS, client-side state.
- Playwright or other E2E tests.
- **Report updates** in `docs/agent-reports/agent-b/`.
- Must **not** overwrite Agent A reports or change backend/runtime files unless the task explicitly requires it.

### Human operator

- Approves production-impacting changes.
- Sets secrets and env values in hosting consoles (never pasted into reports).
- Performs external console actions agents cannot automate.
- Confirms smoke test results when agents lack dashboard or hosting access.

---

## Standard work cycle

1. **ChatGPT** prepares a scoped prompt (goal, branch name, files in scope, guardrails, verification, report updates).
2. **Agent** reads handoff before starting: `LATEST.md` → relevant `agent-*/latest.md` → `PROJECT_STATE.md`.
3. **Agent** syncs `master`, creates a **single-task branch**.
4. **Agent** performs analysis, implementation, or docs-only work per prompt.
5. **Agent** runs verification (see [Verification rules](#verification-rules)).
6. **Agent** updates report files (agent latest, `LATEST.md`, `PROJECT_STATE.md` if stable facts changed).
7. **Agent** opens a PR with a clear title and body (no secrets).
8. **ChatGPT** reviews scope, diff, risks, verification, and reports.
9. **Human** merges if ChatGPT approves.
10. **Agent** syncs `master` after merge.
11. **Smoke / rollout** performed when the task is production-facing (operator + agent report).
12. **Report updated again** with production result (PASS/FAIL, rollback, next step).

---

## Required handoff files

Recommended structure (copy to new repos):

```text
docs/agent-reports/
  README.md              # Repo handoff protocol (this project)
  REPORT_TEMPLATE.md     # Copy for each task report
  LATEST.md              # ChatGPT reads FIRST — current handoff
  PROJECT_STATE.md       # Stable architecture, guardrails, long-lived state
  agent-a/
    latest.md            # Agent A most recent task
    YYYY-MM-DD-*.md      # Historical reports (optional but recommended)
  agent-b/
    latest.md            # Agent B most recent task (or inactive placeholder)
```

| File | Purpose |
|------|---------|
| **README.md** | How handoff works in this repo; links to universal workflow. |
| **REPORT_TEMPLATE.md** | Reusable sections for every task report. |
| **LATEST.md** | Short, current snapshot: master commit, runtime/status, open PRs, next step. |
| **PROJECT_STATE.md** | Architecture, channels, production modes, guardrails—**project-specific only**. |
| **agent-a/latest.md** | Agent A’s last completed or in-progress task with verification and smoke. |
| **agent-b/latest.md** | Agent B’s last task, or explicit “inactive” placeholder. |

**ChatGPT continuity:** read **`LATEST.md` first**, then the relevant agent `latest.md`, then **`PROJECT_STATE.md`**.

---

## Report rules

Update reports after every **meaningful** task, including:

- Analysis (architecture, gap, risk)
- Implementation (feature, hotfix)
- Review-only deliverables (when findings affect next work)
- Rollout and smoke test
- Production verification or incident investigation
- Docs / process updates

Each report should include when applicable:

| Section | Content |
|---------|---------|
| Metadata | Agent, date, phase/task, branch, base/head commit, PR, status |
| Goal / scope | What was requested; what was excluded |
| Files changed | Table of paths |
| Behavior summary | What changed and why |
| Runtime / config | Modes, present/missing env keys—**no values** |
| Verification | Command results |
| Smoke | PASS/FAIL per area (project-specific table optional) |
| Guardrails | Explicit confirmations |
| Risks / rollback | Known issues; how to revert |
| Next step | One clear recommendation |
| Reviewer notes | Short notes for ChatGPT |

For production rollouts, add a **dated historical report** under `agent-a/`
(for example `YYYY-MM-DD-rollout-name.md`), in addition to updating `latest.md` and `LATEST.md`.

---

## Security rules

**Never** include in reports, PRs, or chat transcripts committed to the repo:

- Secrets, tokens, passwords, private keys, service role values
- Raw environment variable **values**
- Private credentials or full provider error payloads containing tokens

Report sensitive config only as:

- **present** / **missing**
- **enabled** / **disabled**
- Runtime **mode names** (e.g. `ENV_ONLY`, `DB_WITH_ENV_FALLBACK`)
- **configured** / **not configured**
- **PASS** / **FAIL** / **READY** / safe status enums

---

## Branch and PR rules

- **One task per branch** — name reflects the work (`feature/…`, `fix/…`, `docs/…`, `hotfix/…`).
- **Small scope** — only files required by the prompt.
- **No unrelated changes** — no drive-by refactors, formatting sweeps, or dependency bumps.
- **No package / migration / runtime changes** unless the task explicitly requires them.
- **Docs-only tasks** remain docs-only (no application code).
- **Production rollout reports** are docs-only unless a proven bug requires a code fix PR.
- **Do not merge** without ChatGPT review when that is the project rule.
- PR body: summary, test plan, guardrails, link to agent report—**no secrets**.

---

## Verification rules

### Default (code changes)

```bash
git diff --check
npm run typecheck
npm run lint
npm test
npm run build
```

Adapt commands for non-Node stacks (e.g. `go test`, `pytest`) in `PROJECT_STATE.md`.

### Docs-only changes (minimum)

```bash
git diff --check
npm run typecheck
npm run lint
```

Prefer full verification when practical and fast.

---

## Rollout rules

For production config or runtime cutover:

1. **Pre-rollout snapshot** — env keys present/missing, runtime mode names only.
2. **Pre-rollout smoke** — current behavior must pass before changing production.
3. **Change one variable or config surface at a time** when possible.
4. **Redeploy / restart** affected services.
5. **Post-rollout smoke** — same matrix as pre-rollout.
6. **Worker / service logs** — no new errors; **secret leak check**.
7. **DB sanity** (if checked) — job status, `last_error`, message delivery—no token values in fields.
8. **Rollback plan** documented before rollout (how to revert env + redeploy).
9. **Docs report update** — PASS/FAIL in agent reports and `LATEST.md`.
10. **No irreversible modes** (for example `DB_ONLY`, force push, destructive migration)
    unless a **separate approved phase** says so.

---

## Merge controller rules

ChatGPT should approve merge only after confirming:

| Check | Requirement |
|-------|-------------|
| Scope | Matches the approved prompt |
| Files | Only expected paths changed |
| Verification | Documented and passed |
| Guardrails | Held (no secret, no stray migration/package/UI) |
| Intentional risk | Runtime, schema, or dependency changes are explicit in the task |
| Production | Rollback path exists for production-facing work |
| Reports | `agent-*/latest.md` and `LATEST.md` updated or scheduled post-merge |

---

## Reusing this workflow in a new project

1. Copy the `docs/agent-reports/` structure and `REPORT_TEMPLATE.md`.
2. Create **`PROJECT_STATE.md`** with architecture, stack, guardrails, and verification commands.
3. Initialize **`LATEST.md`** with master commit and “project start” handoff.
4. Add **`docs/ai-agent-project-workflow.md`** (this file) or link from the new repo’s `SKILL.md`.
5. Define **Agent A / Agent B** ownership for that codebase.
6. Add project-specific guardrails (e.g. “no prod DB migration without approval”).
7. Define **production rollout** rules (hosting provider, env var naming).
8. Start **every ChatGPT session** by reading `docs/agent-reports/LATEST.md`.
9. Keep **universal** process in this doc; keep **product** facts out of it.

Optional: copy [`ai-agent-project-workflow-template.md`](./ai-agent-project-workflow-template.md) as a one-page checklist for new repos.

---

## HubChat-specific references

Do **not** duplicate HubChat runtime or channel detail in this file.

Use these pointers only:

- [`docs/agent-reports/PROJECT_STATE.md`](./agent-reports/PROJECT_STATE.md) — HubChat architecture and production runtime
- [`docs/agent-reports/LATEST.md`](./agent-reports/LATEST.md) — current handoff and next action
- [`docs/ai-agent-collaboration-rules.md`](./ai-agent-collaboration-rules.md) — Agent A/B specs and parallel work rules
