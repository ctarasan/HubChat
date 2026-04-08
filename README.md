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
   - `LINE_CHANNEL_SECRET`
   - `LINE_CHANNEL_ACCESS_TOKEN`
4. Run worker:
   - `npm run dev:worker`
5. Run Next app:
   - `npm run dev`

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
  - `POST /api/messages/send`
- Manager / Admin only:
  - `POST /api/leads/:id/assign`
  - `GET /api/dashboard/metrics`

Role source:

- Primary: `sales_agents.role` by `(tenant_id, email)` where `status = ACTIVE`
- Fallback: Supabase user metadata `app_metadata.role` / `user_metadata.role`

## Notes

- This is Phase 1-first (lean launch). Queue adapter can be swapped for Kafka in Phase 2 without touching use cases.
- Add adapters for Facebook/Instagram/TikTok/Shopee/Lazada by implementing `ChannelAdapter` and registering them in a registry.
- AI features should enqueue jobs and execute in workers; core messaging still works when AI is disabled.
