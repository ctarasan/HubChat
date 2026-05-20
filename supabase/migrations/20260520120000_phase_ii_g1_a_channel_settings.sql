-- Phase II-G1-A: tenant-scoped channel settings (LINE / Facebook / Instagram). Additive only.
-- Runtime still uses env vars until a later phase; no worker/adapter/webhook changes in this migration.

begin;

create table if not exists channel_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  channel channel_type not null,
  enabled boolean not null default false,
  display_name text null,
  config_json jsonb not null default '{}'::jsonb,
  secret_json jsonb not null default '{}'::jsonb,
  secret_fingerprint_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel),
  constraint channel_settings_g1_channel_scope check (
    channel in ('LINE'::channel_type, 'FACEBOOK'::channel_type, 'INSTAGRAM'::channel_type)
  ),
  constraint channel_settings_config_json_object check (jsonb_typeof(config_json) = 'object'),
  constraint channel_settings_secret_json_object check (jsonb_typeof(secret_json) = 'object'),
  constraint channel_settings_secret_fingerprint_json_object check (jsonb_typeof(secret_fingerprint_json) = 'object')
);

create index if not exists idx_channel_settings_tenant on channel_settings (tenant_id);

notify pgrst, 'reload schema';

commit;
