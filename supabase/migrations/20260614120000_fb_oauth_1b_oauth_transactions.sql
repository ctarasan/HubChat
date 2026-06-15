-- FB-OAUTH-1B: OAuth transaction persistence for Facebook Channel Connect (additive only).

begin;

do $$
begin
  create type public.oauth_transaction_status as enum (
    'PENDING',
    'CALLBACK_RECEIVED',
    'PAGES_READY',
    'COMPLETED',
    'FAILED',
    'EXPIRED'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists oauth_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  connection_id uuid not null references channel_connections (id) on delete cascade,
  provider channel_type not null default 'FACEBOOK'::channel_type,
  state_hash text not null,
  resume_session_hash text null,
  status oauth_transaction_status not null default 'PENDING',
  initiated_by_auth_user_id text not null,
  initiated_by_sales_agent_id uuid not null,
  encrypted_user_token text null,
  user_token_expires_at timestamptz null,
  page_candidates_json jsonb null,
  selected_page_id text null,
  error_category text null,
  callback_received_at timestamptz null,
  consumed_at timestamptz null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint oauth_transactions_provider_scope check (
    provider in ('FACEBOOK'::channel_type)
  )
);

create unique index if not exists idx_oauth_transactions_state_hash_active
  on oauth_transactions (state_hash)
  where consumed_at is null;

create unique index if not exists idx_oauth_transactions_resume_session_hash_active
  on oauth_transactions (resume_session_hash)
  where consumed_at is null and resume_session_hash is not null;

create index if not exists idx_oauth_transactions_tenant on oauth_transactions (tenant_id);
create index if not exists idx_oauth_transactions_connection on oauth_transactions (connection_id);
create index if not exists idx_oauth_transactions_expires_at on oauth_transactions (expires_at);

notify pgrst, 'reload schema';

commit;
