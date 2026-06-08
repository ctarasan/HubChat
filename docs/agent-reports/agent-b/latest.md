# Agent B - Latest Report

**Current deliverable:** PROD-CUTOVER-1B (operator runbook + production cutover checklist).

## Status

Complete - docs-only cleanup pass pending merge of PR #193.

## Metadata

| Field | Value |
|-------|-------|
| Agent | B |
| Deliverable | PROD-CUTOVER-1B |
| Date | 2026-06-06 |
| Branch | `docs/prod-cutover-1b-operator-runbook` |
| PR | https://github.com/ctarasan/HubChat/pull/193 |
| Primary doc | `docs/prod-cutover-1b-operator-runbook.md` |
| Full report | [`2026-06-06-prod-cutover-1b-operator-runbook.md`](2026-06-06-prod-cutover-1b-operator-runbook.md) |

## Summary

Added operator runbook for Facebook Page onboarding (permissions, Channel Settings, test connection, webhooks, inbound/outbound and comment smokes), Facebook token/webhook/permission troubleshooting, Instagram avatar verification, and final production cutover checklist. Updated smoke test inventory with PROD-CUTOVER-1B entry.

Docs-only. Runtime remains `DB_WITH_ENV_FALLBACK`. Resolver flag off. Marketplace and CDP/Marketing Automation bridge out of scope.

## Next action

Ops: execute runbook before connecting the next customer Facebook Page; complete final cutover checklist (section 4) before GO; attach sanitized evidence via final smoke template.
