# Hub Chat Omnichannel - Phase 1 MVP

Production-oriented Phase 1 foundation for an omnichannel chat + lead management platform using:

- Next.js on Vercel (UI + lightweight API/webhook)
- Supabase (Postgres/Auth/Storage/Realtime)
- Optional worker service for async jobs

The code follows clean architecture and keeps domain/application layers decoupled from Vercel/Supabase.

## Deliverables Mapping

1. System architecture diagram: `docs/architecture.md`
2. Container architecture diagram: `docs/architecture.md`
3. Module/service breakdown: `docs/architecture.md`
4. PostgreSQL schema: `supabase/schema.sql`
5. Event schema: `docs/architecture.md` + `src/domain/events.ts`
6. API design: `docs/architecture.md` + `src/interfaces/api/contracts.ts`
7. Queue abstraction: `src/domain/ports.ts` + `src/infrastructure/adapters/queue/dbQueue.ts`
8. Inbound sequence diagram: `docs/architecture.md`
9. Outbound sequence diagram: `docs/architecture.md`
10. Phase 1 deployment architecture: `docs/architecture.md`
11. Phase 2 upgrade path: `docs/architecture.md`
12. Codebase structure: `docs/architecture.md`
13. Example code:
   - Webhook handler: `src/interfaces/api/webhook/line.ts`
   - Message normalization: `src/infrastructure/adapters/channels/lineAdapter.ts`
   - Queue interface: `src/domain/ports.ts`
   - Channel adapter: `src/infrastructure/adapters/channels/lineAdapter.ts`
   - Outbound worker: `src/worker/outboundWorker.ts`

## Key Phase 1 Guarantees

- Fast webhook response with async processing
- Idempotent webhook/event handling design
- Multi-tenant schema (`tenant_id` on all business tables)
- Async outbound with retry/backoff/dead-letter hooks
- Lead lifecycle transition guard
- Supabase Realtime-ready schema for inbox updates

## Quick Start

1. Install dependencies:
   - `npm install`
2. Apply database schema to Supabase:
   - Run `supabase/schema.sql` in SQL editor
3. Configure env vars for worker and API:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
   - `DEFAULT_TENANT_ID` (for channel webhooks that do not send tenant header, e.g. LINE)
   - `LINE_CHANNEL_SECRET`
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `FACEBOOK_PAGE_ACCESS_TOKEN` (required to fetch Facebook post comment text from Graph API when webhook payload does not include message body)
   - `WORKER_POLL_INTERVAL_MS` (default `200`)
   - `WORKER_INBOUND_BATCH_SIZE` (default `20`)
   - `WORKER_INBOUND_CONCURRENCY` (default `8`)
   - `WORKER_OUTBOUND_BATCH_SIZE` (default `15`)
   - `WORKER_OUTBOUND_CONCURRENCY` (default `5`)
   - `WORKER_OUTBOX_BATCH_SIZE` (default `50`)
   - `WORKER_OUTBOX_CONCURRENCY` (default `10`)
   - `WORKER_OUTBOX_PROCESSING_TIMEOUT_SECONDS` (default `120`)
   - `WORKER_OBSERVABILITY_POLL_MS` (default `5000`)
   - `WORKER_HEALTH_PORT` (optional; enables `/ready` and `/metrics` endpoints on worker)
   - `OUTBOUND_RATE_LIMIT_REQUESTS_PER_WINDOW` (default `120`)
   - `OUTBOUND_RATE_LIMIT_WINDOW_SECONDS` (default `60`)
   - `IDEMPOTENCY_PROCESSING_TTL_SECONDS` (default `300`)
   - `IDEMPOTENCY_COMPLETED_TTL_SECONDS` (default `86400`)
4. Run worker:
   - `npm run dev:worker`
5. Run Next app:
   - `npm run dev`

Local env template:

- Copy `.env.example` and fill values for local development.

## Deploy Worker on Railway

Files included for one-click worker deployment:

- `railway.json` (Nixpacks + start command)
- `Procfile` (`worker: npm run dev:worker`)

Railway service environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `FACEBOOK_PAGE_ACCESS_TOKEN` (if worker sends outbound Facebook messages)

Deployment notes:

- Create a separate Railway service for worker from the same repo.
- Ensure the service runs with `npm run dev:worker`.
- Keep web/API on Vercel and worker on Railway for async processing.

## Deploy Next.js App on Vercel

This repository deploys from the repo root (no subdirectory build needed).

### 1) Import project

- In Vercel: **Add New Project** -> import this repository
- Framework preset: **Next.js**
- Root directory: repository root (`.`)
- Build command: `next build` (default)
- Output directory: default Next.js output (do not override)

### 2) Set environment variables (Vercel project)

Browser-safe variables (`NEXT_PUBLIC_*`):

- `NEXT_PUBLIC_APP_BASE_URL` (optional, default composer base URL)

Server-only variables (must not use `NEXT_PUBLIC_`):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `DEFAULT_TENANT_ID` (optional fallback for some webhook routing)
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `FACEBOOK_PAGE_ACCESS_TOKEN`
- `FACEBOOK_VERIFY_TOKEN`
- `MESSAGE_IMAGE_BUCKET` (optional, default `message-images`)
- `MESSAGE_IMAGE_URL_MODE` (optional, `signed` or `public`)
- `MESSAGE_IMAGE_SIGNED_URL_TTL_SEC` (optional, default 30 days)

### 3) Deploy and redeploy behavior

- Deploy once after env variables are added.
- If env variables change later, trigger **Redeploy** so Next.js server routes pick up new values.
- Keep worker-related env vars on Railway, not on Vercel.

### 4) Production build validation command

- Run locally before pushing:
  - `npm run build`

## API Auth + RBAC

All API routes require:

- `Authorization: Bearer <Supabase access token>`
- `x-tenant-id: <tenant uuid>`

RBAC policy:

- Sales / Manager / Admin:
  - `GET /api/leads`
  - `GET /api/leads/:id`
  - `PATCH /api/leads/:id`
  - `GET /api/conversations`
  - `POST /api/messages/upload-image` (outbound image upload for LINE/Facebook DM)
  - `POST /api/messages/send`
- Manager / Admin only:
  - `POST /api/leads/:id/assign`
  - `GET /api/dashboard/metrics`

Role source:

- Primary: `sales_agents.role` by `(tenant_id, email)` where `status = ACTIVE`
- Fallback: Supabase user metadata `app_metadata.role` / `user_metadata.role`

## Notes

- This is Phase 1-first (lean launch). Queue adapter can be swapped for Kafka in Phase 2 without touching use cases.
- Queue processing is now batch/concurrency-based in the worker with Postgres-backed claim/ack/fail primitives; a Redis/BullMQ adapter can implement the same `QueuePort`.
- Inbound webhook persistence and outbound message creation now use a Postgres transactional outbox, then an outbox relay worker forwards events into the queue path safely.
- Add adapters for Facebook/Instagram/TikTok/Shopee/Lazada by implementing `ChannelAdapter` and registering them in a registry.
- AI features should enqueue jobs and execute in workers; core messaging still works when AI is disabled.

### Facebook outbound target format

- For Messenger send (`/me/messages`), use `channelThreadId` as the PSID (or `user:<PSID>`).
- For Facebook comment reply (`/{object-id}/comments`), use one of:
  - `comment:<COMMENT_ID>` (reply to specific comment)
  - `post:<POST_ID>` (post new top-level comment on post)
  - raw object id containing `_` (auto-treated as comment/post object id)
- `POST /api/messages/send` helper:
  - Send `facebookTargetType: "MESSENGER"` + `facebookTargetId: "<PSID>"` to auto-build `channelThreadId`.
  - Send `facebookTargetType: "COMMENT"` + `facebookTargetId: "<COMMENT_ID>"` to auto-build `channelThreadId`.
  - Existing `channelThreadId` payload style still works (backward compatible).

## Pagination (Phase C)

- `GET /api/conversations` supports `limit` and `cursor` query params.
- `GET /api/leads` supports `limit` and `cursor` query params.
- `GET /api/conversations/:id/messages` supports `limit` and `cursor` query params.
- Sort order uses stable keyset pagination:
  - conversations: `last_message_at DESC, id DESC`
  - leads: `updated_at DESC, id DESC`
  - messages: `created_at DESC, id DESC`

## Worker Observability (Phase C)

- Worker emits structured logs including `tenantId`, `conversationId`, `messageId`, `queueJobId`, and `outboxEventId` when available.
- Worker metrics snapshot includes:
  - queue depth/lag
  - outbox depth/lag
  - jobs processed/sec
  - failures/retries/dead-letter counts
  - provider latency p95
- Optional worker health endpoints:
  - `GET /ready`
  - `GET /metrics`

## Load Test Harness

Run:

- `npm run loadtest`
- `npm run validate:stage -- --profile=low|medium|high --worker-metrics-url=http://<worker-host>:8081/metrics`
- `npm run validate:summary -- --profile=medium --loadtest-report=tmp/loadtest-medium.json --worker-metrics-url=http://<worker-host>:8081/metrics`

Required environment variables:

- `HUB_CHAT_BASE_URL`
- `HUB_CHAT_TENANT_ID`

Optional outbound load variables:

- `HUB_CHAT_ACCESS_TOKEN`
- `HUB_CHAT_LEAD_ID`
- `HUB_CHAT_CONVERSATION_ID`
- `HUB_CHAT_CHANNEL_THREAD_ID`

Default workload assumptions in harness:

- 300 inbound burst events
- 1,200 outbound events/minute for 10 minutes
- 5% duplicate deliveries on both inbound/outbound paths

Validation profiles (implemented):

- `low`: idle 1,500 users, 200 inbound burst, 300 outbound/min for 10m
- `medium`: idle 3,000 users, 500 inbound burst, 800 outbound/min for 15m
- `high`: idle 5,000 users, 1,000 inbound burst, 1,400 outbound/min for 20m

Full production validation runbook:

- `docs/production-validation.md`

## Outbound Image Constraints

Supported now (outbound only):

- channels: `LINE`, `FACEBOOK` (Messenger DM)
- mime: `image/jpeg`, `image/png`, `image/webp`
- not supported in this phase: video/audio/file/carousel/sticker, inbound image parsing

Channel rules:

- LINE:
  - requires HTTPS `mediaUrl`
  - uses `originalContentUrl = mediaUrl`
  - uses `previewImageUrl = previewUrl` when provided, otherwise fallback to `mediaUrl`
- Facebook Messenger DM:
  - requires HTTPS `mediaUrl`
  - URL-based attachment payload is limited to <= 8MB (enforced pre-enqueue when `fileSizeBytes` is provided)
  - Facebook comment image outbound is not enabled in this phase

Provider-facing URL requirements:

- URL must be externally reachable by LINE/Facebook servers
- localhost/private-network URLs are rejected

Storage URL mode (Supabase Storage):

- `MESSAGE_IMAGE_URL_MODE=public`
  - requires bucket/object access policy that providers can fetch publicly
- `MESSAGE_IMAGE_URL_MODE=signed` (default)
  - uses signed URL with TTL
  - tune TTL with `MESSAGE_IMAGE_SIGNED_URL_TTL_SEC` (default 30 days)

Current preview strategy (Phase 1):

- if preview image is not generated yet, `previewUrl` falls back to `mediaUrl`
- code path is structured so async preview generation can be added later without changing API/outbox/worker pipeline

## Agent Composer (UI)

Composer now supports:

- text only
- image only
- text + image in one compose flow
- explicit outbound channel selection at send time (`LINE` or `Facebook Messenger`)

Backend integration:

- image upload: `POST /api/messages/upload-image`
- send request: `POST /api/messages/send`
- existing API -> outbox -> relay -> worker -> adapter flow is reused

Split-send behavior (text + image):

- UI sends two sequential requests through the existing pipeline:
  1. text
  2. image
- ordering is deterministic and explicit in client logic
- if text succeeds but image fails, UI surfaces partial success clearly

## Production Tuning Runbook (Railway Worker)

- `WORKER_INBOUND_BATCH_SIZE`: increase to 50-100 for burst-heavy inbound channels.
- `WORKER_INBOUND_CONCURRENCY`: start at 8, scale to 16-32 per instance based on CPU and DB latency.
- `WORKER_OUTBOUND_BATCH_SIZE`: start at 15-40 depending on provider SLAs.
- `WORKER_OUTBOUND_CONCURRENCY`: increase carefully to avoid provider rate-limit spikes.
- `WORKER_OUTBOX_BATCH_SIZE`: keep higher than queue batch (50-150) to drain outbox faster than producers.
- `WORKER_POLL_INTERVAL_MS`: lower for latency (100-200), higher for cost (300-800).
- `WORKER_OUTBOX_PROCESSING_TIMEOUT_SECONDS`: set above p99 enqueue+db ack latency to avoid premature reclaim.
- Railway scaling guidance:
  - run at least 2 worker instances for failover
  - scale by observed queue/outbox lag and dead-letter trend, not just CPU
  - if queue lag > 30s sustained, increase worker count and/or batch+concurrency

Validation env templates:

- `env/worker.low.env.template`
- `env/worker.medium.env.template`
- `env/worker.high.env.template`

## Vercel Deployment Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] `npm run build` passes
- [ ] Vercel project root directory is repository root
- [ ] All required server-only env vars are set in Vercel
- [ ] Optional `NEXT_PUBLIC_APP_BASE_URL` set if you want explicit base URL in composer
- [ ] Railway worker is deployed separately with worker env vars
- [ ] Web/API on Vercel and worker on Railway are both healthy after deployment
