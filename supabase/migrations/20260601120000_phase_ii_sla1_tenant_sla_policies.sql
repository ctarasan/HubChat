-- Phase II SLA-1: tenant-scoped configurable SLA policy foundation (storage only; no runtime wiring).
-- Safe for deployed schemas without tenants table: tenant_id is UUID primary key, no FK to tenants(id).

begin;

create table if not exists tenant_sla_policies (
  tenant_id uuid primary key,
  enabled boolean not null default true,
  warning_before_breach_minutes integer not null,
  exclude_resolved boolean not null default false,
  exclude_archived boolean not null default false,
  rules jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid null,
  constraint tenant_sla_policies_warning_positive check (warning_before_breach_minutes > 0),
  constraint tenant_sla_policies_rules_object check (jsonb_typeof(rules) = 'object'),
  constraint tenant_sla_policies_version_positive check (version >= 1)
);

create index if not exists idx_tenant_sla_policies_tenant on tenant_sla_policies (tenant_id);

notify pgrst, 'reload schema';

commit;
