-- IG-AUTH-2C: Instagram OAuth state persistence for Business Login connect flow (additive only).

begin;

do $$
begin
  create type public.instagram_oauth_state_status as enum (
    'PENDING',
    'CLAIMED',
    'CONSUMED',
    'FAILED'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists instagram_oauth_states (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  channel_connection_id uuid not null,
  provider channel_type not null default 'INSTAGRAM'::channel_type,
  state_hash text not null,
  return_destination text not null default 'CHANNEL_SETTINGS',
  requested_scopes text[] not null,
  status instagram_oauth_state_status not null default 'PENDING',
  initiated_by_auth_user_id text not null,
  initiated_by_sales_agent_id uuid not null,
  failure_code text null,
  claimed_at timestamptz null,
  consumed_at timestamptz null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_oauth_states_provider_scope check (
    provider = 'INSTAGRAM'::channel_type
  ),
  constraint instagram_oauth_states_return_destination_scope check (
    return_destination in ('CHANNEL_SETTINGS')
  ),
  constraint instagram_oauth_states_tenant_connection_fk foreign key (tenant_id, channel_connection_id)
    references channel_connections (tenant_id, id) on delete cascade,
  constraint instagram_oauth_states_claim_timestamps check (
    (claimed_at is null and status = 'PENDING')
    or (claimed_at is not null and status in ('CLAIMED', 'CONSUMED', 'FAILED'))
  ),
  constraint instagram_oauth_states_consumed_timestamps check (
    (consumed_at is null and status in ('PENDING', 'CLAIMED'))
    or (consumed_at is not null and status in ('CONSUMED', 'FAILED'))
  )
);

create unique index if not exists idx_instagram_oauth_states_state_hash
  on instagram_oauth_states (state_hash);

create index if not exists idx_instagram_oauth_states_tenant
  on instagram_oauth_states (tenant_id);

create index if not exists idx_instagram_oauth_states_connection
  on instagram_oauth_states (tenant_id, channel_connection_id);

create index if not exists idx_instagram_oauth_states_expires_at
  on instagram_oauth_states (expires_at);

notify pgrst, 'reload schema';

commit;
