# New Project — AI Agent Workflow Bootstrap Checklist

Copy this checklist when starting a new repository with the ChatGPT +
Agent A/B workflow.

## Repository setup

- [ ] Create `docs/agent-reports/README.md` (adapt from HubChat or link
  to universal workflow)
- [ ] Copy `docs/agent-reports/REPORT_TEMPLATE.md`
- [ ] Create `docs/agent-reports/LATEST.md` (initial master commit, next
  step)
- [ ] Create `docs/agent-reports/PROJECT_STATE.md` (architecture, stack,
  guardrails)
- [ ] Create `docs/agent-reports/agent-a/latest.md`
- [ ] Create `docs/agent-reports/agent-b/latest.md` (or “inactive”
  placeholder)
- [ ] Add `docs/ai-agent-project-workflow.md` (or link to shared
  template repo)
- [ ] Add **Universal AI Agent Project Workflow** section to project
  `SKILL.md` or `AGENTS.md`

## Role definitions (fill in)

| Role | Owner | Scope |
|------|-------|--------|
| ChatGPT | Planner / reviewer / merge | |
| Agent A | | Backend / API / worker / … |
| Agent B | | UI / E2E / … (optional) |
| Human operator | | Secrets, production approval |

## Verification commands (fill in)

```bash
git diff --check
# typecheck:
# lint:
# test:
# build:
```

## Production guardrails (fill in)

- [ ] No secrets in reports
- [ ] One task per branch
- [ ] Migrations require explicit approval: yes/no
- [ ] Package lock changes require explicit approval: yes/no
- [ ] Rollout process documented: hosting provider, env naming

## First session rule

**ChatGPT reads `docs/agent-reports/LATEST.md` first** before planning
any work.
