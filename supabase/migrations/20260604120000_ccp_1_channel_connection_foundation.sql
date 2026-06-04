-- CCP-1: Channel Connect Platform — connection + credential foundation (additive only).
-- Does not modify channel_settings, worker runtime, or webhook behavior.
-- No production credential backfill in this migration.

begin;

do $$
begin
  create type public.channel_connection_status as enum (
    'DRAFT',
    'AUTHORIZING',
    'CONNECTED',
    'WEBHOOK_CONFIGURED',
    'WEBHOOK_VERIFIED',
    'INBOUND_VERIFIED',
    'OUTBOUND_VERIFIED',
    'READY',
    'ERROR',
    'RECONNECT_REQUIRED',
    'REVOKED'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.channel_credential_state as enum (
    'EMPTY',
    'SET',
    'EXPIRED',
    'REVOKED'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.channel_credential_type as enum (
    'ACCESS_TOKEN',
    'REFRESH_TOKEN',
    'CHANNEL_SECRET',
    'APP_SECRET',
    'VERIFY_TOKEN'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists channel_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  provider channel_type not null,
  status channel_connection_status not null default 'DRAFT',
  provider_account_id text null,
  provider_account_name text null,
  provider_page_id text null,
  provider_ig_account_id text null,
  public_connection_key text not null,
  webhook_endpoint text null,
  webhook_active boolean not null default false,
  last_inbound_verified_at timestamptz null,
  last_outbound_verified_at timestamptz null,
  last_health_check_at timestamptz null,
  last_error_code text null,
  last_error_message_safe text null,
  connected_by uuid null,
  connected_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channel_connections_provider_scope check (
    provider in ('LINE'::channel_type, 'FACEBOOK'::channel_type, 'INSTAGRAM'::channel_type)
  ),
  constraint channel_connections_public_key_format check (
    public_connection_key ~ '^ccp_[A-Za-z0-9_-]{16,128}$'
  ),
  unique (tenant_id, provider),
  unique (public_connection_key)
);

create index if not exists idx_channel_connections_tenant on channel_connections (tenant_id);
create index if not exists idx_channel_connections_tenant_provider on channel_connections (tenant_id, provider);
create index if not exists idx_channel_connections_provider_account on channel_connections (tenant_id, provider, provider_account_id);

create table if not exists channel_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  connection_id uuid not null references channel_connections (id) on delete cascade,
  provider channel_type not null,
  credential_type channel_credential_type not null,
  encrypted_secret_value text not null default '',
  secret_fingerprint text null,
  token_expires_at timestamptz null,
  credential_state channel_credential_state not null default 'EMPTY',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channel_credentials_provider_scope check (
    provider in ('LINE'::channel_type, 'FACEBOOK'::channel_type, 'INSTAGRAM'::channel_type)
  ),
  unique (connection_id, credential_type)
);

create index if not exists idx_channel_credentials_tenant on channel_credentials (tenant_id);
create index if not exists idx_channel_credentials_connection on channel_credentials (connection_id);

notify pgrst, 'reload schema';

commit;
