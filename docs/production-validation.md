# Production Validation Runbook (Phase 1 Stack)

This runbook is for validating launch readiness of the current stack only:

- Next.js on Vercel
- Supabase/Postgres
- Railway workers

No additional infrastructure is assumed.

## 1) Validation Workload Profiles

Profiles are implemented in `src/loadtest/validationProfiles.ts` and used by `scripts/loadtest-harness.mjs`.

- **low**
  - idle connected users: 1,500
  - inbound burst events: 200
  - outbound sustained: 300/min for 10 minutes
  - duplicate deliveries: 3%
- **medium**
  - idle connected users: 3,000
  - inbound burst events: 500
  - outbound sustained: 800/min for 15 minutes
  - duplicate deliveries: 5%
- **high**
  - idle connected users: 5,000
  - inbound burst events: 1,000
  - outbound sustained: 1,400/min for 20 minutes
  - duplicate deliveries: 8%

Retry/recovery is exercised by outbox+queue failure handling and duplicate replay under load.

## 2) Success Criteria (SLOs)

SLO thresholds are profile-based and encoded in `src/loadtest/validationProfiles.ts`.

Core gates:

- queue lag p95 (`/metrics`): under profile `queueLagMsP95Max`
- outbox lag p95 (`/metrics`): under profile `outboxLagMsP95Max`
- webhook latency p95/p99 (harness): under profile thresholds
- outbound API latency p95/p99 (harness): under profile thresholds
- retry rate: `queueJobsFailed / (queueJobsProcessed + queueJobsFailed)` under profile max
- dead-letter rate: `(queueJobsDeadLettered + outboxEventsDeadLettered) / total` under profile max

DB/query latency expectation for Phase 1 validation:

- p95 API query latency (conversations/leads/messages list) should remain < 400ms at medium
- p95 API query latency should remain < 700ms at high

If DB query latency violates targets while CPU is low, inspect indexes and query plans first.

## 3) Test Execution Support

### Scripts

- `npm run loadtest -- --profile=low|medium|high --output=tmp/loadtest-<profile>.json`
- `npm run validate:summary -- --profile=<profile> --loadtest-report=... --worker-metrics-url=http://<worker-host>:8081/metrics --output=tmp/validation-summary-<profile>.json`
- `npm run validate:stage -- --profile=<profile> --worker-metrics-url=http://<worker-host>:8081/metrics`

### Worker env templates

- `env/worker.low.env.template`
- `env/worker.medium.env.template`
- `env/worker.high.env.template`

Use these as Railway environment baselines for each stage.

## 4) Staged Validation Procedure

1. Deploy database schema updates from `supabase/schema.sql`.
2. Deploy worker with `WORKER_HEALTH_PORT=8081`.
3. Verify worker readiness:
   - `GET /ready` => 200
   - `GET /metrics` => JSON payload
4. Stage sequence:
   - low profile
   - medium profile
   - high profile
5. For each stage:
   - apply matching env template
   - run `npm run validate:stage -- --profile=<stage> --worker-metrics-url=...`
   - archive reports from `tmp/`
6. Compare each stage summary `verdict`.

## 5) Practical Validation Checklist

- [ ] Pagination endpoints are used by UI (no unbounded list query usage)
- [ ] Worker `/ready` and `/metrics` reachable in Railway
- [ ] Queue lag remains below SLO during peak portion
- [ ] Outbox lag remains below SLO during peak portion
- [ ] Webhook p95/p99 within SLO
- [ ] Outbound p95/p99 within SLO
- [ ] Retry rate under threshold
- [ ] Dead-letter rate under threshold
- [ ] No sustained DB saturation (CPU/connection spikes that do not recover)
- [ ] No message loss symptoms (queue/outbox drains to near-zero post-run)

## 6) Railway Tuning Guidance

Initial instance guidance:

- low: 2 worker instances
- medium: 3-4 worker instances
- high: 5-6 worker instances

Start values:

- `WORKER_INBOUND_BATCH_SIZE`: 40
- `WORKER_INBOUND_CONCURRENCY`: 16
- `WORKER_OUTBOUND_BATCH_SIZE`: 30
- `WORKER_OUTBOUND_CONCURRENCY`: 10
- `WORKER_OUTBOX_BATCH_SIZE`: 80
- `WORKER_OUTBOX_CONCURRENCY`: 16
- `WORKER_POLL_INTERVAL_MS`: 200
- `WORKER_OUTBOX_PROCESSING_TIMEOUT_SECONDS`: 180

Tune in this order:

1. If queue lag rises but CPU < 70% and DB healthy:
   - increase worker instances
   - then increase inbound/outbound concurrency.
2. If outbox lag rises but queue lag stays low:
   - increase outbox batch/concurrency first.
3. If DB CPU or lock waits rise:
   - reduce per-instance concurrency
   - increase instance count instead
   - increase poll interval slightly.
4. If memory pressure rises:
   - reduce batch sizes before reducing concurrency.

## 7) Pass/Fail Framework

**PASS** for a stage:

- all SLO checks pass in generated summary
- no sustained queue/outbox growth after load stops
- no abnormal dead-letter growth

**FAIL** for a stage:

- any SLO check fails
- queue/outbox remain elevated for >15 minutes post-test
- dead-letter breaches threshold

Launch decision:

- Launch when medium and high both pass with repeatability across at least 2 runs.

## 8) Signals That Phase 2 Infrastructure Is Required

Consider Phase 2 when one or more persist despite tuning and horizontal worker scaling:

- queue lag repeatedly exceeds 30-60s at high profile
- outbox lag accumulates faster than relay can drain
- dead-letter rate breaches threshold due to throughput pressure (not provider outages)
- DB saturation becomes sustained during normal peak windows
- high duplicate/retry volume causes cascading lag and recovery windows >30 minutes
