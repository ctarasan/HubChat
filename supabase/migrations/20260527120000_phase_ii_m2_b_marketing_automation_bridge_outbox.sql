-- Phase II-M2-B: dedicated marketing automation bridge outbox (not outbox_events / queue_jobs).
-- Additive only. No worker or external CDP delivery in this migration.

begin;

do $$ begin
  create type marketing_automation_bridge_outbox_status as enum (
    'PENDING',
    'PROCESSING',
    'SENT',
    'FAILED',
    'DEAD_LETTER'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists marketing_automation_bridge_outbox (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants (id),
  marketing_event_id uuid not null references marketing_events (id),
  event_type text not null,
  payload_json jsonb not null,
  schema_version text not null default '1',
  status marketing_automation_bridge_outbox_status not null default 'PENDING',
  available_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  max_attempts integer not null default 25,
  last_error text null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz null,
  constraint marketing_automation_bridge_outbox_attempt_count_nonneg check (attempt_count >= 0),
  constraint marketing_automation_bridge_outbox_max_attempts_positive check (max_attempts > 0),
  constraint marketing_automation_bridge_outbox_payload_json_object check (jsonb_typeof(payload_json) = 'object'),
  constraint marketing_automation_bridge_outbox_tenant_marketing_event_unique unique (tenant_id, marketing_event_id),
  constraint marketing_automation_bridge_outbox_tenant_idempotency_unique unique (tenant_id, idempotency_key)
);

create index if not exists idx_marketing_automation_bridge_outbox_status_available
  on marketing_automation_bridge_outbox (status, available_at);

alter table marketing_automation_bridge_outbox enable row level security;

create or replace function claim_marketing_automation_bridge_outbox(
  p_limit int default 50,
  p_processing_timeout_seconds int default 120
)
returns table (
  id uuid,
  tenant_id uuid,
  marketing_event_id uuid,
  event_type text,
  payload_json jsonb,
  schema_version text,
  status marketing_automation_bridge_outbox_status,
  available_at timestamptz,
  attempt_count int,
  max_attempts int,
  last_error text,
  idempotency_key text,
  created_at timestamptz,
  updated_at timestamptz,
  sent_at timestamptz
)
language plpgsql
as $$
begin
  return query
  with cte as (
    select o.id
    from marketing_automation_bridge_outbox o
    where o.available_at <= now()
      and (
        o.status = 'PENDING'
        or (
          o.status = 'PROCESSING'
          and o.updated_at <= now() - make_interval(secs => greatest(1, p_processing_timeout_seconds))
        )
      )
    order by o.available_at asc
    for update skip locked
    limit greatest(1, least(200, p_limit))
  )
  update marketing_automation_bridge_outbox o
  set status = 'PROCESSING',
      attempt_count = o.attempt_count + 1,
      updated_at = now()
  from cte
  where o.id = cte.id
  returning
    o.id,
    o.tenant_id,
    o.marketing_event_id,
    o.event_type,
    o.payload_json,
    o.schema_version,
    o.status,
    o.available_at,
    o.attempt_count,
    o.max_attempts,
    o.last_error,
    o.idempotency_key,
    o.created_at,
    o.updated_at,
    o.sent_at;
end;
$$;

commit;
