create extension if not exists "uuid-ossp";

create type channel_type as enum ('LINE','FACEBOOK','INSTAGRAM','TIKTOK','SHOPEE','LAZADA');
create type lead_status as enum ('NEW','ASSIGNED','CONTACTED','QUALIFIED','PROPOSAL_SENT','NEGOTIATION','WON','LOST');
create type conversation_status as enum ('OPEN','PENDING','CLOSED');
create type message_direction as enum ('INBOUND','OUTBOUND');
create type sender_type as enum ('CUSTOMER','SALES','SYSTEM');
create type sales_role as enum ('SALES','MANAGER','ADMIN');
create type sales_status as enum ('ACTIVE','INACTIVE');
create type activity_type as enum ('MESSAGE_SENT','MESSAGE_RECEIVED','STATUS_CHANGED','ASSIGNED','NOTE_ADDED');
create type queue_status as enum ('PENDING','PROCESSING','DONE','FAILED','DEAD_LETTER');

create table tenants (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now()
);

create table sales_agents (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  email text not null,
  role sales_role not null default 'SALES',
  status sales_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create table channel_accounts (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  channel channel_type not null,
  external_account_id text not null,
  credential_ref text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, channel, external_account_id)
);

create table leads (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  source_channel channel_type not null,
  external_user_id text not null,
  name text null,
  phone text null,
  email text null,
  status lead_status not null default 'NEW',
  assigned_sales_id uuid null references sales_agents(id),
  lead_score int null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_contact_at timestamptz null,
  unique (tenant_id, source_channel, external_user_id)
);

create table customers (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  lead_id uuid null references leads(id),
  external_user_id text null,
  name text null,
  phone text null,
  email text null,
  created_at timestamptz not null default now()
);

create table conversations (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  lead_id uuid not null references leads(id),
  channel_type channel_type not null,
  channel_thread_id text not null,
  status conversation_status not null default 'OPEN',
  assigned_agent_id uuid null references sales_agents(id),
  last_message_at timestamptz not null default now(),
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel_type, channel_thread_id)
);

create table messages (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  conversation_id uuid not null references conversations(id),
  channel_type channel_type not null,
  external_message_id text null,
  direction message_direction not null,
  sender_type sender_type not null,
  sender_id text null,
  content text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, channel_type, external_message_id)
);

create table activity_logs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  lead_id uuid not null references leads(id),
  type activity_type not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table automation_rules (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  trigger_type text not null,
  conditions_json jsonb not null default '{}'::jsonb,
  actions_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table webhook_events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  channel_type channel_type not null,
  external_event_id text not null,
  idempotency_key text not null,
  payload_json jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz null,
  unique (tenant_id, channel_type, idempotency_key)
);

create table queue_jobs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  topic text not null,
  payload_json jsonb not null,
  status queue_status not null default 'PENDING',
  available_at timestamptz not null default now(),
  retry_count int not null default 0,
  max_retries int not null default 10,
  last_error text null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, topic, idempotency_key)
);

create index idx_leads_tenant_status on leads (tenant_id, status);
create index idx_leads_assigned on leads (tenant_id, assigned_sales_id, status);
create index idx_conv_tenant_last_message on conversations (tenant_id, last_message_at desc);
create index idx_messages_conv_created on messages (conversation_id, created_at asc);
create index idx_activity_lead_created on activity_logs (lead_id, created_at desc);
create index idx_jobs_polling on queue_jobs (status, available_at, topic);

alter table leads enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table activity_logs enable row level security;

create or replace function claim_queue_job(p_topic text)
returns table (
  id uuid,
  tenant_id uuid,
  payload_json jsonb,
  retry_count int,
  max_retries int
)
language plpgsql
as $$
begin
  return query
  with cte as (
    select q.id
    from queue_jobs q
    where q.topic = p_topic
      and q.status = 'PENDING'
      and q.available_at <= now()
    order by q.available_at asc
    for update skip locked
    limit 1
  )
  update queue_jobs q
  set status = 'PROCESSING', updated_at = now()
  from cte
  where q.id = cte.id
  returning q.id, q.tenant_id, q.payload_json, q.retry_count, q.max_retries;
end;
$$;
