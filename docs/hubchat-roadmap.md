# HubChat Roadmap

This roadmap documents HubChat as an omnichannel conversation and lead assignment platform, with phased delivery and phased scalability.

## Current Completed Status

- Core architecture is in place: API/Webhook -> queue/outbox -> worker -> provider adapter.
- LINE and Facebook conversation flows are established.
- Instagram DM supports text and image (JPEG/PNG/WEBP).
- HubChat remains conversation + lead assignment focused, not a full CDP or OMS.

## Next Workstreams

1. Phase 1: Lead Assignment Foundation
2. Phase 2: CDP-ready Data/Event Structure (no active SmartKorp CDP sync yet)
3. Phase 3: Marketplace Connector Framework
4. Phase 4: Shopee Chat MVP
5. Phase 5: Lazada Chat MVP
6. Phase 6: TikTok Shop Customer Service MVP
7. Phase 7: WeChat later only if customer demand exists

## Phase 1: Lead Assignment Foundation

### Scope

- One active owner per lead.
- Assignment lifecycle: assign, reassign, unassign, close, reopen.
- Owner-only reply enforcement in backend.
- Role-aware visibility for Admin/Manager/Sales/Viewer.
- Assignment audit trail.

### Out of Scope

- CDP sync pipelines.
- Marketplace channel implementation.
- AI scoring and automation workflows.

### Suggested Data Model

- `leads`: owner, status, assignment timestamps.
- `lead_assignment_history` (or equivalent audit table): actor, previous owner, new owner, timestamp, reason.
- `sales_agents`/role mapping for authorization checks.

### Definition of Done

1. New leads start `UNASSIGNED`.
2. Admin/Manager can assign and reassign.
3. Sales can only view/reply assigned leads.
4. Backend enforces owner-only reply.
5. Audit history captures assignment transitions.
6. Existing LINE/Facebook/Instagram messaging remains stable.

## Phase 2: CDP-ready Data/Event Structure

### Scope

- Prepare internal schema for future SmartKorp CDP integration.
- Add lead/contact identity/event structures.
- Emit internal events for lead and message lifecycle.
- Keep all CDP-related fields nullable and non-blocking.

### Out of Scope

- Active SmartKorp CDP sync implementation.
- Real-time CDP streaming worker.
- Profile merge/unmerge and segmentation engine.

### Suggested Data Model

- `contact_identities` (channel-specific identity mapping).
- `lead_events` (internal event log).
- Optional nullable fields:
  - `smartkorp_customer_id`
  - `cdp_sync_status`
  - `cdp_synced_at`

### Definition of Done

1. Required entities/tables exist with backward-compatible migration.
2. Internal event model covers lead/message lifecycle.
3. Existing messaging features remain unchanged.
4. No active SmartKorp CDP sync code path exists.

## Phase 3: Marketplace Connector Framework

### Scope

- Reusable connector foundation for Thai marketplaces.
- Standard adapter interface and capability matrix.
- Provider account and credential model.
- Queue/outbox + worker execution model for marketplace operations.
- Placeholder order context model.

### Out of Scope

- Direct implementation of each marketplace channel.
- Stock, product, refund, or logistics management.

### Suggested Data Model

- `provider_accounts`
- `provider_credentials` (securely stored references)
- `channel_capabilities`
- `marketplace_threads` / mapping to HubChat conversations
- `order_context_snapshots` (placeholder)

### Definition of Done

1. New connectors can plug into shared adapter contract.
2. Capability matrix controls supported features per channel.
3. Retry/rate-limit pattern is standardized.
4. Architecture aligns with API -> queue/outbox -> worker -> adapter.

## Phase 4: Shopee Chat MVP

### Scope

- Connect Shopee shop account.
- Receive buyer chat text.
- Send text reply.
- Optional image support only when API/permission allows.
- Map identities to `contact_identities`.
- Basic order context display when available.

### Out of Scope

- Inventory sync, product catalog management, refund/logistics workflows.
- Full order management lifecycle.
- CDP sync.

### Suggested Data Model

- Shopee provider account linkage and token metadata.
- Buyer/shop identity mapping to contact identities.
- Minimal order context snapshot fields.

### Definition of Done

1. Stable inbound/outbound text flow.
2. Lead assignment and owner-only reply rules enforced.
3. Errors/retries/rate limits are handled safely.
4. Core dashboard flows remain responsive.

## Phase 5: Lazada Chat MVP

### Scope

- Same MVP pattern as Shopee on Lazada APIs.
- Text-first support with optional image if feasible.

### Out of Scope

- Non-chat marketplace operations (inventory/refund/logistics).
- CDP sync and advanced automation.

### Suggested Data Model

- Lazada provider account credentials and identity mapping.
- Thread/order context alignment with existing connector schema.

### Definition of Done

1. Reuses marketplace connector framework without special-case rewrites.
2. Stable inbound/outbound text and owner enforcement.
3. Monitoring and retry behavior meets baseline reliability.

## Phase 6: TikTok Shop Customer Service MVP

### Scope

- Customer-service chat support for TikTok Shop.
- Text-first, image optional based on provider support.
- Identity mapping and assignment integration.

### Out of Scope

- Marketing automation, creator workflow, campaign tooling.
- Full commerce backoffice capabilities.

### Suggested Data Model

- TikTok provider account and thread identity mapping.
- Standardized contact identity + event storage.

### Definition of Done

1. Text support works end-to-end with assignment rules.
2. Connector follows shared adapter and worker pattern.
3. Reliability and observability meet baseline checklists.

## Phase 7: WeChat Later (Demand-driven)

### Scope

- Implement only when clear customer demand and business priority are confirmed.

### Out of Scope

- Proactive implementation before roadmap priorities are complete.

### Suggested Data Model

- Reuse marketplace/provider account + adapter abstractions where applicable.
- Add WeChat-specific identity fields only when required.

### Definition of Done

1. Demand and priority are explicitly approved.
2. Lead Assignment + CDP-ready structure remain stable.
3. WeChat integration reuses existing scalable pattern.

## Global Guardrails

- Do not implement active SmartKorp CDP sync unless explicitly requested.
- Do not implement Shopee/Lazada/TikTok/WeChat before Lead Assignment and CDP-ready structure are stable.
- New channels must use API -> queue/outbox -> worker -> provider adapter.
- Preserve phased scalability toward approximately 5,000 concurrent users.
