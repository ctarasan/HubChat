-- IG-AUTH-2A: Instagram OAuth credential schema foundation (additive only).
-- Does not modify channel_settings, worker runtime, resolver, or webhook behavior.
-- No production credential backfill in this migration.

begin;

do $$
begin
  create type public.instagram_oauth_auth_family as enum (
    'LEGACY_FACEBOOK_PAGE',
    'INSTAGRAM_BUSINESS_LOGIN'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.instagram_oauth_credential_status as enum (
    'PENDING',
    'ACTIVE',
    'TOKEN_EXPIRING',
    'REFRESHING',
    'REAUTH_REQUIRED',
    'REVOKED',
    'DISCONNECTED',
    'ERROR'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.instagram_oauth_refresh_status as enum (
    'NEVER',
    'SUCCESS',
    'RETRYABLE_FAILURE',
    'TERMINAL_FAILURE'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.instagram_oauth_connection_health_status as enum (
    'UNKNOWN',
    'HEALTHY',
    'DEGRADED',
    'UNHEALTHY'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists instagram_oauth_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  channel_connection_id uuid not null references channel_connections (id) on delete cascade,
  provider channel_type not null default 'INSTAGRAM'::channel_type,
  auth_family instagram_oauth_auth_family not null,
  credential_status instagram_oauth_credential_status not null default 'PENDING',
  access_token_ciphertext text not null default '',
  token_type text not null default 'bearer',
  token_expires_at timestamptz null,
  refresh_eligible_at timestamptz null,
  last_refresh_at timestamptz null,
  last_refresh_status instagram_oauth_refresh_status not null default 'NEVER',
  last_refresh_error_code text null,
  granted_scopes text[] null,
  provider_instagram_account_id text null,
  provider_user_id text null,
  connected_by_sales_agent_id uuid null,
  connected_at timestamptz null,
  revoked_at timestamptz null,
  reauth_required_at timestamptz null,
  connection_health_status instagram_oauth_connection_health_status not null default 'UNKNOWN',
  credential_version integer not null default 1,
  secret_fingerprint text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_oauth_credentials_provider_scope check (
    provider = 'INSTAGRAM'::channel_type
  ),
  constraint instagram_oauth_credentials_version_positive check (credential_version >= 1),
  constraint instagram_oauth_credentials_token_type_scope check (
    token_type in ('bearer')
  )
);

create index if not exists idx_instagram_oauth_credentials_tenant
  on instagram_oauth_credentials (tenant_id);

create index if not exists idx_instagram_oauth_credentials_tenant_connection
  on instagram_oauth_credentials (tenant_id, channel_connection_id);

create index if not exists idx_instagram_oauth_credentials_connection
  on instagram_oauth_credentials (channel_connection_id);

-- One non-terminal OAuth credential row per connection (allows historical REVOKED/DISCONNECTED/ERROR rows).
create unique index if not exists idx_instagram_oauth_credentials_active_connection
  on instagram_oauth_credentials (channel_connection_id)
  where credential_status in (
    'PENDING',
    'ACTIVE',
    'TOKEN_EXPIRING',
    'REFRESHING',
    'REAUTH_REQUIRED'
  );

-- Prevent the same Instagram Professional Account from being actively bound on multiple tenants.
create unique index if not exists idx_instagram_oauth_credentials_active_ig_account
  on instagram_oauth_credentials (provider_instagram_account_id)
  where provider_instagram_account_id is not null
    and credential_status in (
      'PENDING',
      'ACTIVE',
      'TOKEN_EXPIRING',
      'REFRESHING',
      'REAUTH_REQUIRED'
    );

notify pgrst, 'reload schema';

commit;

-- Rollback notes (manual, not auto-applied):
-- drop table if exists instagram_oauth_credentials;
-- drop type if exists public.instagram_oauth_connection_health_status;
-- drop type if exists public.instagram_oauth_refresh_status;
-- drop type if exists public.instagram_oauth_credential_status;
-- drop type if exists public.instagram_oauth_auth_family;
