-- META-CRED-1C: Shared Meta Page credential schema foundation (additive only).
-- Does not modify channel_settings, worker runtime, resolver, webhook, or legacy credential paths.
-- No production credential backfill in this migration.

begin;

do $$
begin
  create type public.meta_page_credential_family as enum (
    'META_PAGE_FACEBOOK_LOGIN'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.meta_page_credential_status as enum (
    'PENDING',
    'ACTIVE',
    'ERROR',
    'REVOKED'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.meta_page_binding_status as enum (
    'PENDING',
    'ACTIVE',
    'DISABLED',
    'ERROR'
  );
exception
  when duplicate_object then null;
end $$;

-- Composite parent key for tenant-scoped connection ownership enforcement.
create unique index if not exists idx_channel_connections_tenant_id
  on channel_connections (tenant_id, id);

create table if not exists meta_page_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  credential_family meta_page_credential_family not null,
  provider_app_id text not null,
  facebook_page_id text not null,
  instagram_professional_account_id text null,
  encrypted_access_token text not null default '',
  token_fingerprint text not null default '',
  encryption_format_version text not null default 'v1',
  key_version smallint not null default 1,
  credential_version integer not null default 1,
  status meta_page_credential_status not null default 'PENDING',
  verified_at timestamptz null,
  last_verified_at timestamptz null,
  last_error_sanitized text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_page_credentials_version_positive check (credential_version >= 1),
  constraint meta_page_credentials_family_scope check (
    credential_family = 'META_PAGE_FACEBOOK_LOGIN'::meta_page_credential_family
  ),
  constraint meta_page_credentials_active_requires_verified check (
    status <> 'ACTIVE'::meta_page_credential_status
    or verified_at is not null
  ),
  constraint meta_page_credentials_active_requires_page_id check (
    status <> 'ACTIVE'::meta_page_credential_status
    or length(btrim(facebook_page_id)) > 0
  ),
  constraint meta_page_credentials_active_ciphertext_required check (
    status <> 'ACTIVE'::meta_page_credential_status
    or length(btrim(encrypted_access_token)) > 0
  ),
  constraint meta_page_credentials_active_fingerprint_required check (
    status <> 'ACTIVE'::meta_page_credential_status
    or length(btrim(token_fingerprint)) > 0
  )
);

create unique index if not exists idx_meta_page_credentials_tenant_id
  on meta_page_credentials (tenant_id, id);

create unique index if not exists idx_meta_page_credentials_active_tenant
  on meta_page_credentials (tenant_id)
  where status = 'ACTIVE'::meta_page_credential_status;

create unique index if not exists idx_meta_page_credentials_active_page
  on meta_page_credentials (tenant_id, facebook_page_id)
  where status in (
    'ACTIVE'::meta_page_credential_status,
    'ERROR'::meta_page_credential_status
  );

create index if not exists idx_meta_page_credentials_tenant
  on meta_page_credentials (tenant_id);

create table if not exists meta_page_credential_bindings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  credential_id uuid not null,
  channel_connection_id uuid not null,
  channel_type channel_type not null,
  binding_status meta_page_binding_status not null default 'PENDING',
  credential_version integer not null,
  activated_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_page_bindings_channel_type_scope check (
    channel_type in ('FACEBOOK'::channel_type, 'INSTAGRAM'::channel_type)
  ),
  constraint meta_page_bindings_version_positive check (credential_version >= 1),
  constraint meta_page_bindings_tenant_credential_fk foreign key (tenant_id, credential_id)
    references meta_page_credentials (tenant_id, id) on delete restrict,
  constraint meta_page_bindings_tenant_connection_fk foreign key (tenant_id, channel_connection_id)
    references channel_connections (tenant_id, id) on delete cascade,
  constraint meta_page_bindings_active_requires_activated_at check (
    binding_status <> 'ACTIVE'::meta_page_binding_status
    or activated_at is not null
  )
);

create unique index if not exists idx_meta_page_bindings_active_connection
  on meta_page_credential_bindings (tenant_id, channel_connection_id)
  where binding_status = 'ACTIVE'::meta_page_binding_status;

create unique index if not exists idx_meta_page_bindings_active_channel_per_credential
  on meta_page_credential_bindings (tenant_id, credential_id, channel_type)
  where binding_status = 'ACTIVE'::meta_page_binding_status;

create index if not exists idx_meta_page_bindings_tenant_credential
  on meta_page_credential_bindings (tenant_id, credential_id);

create index if not exists idx_meta_page_bindings_tenant_connection
  on meta_page_credential_bindings (tenant_id, channel_connection_id);

alter table meta_page_credentials enable row level security;
alter table meta_page_credential_bindings enable row level security;

notify pgrst, 'reload schema';

commit;

-- Rollback notes (manual, not auto-applied):
-- drop table if exists meta_page_credential_bindings;
-- drop table if exists meta_page_credentials;
-- drop type if exists public.meta_page_binding_status;
-- drop type if exists public.meta_page_credential_status;
-- drop type if exists public.meta_page_credential_family;
