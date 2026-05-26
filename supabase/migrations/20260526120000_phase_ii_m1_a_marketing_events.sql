-- Phase II-M1-A: normalized marketing_events feed (CDP / automation foundation).
-- Additive only. No changes to queue, worker topics, or existing tables.

begin;

create table if not exists marketing_events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants (id),
  lead_id uuid null references leads (id) on delete set null,
  conversation_id uuid null references conversations (id) on delete set null,
  channel text null,
  event_type text not null,
  occurred_at timestamptz not null,
  actor_type text not null,
  actor_user_id uuid null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table marketing_events drop constraint if exists marketing_events_actor_type_valid;
alter table marketing_events add constraint marketing_events_actor_type_valid check (
  actor_type in ('SYSTEM', 'CUSTOMER', 'AGENT')
);

alter table marketing_events drop constraint if exists marketing_events_event_type_valid;
alter table marketing_events add constraint marketing_events_event_type_valid check (
  event_type in (
    'LEAD_CREATED',
    'LEAD_STATUS_CHANGED',
    'CONVERSATION_CREATED',
    'CONVERSATION_STATUS_CHANGED',
    'CUSTOMER_MESSAGE_RECEIVED',
    'AGENT_MESSAGE_SENT',
    'FOLLOW_UP_SCHEDULED',
    'FOLLOW_UP_CLEARED',
    'SLA_DUE_SET',
    'SLA_CLEARED'
  )
);

create index if not exists idx_marketing_events_tenant_occurred
  on marketing_events (tenant_id, occurred_at desc);

create index if not exists idx_marketing_events_tenant_lead_occurred
  on marketing_events (tenant_id, lead_id, occurred_at desc)
  where lead_id is not null;

create index if not exists idx_marketing_events_tenant_conv_occurred
  on marketing_events (tenant_id, conversation_id, occurred_at desc)
  where conversation_id is not null;

create index if not exists idx_marketing_events_tenant_type_occurred
  on marketing_events (tenant_id, event_type, occurred_at desc);

alter table marketing_events enable row level security;

commit;
