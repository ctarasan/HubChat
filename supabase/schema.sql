create extension if not exists "uuid-ossp";

do $$ begin
  create type channel_type as enum ('LINE','FACEBOOK','INSTAGRAM','TIKTOK','SHOPEE','LAZADA');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type lead_status as enum ('NEW','ASSIGNED','CONTACTED','QUALIFIED','PROPOSAL_SENT','NEGOTIATION','WON','LOST');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type conversation_status as enum ('OPEN','PENDING','CLOSED');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type message_direction as enum ('INBOUND','OUTBOUND');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type sender_type as enum ('CUSTOMER','SALES','SYSTEM');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type sales_role as enum ('SALES','MANAGER','ADMIN');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type sales_status as enum ('ACTIVE','INACTIVE');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type activity_type as enum ('MESSAGE_SENT','MESSAGE_RECEIVED','STATUS_CHANGED','ASSIGNED','NOTE_ADDED');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type queue_status as enum ('PENDING','PROCESSING','DONE','FAILED','DEAD_LETTER');
exception when duplicate_object then null;
end $$;

create table if not exists tenants (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists sales_agents (
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

create table if not exists channel_accounts (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  channel channel_type not null,
  external_account_id text not null,
  display_name text null,
  metadata_json jsonb not null default '{}'::jsonb,
  credential_ref text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel, external_account_id)
);

create table if not exists leads (
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

create table if not exists customers (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  lead_id uuid null references leads(id),
  external_user_id text null,
  name text null,
  phone text null,
  email text null,
  created_at timestamptz not null default now()
);

create table if not exists contacts (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  display_name text null,
  phone text null,
  email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists contact_identities (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  contact_id uuid not null references contacts(id),
  channel_type channel_type not null,
  external_user_id text not null,
  display_name text null,
  profile_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel_type, external_user_id)
);

create table if not exists conversations (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  lead_id uuid not null references leads(id),
  contact_id uuid null references contacts(id),
  channel_account_id uuid null references channel_accounts(id),
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

create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  conversation_id uuid not null references conversations(id),
  channel_type channel_type not null,
  external_message_id text null,
  message_type text not null default 'TEXT',
  direction message_direction not null,
  sender_type sender_type not null,
  sender_id text null,
  content text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, channel_type, external_message_id)
);

create table if not exists message_events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  message_id uuid not null references messages(id),
  event_type text not null,
  occurred_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb
);

create table if not exists activity_logs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  lead_id uuid not null references leads(id),
  type activity_type not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists automation_rules (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  trigger_type text not null,
  conditions_json jsonb not null default '{}'::jsonb,
  actions_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists webhook_events (
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

create table if not exists queue_jobs (
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

alter table channel_accounts add column if not exists display_name text null;
alter table channel_accounts add column if not exists metadata_json jsonb not null default '{}'::jsonb;
alter table channel_accounts add column if not exists is_active boolean not null default true;
alter table channel_accounts add column if not exists updated_at timestamptz not null default now();

alter table conversations add column if not exists contact_id uuid null references contacts(id);
alter table conversations add column if not exists channel_account_id uuid null references channel_accounts(id);

alter table messages add column if not exists message_type text not null default 'TEXT';
alter table messages add column if not exists raw_payload jsonb not null default '{}'::jsonb;

create index if not exists idx_leads_tenant_status on leads (tenant_id, status);
create index if not exists idx_leads_assigned on leads (tenant_id, assigned_sales_id, status);
create index if not exists idx_channel_accounts_lookup on channel_accounts (tenant_id, channel, is_active);
create index if not exists idx_contact_identities_lookup on contact_identities (tenant_id, channel_type, external_user_id);
create index if not exists idx_conv_tenant_last_message on conversations (tenant_id, last_message_at desc);
create index if not exists idx_conv_contact_last_message on conversations (contact_id, last_message_at desc);
create index if not exists idx_messages_conv_created on messages (conversation_id, created_at asc);
create index if not exists idx_messages_channel_created on messages (channel_type, created_at desc);
create index if not exists idx_activity_lead_created on activity_logs (lead_id, created_at desc);
create index if not exists idx_message_events_message_occurred on message_events (message_id, occurred_at desc);
create index if not exists idx_jobs_polling on queue_jobs (status, available_at, topic);

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

create or replace view v_omni_messages_daily as
select
  tenant_id,
  date_trunc('day', created_at) as day,
  channel_type,
  direction,
  count(*)::bigint as message_count
from messages
group by tenant_id, date_trunc('day', created_at), channel_type, direction;

create or replace view v_omni_contacts_by_channel as
select
  tenant_id,
  channel_type,
  count(distinct contact_id)::bigint as unique_contacts
from contact_identities
group by tenant_id, channel_type;

create or replace view v_omni_open_conversations as
select
  tenant_id,
  channel_type,
  count(*)::bigint as open_conversations
from conversations
where status <> 'CLOSED'
group by tenant_id, channel_type;
