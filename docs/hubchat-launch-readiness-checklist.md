# HubChat Launch Readiness Checklist (PROD-F2)

Final operator checklist and smoke discipline before real production usage.

## Production target and scope

- Canonical production domain: `https://smartkorp-hub-chat.vercel.app`
- This checklist is docs-first and read-only smoke-first.
- No runtime behavior changes are part of PROD-F2.
- `DB_ONLY` runtime mode is out of scope and is a default NO-GO unless separately approved.

## Safety rules (always-on)

1. Never paste secrets, tokens, JWTs, raw payloads, or raw provider errors into docs/chat/tickets.
2. Run read-only smoke by default in production.
3. Run mutation smoke only with explicit approval and dedicated safe fixtures.
4. Treat any newly observed secret leak as immediate NO-GO.

## 1) Pre-launch environment readiness

Confirm all items before launch smoke:

- [ ] Vercel production app resolves to the canonical project/domain only (`smartkorp-hub-chat`).
- [ ] No operator workflow references removed duplicate project/domain (`hubchat-ui`).
- [ ] Railway worker is running healthy and on expected latest commit.
- [ ] Vercel deployment commit and Railway worker commit are aligned (or approved with explanation).
- [ ] Supabase connectivity is healthy from app and worker paths.
- [ ] No raw secrets/tokens appear in recent Vercel or Railway logs.
- [ ] Runtime mode remains `ENV_ONLY` or `DB_WITH_ENV_FALLBACK` unless explicit approval exists.

## 2) Authentication readiness

- [ ] ADMIN can access: Dashboard, Team Members, Ops Runtime, Channel Settings.
- [ ] MANAGER can access Dashboard and expected role-scoped controls.
- [ ] SALES can access own dashboard scope path and cannot access admin-only pages.
- [ ] Inactive SALES user or missing `sales_agents` row is blocked safely.
- [ ] `setup/supabase-token` is disabled/blocked in production flow.

Recommended read-only checks:

- `tests/e2e/dashboard-smoke.spec.ts` (Admin/Manager)
- `tests/e2e/dashboard-sales-smoke.spec.ts` (Sales restrictions)
- `tests/e2e/launch-readiness-smoke.spec.ts` (if env configured)

## 3) Channel readiness

Inbound/outbound confidence:

- [ ] LINE inbound text path verified.
- [ ] LINE outbound text path verified (controlled test fixture only).
- [ ] Facebook inbound path verified.
- [ ] Facebook outbound DM path verified (controlled fixture).
- [ ] Facebook comment-origin private/public flow verified where safe.
- [ ] Instagram inbound path verified via `/api/webhook/facebook`.
- [ ] Instagram outbound text verified (controlled fixture).
- [ ] Instagram outbound image verified (controlled fixture).
- [ ] Instagram PDF negative validation fails locally before provider call.

Channel Settings confidence:

- [ ] `Test connection` returns READY for LINE/Facebook/Instagram (or documented expected non-ready state).
- [ ] Secret inputs remain blank/write-only after save/reload.
- [ ] Metadata saves (`providerPageId`/`providerAccountName`) do not clear secrets.

Reference runbooks:

- `docs/hubchat-webhook-smoke-runbook.md`
- `docs/hubchat-channel-settings-runtime-confidence-runbook.md`
- `docs/hubchat-worker-queue-observability-runbook.md`

## 4) Dashboard readiness

- [ ] Conversation list loads without 500.
- [ ] Selecting a conversation shows chat header, composer, and context panel.
- [ ] Unread badge behavior is correct and operator copy is clear.
- [ ] Actions menu opens and role-appropriate controls are visible.
- [ ] Follow-up editor opens/closes; date/note controls render.
- [ ] Lead/follow-up/SLA filters render and active chips reflect selections.
- [ ] Empty and load-failed states are useful and operator-safe.
- [ ] No stack trace / JWT / Bearer / secret fragments shown in UI.

Recommended read-only specs:

- `tests/e2e/dashboard-smoke.spec.ts`
- `tests/e2e/dashboard-filters.spec.ts`
- `tests/e2e/dashboard-inbox-regression-smoke.spec.ts`
- `tests/e2e/messaging-media-regression-smoke.spec.ts`
- `tests/e2e/launch-readiness-smoke.spec.ts` (optional consolidated pass)

## 5) Ops Runtime readiness

Before and after smoke:

- [ ] `/dashboard/ops` loads for ADMIN.
- [ ] Refresh works and operator guidance is visible.
- [ ] `pending`, `processing`, `stale processing` are `0` unless actively running test work.
- [ ] Dead-letter baseline is understood as historical unless it grows:
  - inbound dead-letter baseline: `6`
  - outbound dead-letter baseline: `19`
- [ ] Any unexpected dead-letter growth is investigated before GO decision.

## 6) Rollback and incident response quick playbook

### A) Webhook accepted but message missing in Dashboard

1. Confirm webhook route accepted on Vercel for fresh test message.
2. Check Ops Runtime queue/outbox pending/stale/dead-letter.
3. Check Railway worker `/ready` and claim/process logs.
4. If ingress is healthy but processing/display fails across retries: declare incident and hold GO.

### B) Outbound queue not DONE

1. Verify worker health and queue claim logs.
2. Check pending/processing/stale counts and lag.
3. Hold launch if queue fails to drain for controlled fixture sends.

### C) Queue DONE but message not SENT

1. Treat as possible false terminal-state handling issue.
2. Validate final message status in safe operator view.
3. Hold GO and escalate until terminal semantics are confirmed.

### D) Provider token expired

1. Rotate token via approved provider workflow.
2. Update Channel Settings securely.
3. Re-run `Test connection` and controlled smoke before GO.

### E) Channel Settings READY but outbound failing

1. Check runtime mode expectation (`ENV_ONLY` vs `DB_WITH_ENV_FALLBACK`).
2. Verify worker/queue health in Ops Runtime.
3. Compare provider/API errors using safe metadata only.

### F) Vercel and Railway commits mismatch

1. Record both commit SHAs.
2. If mismatch is unplanned, redeploy to align.
3. Re-run read-only smoke and critical controlled channel checks.

### G) Ops dead-letter grows after smoke

1. Compare growth against known baseline.
2. Correlate to channel/step during smoke window.
3. Mark NO-GO until growth is explained and stabilized.

## 7) Go / No-Go gate

## GO only when all are true

- [ ] Auth readiness pass (Admin/Manager/Sales paths).
- [ ] Channel readiness pass (inbound/outbound + Channel Settings confidence).
- [ ] Dashboard readiness pass (list/selection/actions/follow-up/filter/operator-safe copy).
- [ ] Ops Runtime readiness pass (refresh healthy, no unexplained queue or dead-letter growth).
- [ ] Logs are clean (no secret/token/JWT/raw payload leakage).
- [ ] Rollback and incident response ownership confirmed.

## Automatic NO-GO conditions

- [ ] Any new secret/token/JWT leak in UI, logs, or test output.
- [ ] Any unexplained dead-letter growth after smoke.
- [ ] Queue stale processing persists > 0 without active test explanation.
- [ ] Auth path regression for Admin/Manager/Sales.
- [ ] `DB_ONLY` is enabled without explicit approved rollout plan.

## Suggested final smoke order (production read-only first)

1. `tests/e2e/dashboard-smoke.spec.ts`
2. `tests/e2e/dashboard-sales-smoke.spec.ts`
3. `tests/e2e/dashboard-inbox-regression-smoke.spec.ts`
4. `tests/e2e/messaging-media-regression-smoke.spec.ts`
5. `tests/e2e/channel-settings-smoke.spec.ts` (read-only-safe paths only)
6. `tests/e2e/ops-runtime-smoke.spec.ts`
7. `tests/e2e/launch-readiness-smoke.spec.ts` (optional consolidated verifier)

Mutation checks (outbound/follow-up/etc.) are separate and require explicit approval plus safe fixtures.
