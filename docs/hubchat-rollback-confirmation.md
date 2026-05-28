# HubChat Rollback Confirmation Runbook (PROD-G1)

Conservative rollback guidance for production launch incidents.

## Scope and safety

- Data-preserving first: prefer rollback/redeploy over data mutation.
- Do not enable `DB_ONLY` in this phase.
- Do not execute destructive DB rollback unless a migration-specific rollback plan exists.
- Do not expose secrets/tokens/payload internals while triaging.

## Rollback triggers (examples)

- Secret/token exposure.
- Auth boundary failure.
- Setup route unexpectedly enabled.
- Webhook accepted but Dashboard missing and queue stuck.
- Queue `DONE` with non-terminal outbound message state.
- Unexpected dead-letter growth post smoke.
- Vercel/Railway commit mismatch causing inconsistent runtime behavior.

## Rollback confirmation sequence

## 1) Freeze risky changes

1. Pause further rollout actions.
2. Record current production commit SHAs (Vercel and Railway).
3. Capture pre-rollback Ops Runtime snapshot.

## 2) Vercel rollback path

1. Select last known-good production deployment.
2. Promote/rollback to known-good deployment.
3. Confirm dashboard/API smoke at `https://smartkorp-hub-chat.vercel.app`.

## 3) Railway worker rollback/redeploy path

1. Align Railway worker to last known-good commit/image.
2. Redeploy/restart worker service safely.
3. Verify worker readiness (`/ready`) and healthy loop activity in logs.

## 4) Runtime config rollback path

Allowed runtime rollback targets in this phase:

- `ENV_ONLY`
- `DB_WITH_ENV_FALLBACK`

Prohibited in this phase:

- `DB_ONLY` (unless separately approved in a later explicit plan)

If runtime behavior is uncertain, revert to previously confirmed safe mode.

## 5) Channel token rollback path (safe handling)

1. Use Channel Settings UI (ADMIN-only) to rotate/reapply credentials.
2. Confirm secrets remain write-only (blank after save/reload).
3. Re-run Test connection.
4. Never paste raw tokens or secrets into reports or logs.

## 6) Database rollback stance

- No blanket destructive rollback.
- If issue is migration-specific, follow migration-specific rollback playbook only.
- Preserve queue/outbox/message data for incident analysis.

## Queue/outbox caution

If queue/outbox appears unhealthy:

1. Preserve data state.
2. Inspect Ops Runtime snapshot and worker logs.
3. Do **not** manually mark jobs `DONE` unless root cause and impact are fully understood.
4. Validate terminal message states before any manual intervention.

## Incident playbook quick responses

## Webhook accepted but Dashboard missing message

- Confirm canonical callbacks and webhook status.
- Check Ops Runtime pending/stale and worker readiness/logs.
- If unresolved quickly, rollback app/worker to known-good.

## Inbound pending/stale > 0

- Check Railway worker health and loop liveness.
- If persistent after restart/redeploy, rollback worker/app and escalate.

## Outbound queue stuck

- Check outbound worker processing and provider failure signals.
- Compare against baseline; rollback if instability persists.

## Queue DONE but provider did not send

- Treat as critical consistency issue.
- Preserve evidence and rollback to known-good behavior path.

## Provider token expired

- Rotate/reapply token via Channel Settings.
- Re-test connection and outbound smoke.
- Rollback deployment only if token fix does not restore behavior.

## Instagram `/api/webhook/instagram` noise

- Canonical production callback is `/api/webhook/facebook`.
- Old `/api/webhook/instagram` noise alone is not incident if canonical flow succeeds.

## Media send failure

- Validate channel capability and payload constraints first.
- For persistent unexplained failures, rollback and escalate with safe metadata.

## Supabase/API outage

- Confirm external dependency health.
- Keep rollback decision conservative; avoid destructive DB actions.

## Vercel UI deploy issue

- Roll back to last known-good Vercel deployment.
- Re-run dashboard/auth smoke.

## Railway worker issue

- Redeploy/rollback worker to known-good commit/image.
- Verify `/ready`, queue drain behavior, and dead-letter stability.

## Rollback confirmation checklist

Mark complete before closing incident:

- Vercel commit rolled back/confirmed:
- Railway commit rolled back/confirmed:
- Runtime mode confirmed (`ENV_ONLY` or `DB_WITH_ENV_FALLBACK`):
- Setup route disabled:
- Ops snapshot after rollback captured:
- Inbound smoke retest pass:
- Outbound smoke retest pass:
- Dead-letter baseline stable:
- Final incident status: mitigated / open follow-up

## Related runbooks

- Final go/no-go gate: `docs/hubchat-final-go-no-go-runbook.md`
- Webhook smoke: `docs/hubchat-webhook-smoke-runbook.md`
- Worker observability: `docs/hubchat-worker-queue-observability-runbook.md`
- Channel runtime confidence: `docs/hubchat-channel-settings-runtime-confidence-runbook.md`
- Production security readiness: `docs/hubchat-production-security-readiness-runbook.md`
