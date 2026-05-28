# HubChat Webhook Smoke Runbook (PROD-C3)

Operator-safe inbound webhook smoke checklist for SmartKorp HubChat production.

## Production target

- Canonical production project/domain: `https://smartkorp-hub-chat.vercel.app`
- Do not use old duplicate project/domain `hubchat-ui` for webhook smoke verification.

## Canonical callback mapping

- LINE inbound callback: `POST /api/webhook/line`
- Facebook inbound callback: `POST /api/webhook/facebook`
- Instagram inbound callback: `POST /api/webhook/facebook`

## Instagram Meta setup (expected)

- Product: **Instagram**
- Callback URL: `https://smartkorp-hub-chat.vercel.app/api/webhook/facebook`
- Subscription: **messages** enabled

## Pre-checks

1. Confirm latest production deployment is ready on Vercel.
2. Confirm Railway worker is running and healthy.
3. Confirm operator has safe test sender accounts for LINE/Facebook/Instagram.
4. Never paste or log secrets, tokens, JWTs, or raw payload bodies.

## Per-channel smoke checklist

Apply the same checklist for LINE, Facebook, and Instagram.

1. Send one fresh inbound test message from the channel test account.
2. Verify Vercel log route/status:
   - LINE: `POST /api/webhook/line` returns accepted status.
   - Facebook: `POST /api/webhook/facebook` returns accepted status.
   - Instagram: `POST /api/webhook/facebook` returns accepted status.
3. Verify accepted/enqueued webhook logging (safe metadata only).
4. Verify worker consumes and processes the queued job (Railway logs).
5. Verify the inbound message appears in HubChat Dashboard.
6. Verify logs do not expose secrets/tokens/JWT/raw provider payload.

## Instagram `/api/webhook/instagram` 401 decision rule

- If a fresh Instagram DM enters Dashboard through `POST /api/webhook/facebook`, treat `/api/webhook/instagram -> 401` as non-blocking noise (old retry/old subscription traffic).
- If a fresh Instagram DM does not enter Dashboard, escalate as an incident.

## Triage and rollback notes

When inbound is not visible in Dashboard:

1. **Vercel deploy health**: confirm production deploy is ready and serving latest master.
2. **Webhook ingress**: check whether webhook request reaches Vercel and which route/status is returned.
3. **Meta configuration** (Facebook/Instagram): confirm callback + subscription settings.
4. **Worker processing**: inspect Railway worker logs for queue claim/process failures.
5. **Queue/job health**: if webhook is accepted but message not shown, inspect queue/outbox processing health in **Ops Runtime** (`/dashboard/ops`, ADMIN) and follow `docs/hubchat-worker-queue-observability-runbook.md`.

Escalate immediately when ingress is healthy but processing/display fails across retries.

## Current PROD-C3 state reference

- LINE inbound smoke: pass
- Facebook inbound smoke: pass
- Instagram inbound smoke: pass via `POST /api/webhook/facebook`
- Residual `/api/webhook/instagram` 401 noise may appear and is non-blocking when Instagram dashboard delivery is healthy
