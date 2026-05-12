-- Phase II-A1: backward-compatible conversation foundation for Team Inbox / SLA / audit.
-- Additive only: new columns (defaults), conversation_events table, indexes.
-- Does not change enums, queue schema, assign endpoint, or application behavior.

begin;

-- ---------------------------------------------------------------------------
-- conversations: Team Inbox / SLA foundation (safe defaults)
-- ---------------------------------------------------------------------------
alter table conversations add column if not exists assignment_status text not null default 'UNASSIGNED';
alter table conversations add column if not exists priority text not null default 'NORMAL';
alter table conversations add column if not exists first_response_at timestamptz null;
alter table conversations add column if not exists last_customer_message_at timestamptz null;
alter table conversations add column if not exists last_agent_message_at timestamptz null;
alter table conversations add column if not exists sla_due_at timestamptz null;
alter table conversations add column if not exists closed_at timestamptz null;

alter table conversations drop constraint if exists conversations_assignment_status_valid;
alter table conversations add constraint conversations_assignment_status_valid check (
  assignment_status in ('UNASSIGNED', 'ASSIGNED', 'REASSIGNED', 'UNASSIGNED_AGAIN')
);

alter table conversations drop constraint if exists conversations_priority_valid;
alter table conversations add constraint conversations_priority_valid check (
  priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')
);

-- ---------------------------------------------------------------------------
-- conversation_events: conversation-level audit (Team Inbox actions later)
-- ---------------------------------------------------------------------------
create table if not exists conversation_events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants (id),
  conversation_id uuid not null references conversations (id),
  lead_id uuid null references leads (id) on delete set null,
  actor_sales_agent_id uuid null references sales_agents (id) on delete set null,
  actor_auth_user_id uuid null,
  event_type text not null,
  old_value jsonb null,
  new_value jsonb null,
  metadata_json jsonb not null default '{}'::jsonb,
  note text null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes for Team Inbox / event queries (IF NOT EXISTS)
-- ---------------------------------------------------------------------------
create index if not exists idx_conv_tii_tenant_assigned_agent_last_msg
  on conversations (tenant_id, assigned_agent_id, last_message_at desc);

-- tenant_id + status + last_message_at already covered by idx_conv_tenant_status_last_id

create index if not exists idx_conv_tii_tenant_assignment_status_last_msg
  on conversations (tenant_id, assignment_status, last_message_at desc);

create index if not exists idx_conv_tii_tenant_priority_last_msg
  on conversations (tenant_id, priority, last_message_at desc);

create index if not exists idx_conv_tii_tenant_lead
  on conversations (tenant_id, lead_id);

create index if not exists idx_conversation_events_tenant_conv_created
  on conversation_events (tenant_id, conversation_id, created_at desc);

create index if not exists idx_conversation_events_tenant_type_created
  on conversation_events (tenant_id, event_type, created_at desc);

create index if not exists idx_conversation_events_tenant_actor_agent_created
  on conversation_events (tenant_id, actor_sales_agent_id, created_at desc);

commit;
