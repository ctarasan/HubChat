# HubChat Worker / Queue Observability Runbook (PROD-D1)

Operator-safe guide for distinguishing **Vercel webhook ingress** issues from **Railway worker / queue processing** issues.

## Production target

- Canonical production domain: `https://smartkorp-hub-chat.vercel.app`
- Do not use removed duplicate Vercel project `hubchat-ui`.

## Pipeline (read-only mental model)

```text
Customer message (LINE / Meta)
  -> POST /api/webhook/* on Vercel (signature verify, accept/enqueue)
  -> webhook_events + outbox_events (database, atomic write)
  -> OutboxRelayWorker (Railway) claims outbox_events
  -> queue_jobs (message.inbound.normalized | message.outbound.requested)
  -> InboundWorker / OutboundWorker (Railway)
  -> messages table -> HubChat Dashboard
```

## Where to look first

| Layer | What to check | Healthy signal |
|-------|----------------|----------------|
| Vercel ingress | Webhook route returns 200/accepted; safe accept/enqueue logs | Fresh test message accepted |
| Ops Runtime (ADMIN) | `/dashboard/ops` or `GET /api/ops/runtime` | Pending/stale/dead-letter counts near baseline |
| Railway worker | Worker `/ready` JSON `status: healthy` | Loops fresh; not stuck in `starting` |
| Railway logs | `inbound_claim`, `outbound_claim`, `Inbound message processed` | Claim/process after webhook accept |

Webhook smoke steps: `docs/hubchat-webhook-smoke-runbook.md`.

## Ops Runtime fields (ADMIN only)

Global counts across all tenants. **No secrets** — counts only.

### Legacy PENDING summary (unchanged)

| Field | Meaning |
|-------|---------|
| `queue.depth` / `queue.lagMs` | All topics: PENDING jobs available now + oldest PENDING age |
| `outbox.depth` / `outbox.lagMs` | PENDING outbox events available now + oldest PENDING age |

### Worker queue detail (PROD-D1)

| Section | Metrics |
|---------|---------|
| Inbound queue (`message.inbound.normalized`) | pending, processing, stale processing, dead letter |
| Outbound queue (`message.outbound.requested`) | pending, processing, stale processing, dead letter |
| Outbox (`outbox_events`) | pending, processing, stale processing, dead letter |

**Pending** — row is `PENDING` and `available_at` is now (ready to claim).

**Processing** — row is `PROCESSING` (claimed by a worker).

**Stale processing** — `PROCESSING` with `updated_at` older than reclaim threshold (defaults: queue 300s, outbox 120s). Suggests worker crash, stall, or severe slowness.

**Dead letter** — retries exhausted. Inspect Railway worker logs for safe error metadata (no raw tokens).

## Decision tree: message not in Dashboard

```text
1) Webhook smoke (PROD-C3)
   POST /api/webhook/* returns accepted on Vercel?
   NO  -> Meta/LINE callback, signature, deploy (ingress) — not queue ops
   YES -> continue

2) Ops Runtime — outbox pending / lag elevated?
   YES -> Railway OutboxRelayWorker or worker down; check /ready + logs
   NO  -> continue

3) Ops Runtime — inbound queue pending / lag elevated?
   YES -> Railway InboundWorker; check /ready + inbound logs
   NO  -> continue

4) Ops Runtime — stale PROCESSING > 0 (queue or outbox)?
   YES -> worker stuck or not reclaiming; check Railway /ready, restart if unhealthy
   NO  -> continue

5) Ops Runtime — dead letter > 0?
   YES -> inspect Railway logs (deliveryErrorCode, channel); fix token/config
   NO  -> continue

6) Ingress + queues look idle but message missing?
   -> tenant/UI/conversation routing (separate from PROD-D1)
```

## Railway worker health (no secrets in examples)

1. Open Railway service for HubChat worker.
2. Call worker health URL `/ready` (port from Railway service config).
3. Expect JSON with `status: healthy` when loops are running.
4. If `status: starting` or 503 — worker booting or outbound loop not ready; wait or investigate boot logs.
5. Search logs for: `worker_loop_poll`, `inbound_claim`, `outbound_claim`, `Inbound message processed`, `Outbound message sent`.

Do not paste env vars, tokens, or raw webhook payloads into tickets.

## Interpreting health reasons

Examples from `GET /api/ops/runtime`:

- `queue_depth_warn` / `queue_lag_warn_ms` — PENDING backlog (existing behavior)
- `queue_inbound_processing_stale:N` — critical; inbound jobs stuck in PROCESSING
- `outbox_processing_stale:N` — critical; outbox relay stall
- `queue_outbound_dead_letter:N` — warn; outbound retries exhausted
- `outbox_dead_letter:N` — warn; outbox relay dead letter

## What PROD-D1 does not cover

- Per-tenant queue breakdown (global ADMIN view only)
- Message bodies, `payload_json`, or raw `last_error` in ops API
- Automatic remediation or worker config changes
- Webhook signature debugging (see webhook smoke runbook)

## Related docs

- Webhook smoke: `docs/hubchat-webhook-smoke-runbook.md`
- Smoke inventory: `docs/hubchat-smoke-test-inventory.md`
- Worker boot/reclaim hotfix: `docs/worker-production-hotfix-runbook.md`
