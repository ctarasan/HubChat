# Agent Report

## Metadata
- Agent: A
- Date: 2026-05-28
- Phase / Task: PROD-C3 — Webhook Smoke Runbook refresh
- Branch: `master`
- Status: Complete

## Deliverables
- Added/updated operator docs for production inbound webhook smoke:
  - `docs/hubchat-webhook-smoke-runbook.md`
  - `docs/hubchat-smoke-test-inventory.md`
  - `docs/agent-reports/LATEST.md`
  - `docs/agent-reports/agent-a/latest.md`

## Notes
- Canonical production domain documented as `https://smartkorp-hub-chat.vercel.app`.
- Canonical inbound callbacks documented:
  - LINE: `/api/webhook/line`
  - Facebook: `/api/webhook/facebook`
  - Instagram: `/api/webhook/facebook`
- Included decision rule: `/api/webhook/instagram` 401 can be non-blocking when fresh IG DM still reaches Dashboard via `/api/webhook/facebook`.
