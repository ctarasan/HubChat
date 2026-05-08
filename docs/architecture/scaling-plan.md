# HubChat Scaling Plan

This document preserves HubChat's original phased scalability direction:

- Build the MVP simply.
- Keep architecture compatible with growth.
- Avoid premature over-engineering.
- Target future growth toward approximately 5,000 concurrent users using phased improvements.

## MVP Phase

Scope:

- Keep current architecture: webhook/API -> database -> outbox/queue -> worker -> provider adapter.
- Prioritize correctness, reliability, and delivery speed for core channels and lead assignment.
- Keep API endpoints mostly stateless and quick to return.
- Ensure webhook handlers acknowledge fast and offload heavy work to queue/worker paths.

Baseline requirements:

- Idempotency keys for inbound webhook events and outbound send commands.
- Safe retry behavior for workers (no duplicate message sends).
- Friendly local validation for unsupported media/types before provider calls.
- Pagination for conversation and message APIs.
- Basic indexes for frequently queried fields (tenant, channel, conversation, created_at, unread/status dimensions).

Out of scope for MVP:

- Complex distributed coordination.
- Heavy caching layers without measured need.
- Multi-region or advanced sharding.

## Growth Phase

Trigger signals:

- Sustained increases in active agents, conversations, and outbound volume.
- Queue lag or worker delay becoming visible in normal operations.

Focus areas:

- Horizontal worker scaling with clear concurrency controls per queue/topic.
- Provider adapter hardening:
  - idempotent send behavior
  - rate-limit aware retry/backoff
  - bounded retry with dead-letter handling
- Query optimization for chat list, message list, assignment views, and marketplace views.
- Eliminate N+1 access patterns in list/detail endpoints.
- Tighten pagination strategy (stable sort keys and cursor/seek behavior where useful).

## Scale Phase

Target direction:

- Approximately 5,000 concurrent users through:
  - horizontally scaled stateless APIs
  - horizontally scaled workers with tuned concurrency
  - database/index optimization
  - repeatable load testing and bottleneck remediation

Focus areas:

- Capacity planning for API, worker, and database tiers.
- Per-channel and per-provider throughput guardrails.
- Queue partitioning and worker pool tuning by workload type.
- Strong observability and SLO-informed alerting.
- Controlled rollout and stress validation before major launches.

## Key Bottlenecks to Monitor

- API p95/p99 latency and error rate
- Webhook ingestion latency and acknowledgment time
- Queue depth, queue lag, retry volume, dead-letter count
- Worker throughput and job processing duration
- Provider error/rate-limit responses by channel
- Database query latency, lock/wait contention, connection saturation
- Slow query frequency in chat list, message list, assignment, and marketplace pages

## Load Testing Checklist

- Define realistic user and traffic profiles by channel.
- Test webhook bursts and outbound message spikes.
- Test mixed workloads: chat read, chat send, lead assignment, marketplace polling/sync.
- Measure p50/p95/p99 latency, error rates, and saturation points.
- Capture queue lag and worker retry/dead-letter behavior under load.
- Verify graceful degradation and recovery behavior.
- Record bottlenecks and mitigation actions per run.

## Database/Indexing Checklist

- Confirm indexes for high-selectivity filters and common sort keys.
- Ensure tenant-scoped queries use tenant-friendly index patterns.
- Ensure message/conversation pagination uses stable ordering.
- Validate assignment and ownership filters are index-backed.
- Review and remove N+1 query patterns in high-traffic endpoints.
- Track and remediate slow queries from production-like traffic.

## Worker Scaling Checklist

- Ensure workers are stateless and horizontally scalable.
- Tune concurrency by workload type (send, webhook processing, outbox relay).
- Enforce idempotency and deduplication on retries.
- Validate retry policy (exponential backoff + max attempts + dead-letter).
- Confirm safe behavior for partial provider success/failure cases.
- Monitor worker CPU/memory and queue lag during load tests.

## Queue/Outbox/Retry Checklist

- Webhook/API ingress should enqueue quickly and return without waiting for slow provider work.
- Outbox writes and queue publish must be idempotent where practical.
- Retry policy should use bounded attempts with exponential backoff and jitter.
- Non-retryable errors must fail fast and be categorized clearly.
- Dead-letter paths must preserve enough context for replay/triage.
- Retry processing must avoid duplicate provider sends through idempotency safeguards.

## Provider Rate Limit Checklist

- Implement channel/provider-specific rate-limit handling.
- Classify retryable vs non-retryable provider errors.
- Apply backoff and jitter for retryable failures.
- Prevent duplicate sends across retries via idempotency keys.
- Track provider error codes and response envelopes for diagnostics.
- Add alerts for sustained rate-limit or provider failure trends.

## Monitoring and Logging Checklist

- Structured logs with tenant/channel/conversation/message correlation ids.
- No logging of tokens, secrets, or sensitive credentials.
- Metrics for API latency/errors, queue lag, retry/dead-letter, worker throughput.
- Dashboards per channel and workload type.
- Alerts for SLO breaches and sustained backlog growth.
- Runbook links for common incident classes.

## Definition of Done for High-Concurrency Readiness

Before claiming readiness for high concurrency, all must be true:

1. Load tests demonstrate stable behavior at target profile.
2. API and worker p95/p99 remain within agreed thresholds.
3. Queue lag remains bounded with horizontal scaling.
4. Retry/dead-letter behavior is safe, observable, and documented.
5. Provider rate-limit handling is validated for each active channel.
6. Database queries for critical flows are index-friendly and N+1 free.
7. Alerting, dashboards, and incident runbooks are in place.
8. No known blocker remains for scaling toward approximately 5,000 concurrent users.
