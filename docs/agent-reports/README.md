# Agent Reports — Handoff Protocol

## Purpose

This folder is the **single repo-based handoff location** for SmartKorp HubChat work across Agent A, Agent B, and ChatGPT. Reports capture what changed, how it was verified, production/runtime status, risks, and the recommended next step—without requiring manual copy/paste of long chat transcripts.

## Who updates what

| Role | Primary report file | When to update |
|------|---------------------|----------------|
| **Agent A** | `agent-a/latest.md` | After analysis, implementation, review, hotfix, rollout, or smoke test |
| **Agent B** | `agent-b/latest.md` | After UI/UX/E2E work (when Agent B is active) |
| **Any agent** | `LATEST.md` | After every meaningful task—current handoff for ChatGPT |
| **Stable context** | `PROJECT_STATE.md` | When architecture, runtime cutover state, or guardrails change |

## ChatGPT continuity rule

**ChatGPT should read [`LATEST.md`](./LATEST.md) first** as the source of truth for current handoff, then the relevant agent `latest.md`, then `PROJECT_STATE.md` for stable architecture and guardrails.

## Historical reports

For completed phases, hotfixes, or rollouts, add a **dated** report under the agent folder, for example:

- `docs/agent-reports/agent-a/2026-05-22-phase-ii-g2-c3-instagram-runtime-foundation.md`

Keep `agent-a/latest.md` (or `agent-b/latest.md`) pointing at the most recent work. Do not delete history unless explicitly cleaning up.

## Template

Copy [`REPORT_TEMPLATE.md`](./REPORT_TEMPLATE.md) for new reports.

## Security — never include secrets

Reports must **never** contain:

- Tokens, passwords, API keys, or service role values
- Raw environment variable values
- Private credentials or full webhook secrets
- Pasted Graph/LINE/Meta error payloads that include `access_token` or similar

For sensitive configuration, report only:

- **present** / **missing**
- Runtime **mode names** (e.g. `ENV_ONLY`, `DB_WITH_ENV_FALLBACK`)
- Safe statuses (e.g. `READY`, `NOT_CONFIGURED`, `PASS`, `FAIL`)
- Non-secret identifiers (branch, commit SHA, PR number, file paths)

## Required report content

Every report should include, when applicable:

- Branch, base/head commit, PR link
- Files changed (table)
- Behavior summary
- Verification results (`git diff --check`, typecheck, lint, test, build, smoke)
- Guardrails confirmation
- Smoke results (channels, worker logs, secret leak check)
- Known risks and rollback plan
- Next recommended step
- Reviewer notes for ChatGPT

## Workflow summary

1. Complete the task (code, docs, or ops).
2. Fill or update `agent-a/latest.md` or `agent-b/latest.md` from the template.
3. Update `LATEST.md` with current master, runtime status, and next action.
4. Update `PROJECT_STATE.md` only when stable project facts change.
5. Open PR; after merge, ensure `LATEST.md` on `master` reflects merged state.
