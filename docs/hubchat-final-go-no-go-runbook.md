# HubChat Final Go/No-Go Launch Gate Runbook (PROD-G1)

Final launch gate for SmartKorp HubChat production v1.

## Production target

- Canonical production domain: `https://smartkorp-hub-chat.vercel.app`
- This runbook is docs-only guidance and does not authorize config/runtime changes.
- Runtime mode must **not** be changed to `DB_ONLY` in this phase.

## Preconditions

1. PROD-D4 Channel Settings Runtime Confidence: pass.
2. PROD-E lead workflow/SLA/follow-up hardening: pass.
3. PROD-F production security/auth/runtime readiness: pass.
4. Latest merged production commit identified on both Vercel and Railway.

## Known ops baseline

Use as reference before/after smoke:

- inbound dead-letter baseline: `6`
- outbound dead-letter baseline: `19`
- pending/processing/stale: should be `0` before and after smoke unless actively testing

## Final GO criteria (all required)

## Access and auth

- ADMIN can access expected dashboard/admin surfaces.
- MANAGER can access manager-allowed dashboard surfaces.
- SALES can access only own-data workflow path.
- No role boundary regression is observed.

## Channel Settings confidence

- `/dashboard/channel-settings` (ADMIN) shows expected READY/SET state for LINE/Facebook/Instagram.
- Test connection succeeds for intended configured channels.
- No secret value is exposed in UI.

## Ops Runtime stability

- `/dashboard/ops` loads and is readable for ADMIN.
- pending/processing/stale remain stable at baseline after smoke.
- dead-letter does not grow unexpectedly after launch smoke sequence.

## Inbound smoke

- LINE inbound -> Dashboard pass.
- Facebook inbound (`POST /api/webhook/facebook`) -> Dashboard pass.
- Instagram inbound (canonical `POST /api/webhook/facebook`) -> Dashboard pass.

## Outbound smoke

- LINE outbound pass.
- Facebook outbound pass.
- Instagram outbound text pass.
- Facebook comment-origin flow pass.
- Instagram image outbound pass.
- Instagram PDF local negative validation pass (must fail before provider send).

## Runtime/system safety

- No new production `500` regressions in target routes.
- No stack traces/JWT/Bearer/secret leakage in UI/API/logs.
- Vercel and Railway are serving the intended launch commit.

## Final NO-GO criteria (any single item blocks launch)

1. Any token/secret leak in UI/API/logs/docs/chat artifacts.
2. `/api/setup/supabase-token` enabled in production.
3. `DB_ONLY` enabled without separate explicit approval plan.
4. Webhook signature verification fails for valid provider traffic.
5. Webhook accepted but message does not appear in Dashboard and queue remains stuck.
6. Queue `DONE` while message is not terminal `SENT`/expected terminal state.
7. Unexpected dead-letter growth after smoke.
8. Channel Settings reports READY but real outbound still fails.
9. Vercel and Railway commit mismatch for launch target.
10. Auth role boundary failure (privilege escalation or scope leakage).

## Incident decision matrix (launch gate)

## If webhook accepted but Dashboard missing message

- Check webhook runbook first, then Ops Runtime and worker health.
- If pending/stale abnormal and not clearing, mark NO-GO.

## If queue/outbox states are abnormal

- If pending/processing/stale do not return to baseline, mark NO-GO.
- If dead-letter increases without expected reason, mark NO-GO.

## If outbound provider behavior mismatches UI confidence

- READY + failing real sends is NO-GO until root cause is known.

## If deployment consistency is unclear

- Commit mismatch across Vercel/Railway is NO-GO.

## Cross-runbook references

- Webhook ingress: `docs/hubchat-webhook-smoke-runbook.md`
- Worker/queue observability: `docs/hubchat-worker-queue-observability-runbook.md`
- Channel runtime confidence: `docs/hubchat-channel-settings-runtime-confidence-runbook.md`
- Production security readiness: `docs/hubchat-production-security-readiness-runbook.md`
- Rollback confirmation: `docs/hubchat-rollback-confirmation.md`

## Launch sign-off template

Fill all fields (safe metadata only):

- Date/time:
- Production domain:
- Vercel commit:
- Railway commit:
- Supabase migration status:
- Ops baseline before smoke:
- Ops baseline after smoke:
- Channels tested:
- Final decision: `GO` / `NO-GO`
- Approver:
