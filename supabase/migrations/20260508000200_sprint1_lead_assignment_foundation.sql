-- Sprint 1 (B): Lead Assignment foundation (additive, idempotent)
-- NOTE: enum extension moved to:
--   20260508000100_sprint1_lead_status_enum_extension.sql
-- This file assumes 'UNASSIGNED' already exists in lead_status.

-- 2) Leads table hardening for assignment foundation (if leads already exists).
alter table if exists leads
  add column if not exists assigned_by_user_id uuid null references sales_agents(id);
alter table if exists leads
  add column if not exists assigned_at timestamptz null;
alter table if exists leads
  add column if not exists closed_at timestamptz null;

-- Keep existing schemas safe: update default only when leads.status exists.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'leads' and column_name = 'status'
  ) then
    alter table leads alter column status set default 'UNASSIGNED';
  end if;
end $$;

-- 3) Assignment history
create table if not exists lead_assignments (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  lead_id uuid not null references leads(id) on delete cascade,
  from_user_id uuid null references sales_agents(id),
  to_user_id uuid null references sales_agents(id),
  assigned_by_user_id uuid null references sales_agents(id),
  reason text null,
  created_at timestamptz not null default now()
);

-- 4) Lead event log (internal events; no external CDP dispatch in this sprint)
create table if not exists lead_events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  lead_id uuid not null references leads(id) on delete cascade,
  event_name text not null,
  event_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_by_user_id uuid null references sales_agents(id),
  created_at timestamptz not null default now(),
  constraint lead_events_event_name_valid check (
    event_name in (
      'hubchat.lead.created',
      'hubchat.lead.assigned',
      'hubchat.lead.reassigned',
      'hubchat.lead.unassigned',
      'hubchat.lead.closed',
      'hubchat.message.received',
      'hubchat.message.sent',
      'hubchat.message.failed'
    )
  )
);

-- 5) Ensure conversations can reference leads (older deployments safety)
alter table if exists conversations
  add column if not exists lead_id uuid null references leads(id);

create index if not exists idx_conversations_lead_id on conversations (lead_id);

-- 6) Performance indexes for future assignment views
create index if not exists idx_leads_tenant_status_created_desc
  on leads (tenant_id, status, created_at desc);

create index if not exists idx_leads_tenant_assigned_status_updated_desc
  on leads (tenant_id, assigned_sales_id, status, updated_at desc);

create index if not exists idx_lead_assignments_tenant_lead_created_desc
  on lead_assignments (tenant_id, lead_id, created_at desc);

create index if not exists idx_lead_events_tenant_lead_occurred_desc
  on lead_events (tenant_id, lead_id, occurred_at desc);

create index if not exists idx_lead_events_tenant_event_occurred_desc
  on lead_events (tenant_id, event_name, occurred_at desc);

-- 7) Idempotent backfill for conversations that still have NULL lead_id.
-- Strategy:
-- - deterministically create per-conversation fallback lead with external_user_id='conv:<conversation_id>'
-- - update conversations.lead_id only where null
-- - emit hubchat.lead.created event once per backfilled lead
with missing_conv as (
  select
    c.id as conversation_id,
    c.tenant_id,
    c.channel_type,
    coalesce(c.created_at, now()) as conversation_created_at
  from conversations c
  where c.lead_id is null
),
seed_leads as (
  insert into leads (
    tenant_id,
    source_channel,
    external_user_id,
    name,
    phone,
    email,
    status,
    assigned_sales_id,
    assigned_by_user_id,
    assigned_at,
    created_at,
    updated_at
  )
  select
    m.tenant_id,
    m.channel_type,
    'conv:' || m.conversation_id::text,
    null,
    null,
    null,
    'UNASSIGNED',
    null,
    null,
    null,
    m.conversation_created_at,
    now()
  from missing_conv m
  on conflict (tenant_id, source_channel, external_user_id) do update
    set updated_at = excluded.updated_at
  returning id, tenant_id, source_channel, external_user_id
),
conv_to_lead as (
  select
    m.conversation_id,
    l.id as lead_id,
    m.tenant_id
  from missing_conv m
  join leads l
    on l.tenant_id = m.tenant_id
   and l.source_channel = m.channel_type
   and l.external_user_id = 'conv:' || m.conversation_id::text
),
updated_conv as (
  update conversations c
  set lead_id = ctl.lead_id
  from conv_to_lead ctl
  where c.id = ctl.conversation_id
    and c.lead_id is null
  returning c.id, c.tenant_id, c.lead_id
)
insert into lead_events (tenant_id, lead_id, event_name, event_payload, occurred_at, created_at)
select
  uc.tenant_id,
  uc.lead_id,
  'hubchat.lead.created',
  jsonb_build_object(
    'source', 'migration.backfill.conversations_without_lead',
    'conversationId', uc.id
  ),
  now(),
  now()
from updated_conv uc
where not exists (
  select 1
  from lead_events e
  where e.tenant_id = uc.tenant_id
    and e.lead_id = uc.lead_id
    and e.event_name = 'hubchat.lead.created'
);
