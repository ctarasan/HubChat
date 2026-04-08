# Omnichannel Chat - Phase 1 Architecture (Supabase + Vercel + Worker)

## 1) System Architecture Diagram

```mermaid
flowchart LR
  subgraph Channels
    LINE[LINE]
    FB[Facebook Messenger]
    IG[Instagram]
    TT[TikTok]
    SH[Shopee]
    LZ[Lazada]
  end

  subgraph Vercel["Next.js on Vercel (Interface Layer)"]
    WH[Webhook APIs]
    APP[Unified Inbox UI + Admin]
    API[REST APIs]
  end

  subgraph Worker["Worker Service (Node.js)"]
    CONSUMER[Queue Consumer]
    OUTBOUND[Outbound Dispatcher]
    AUTO[Automation Engine]
    AI[Optional AI Jobs]
  end

  subgraph Supabase["Supabase (Infra Layer)"]
    PG[(PostgreSQL)]
    RT[Realtime]
    ST[Storage]
    AUTH[Auth]
  end

  LINE --> WH
  FB --> WH
  IG --> WH
  TT --> WH
  SH --> WH
  LZ --> WH

  WH --> PG
  WH -->|enqueue| PG
  CONSUMER --> PG
  OUTBOUND --> Channels
  AUTO --> PG
  AI --> PG
  APP <--> API
  API <--> PG
  RT --> APP
  AUTH --> APP
  ST --> APP
```

## 2) Container Architecture Diagram

```mermaid
flowchart TB
  Client[Browser]
  Vercel[Next.js App + API Routes]
  Worker[Worker Container]
  Supabase[(Supabase Postgres/Auth/Storage/Realtime)]
  Ext[External Channel APIs]

  Client <--> Vercel
  Vercel <--> Supabase
  Vercel --> Worker
  Worker <--> Supabase
  Worker <--> Ext
```

## 3) Module / Service Breakdown

- `interfaces` (UI/API/webhook controllers): HTTP contracts, validation, auth.
- `application` (use cases): `ProcessInboundMessage`, `AssignLead`, `SendOutboundMessage`, `UpdateLeadStatus`.
- `domain` (pure business): entities, enums, state transitions, ports.
- `infrastructure` (replaceable adapters): Supabase repositories, queue implementation, channel adapters, AI providers.
- `worker` (async runtime): queue consumer, retry/dead-letter/rate limit/idempotency.

## 4) PostgreSQL Schema

See `supabase/schema.sql`.

## 5) Event Schema

```ts
type DomainEvent<TPayload> = {
  eventId: string;
  tenantId: string;
  eventType:
    | "channel.webhook.received"
    | "message.inbound.normalized"
    | "lead.created"
    | "lead.assigned"
    | "message.outbound.requested"
    | "message.outbound.sent"
    | "message.outbound.failed"
    | "automation.triggered"
    | "ai.job.requested";
  payload: TPayload;
  occurredAt: string;
  idempotencyKey: string;
  traceId?: string;
};
```

## 6) API Design (Phase 1)

- `POST /api/webhook/{channel}`
- `GET /api/leads`
- `GET /api/leads/{id}`
- `PATCH /api/leads/{id}`
- `POST /api/leads/{id}/assign`
- `GET /api/conversations`
- `POST /api/messages/send`
- `GET /api/dashboard/metrics`

All endpoints include `tenant_id` scoping through authenticated context.

## 7) Queue Abstraction Design

```ts
export interface QueuePort {
  enqueue<T>(topic: string, event: T, opts?: { runAt?: Date }): Promise<void>;
  consume<T>(topic: string, handler: (event: T) => Promise<void>): Promise<void>;
}
```

Phase 1 implementation: DB-backed queue table in Postgres.
Phase 2+: swap in Kafka by replacing infrastructure adapter only.

## 8) Inbound Message Sequence

```mermaid
sequenceDiagram
  participant C as Channel
  participant W as Webhook API (Vercel)
  participant DB as Supabase Postgres
  participant Q as Queue
  participant WK as Worker

  C->>W: webhook event
  W->>W: validate signature + parse
  W->>DB: persist raw webhook (idempotent)
  W->>Q: enqueue message.inbound.normalized request
  W-->>C: 200 OK quickly
  WK->>Q: consume event
  WK->>WK: normalize + map lead/conversation
  WK->>DB: upsert lead, conversation, message, activity
  WK->>DB: enqueue optional automation/AI
```

## 9) Outbound Message Sequence

```mermaid
sequenceDiagram
  participant A as Agent UI
  participant API as Messages API
  participant DB as Supabase Postgres
  participant Q as Queue
  participant WK as Worker
  participant CH as Channel API

  A->>API: send message
  API->>DB: create outbound message (PENDING)
  API->>Q: enqueue message.outbound.requested
  API-->>A: 202 Accepted
  WK->>Q: consume outbound event
  WK->>WK: rate limit + idempotency + retry policy
  WK->>CH: sendMessage()
  alt success
    WK->>DB: mark sent + activity log
  else failure
    WK->>DB: increment retry, schedule backoff / dead letter
  end
```

## 10) Phase 1 Deployment Architecture

- Vercel hosts Next.js app + lightweight API/webhook routes.
- Supabase hosts Postgres/Auth/Storage/Realtime.
- Worker service on Railway/Render/Fly/Cloud Run.
- Secret management via Vercel/Supabase/worker env vars.
- Vercel only validates and enqueues; worker does heavy processing.

## 11) Phase 2 Upgrade Path

- Replace DB queue adapter with Kafka adapter (no use case changes).
- Introduce read model/indexing (OpenSearch) via projection workers.
- Split worker into independent services: inbound processor, outbound sender, automation, AI.
- Add OpenTelemetry tracing and centralized logs/metrics.
- Add CDC/event bus for analytics warehouse.

## 12) Codebase Structure

```text
src/
  domain/
    entities.ts
    events.ts
    ports.ts
    services.ts
  application/
    usecases/
      processInboundMessage.ts
      assignLead.ts
      sendOutboundMessage.ts
  infrastructure/
    adapters/
      channels/
        lineAdapter.ts
        messengerAdapter.ts
        instagramAdapter.ts
        tiktokAdapter.ts
        shopeeAdapter.ts
        lazadaAdapter.ts
      queue/
        dbQueue.ts
      repositories/
        supabaseLeadRepository.ts
  interfaces/
    api/
      webhook/
        line.ts
      leads.ts
      messages.ts
      dashboard.ts
  worker/
    main.ts
    outboundWorker.ts
```
