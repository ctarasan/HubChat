-- Phase II retention purge run audit (dry-run snapshots only; no purge execution).

begin;

create table if not exists retention_purge_runs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants (id),
  requested_by text null,
  status text not null,
  policy_snapshot jsonb not null,
  summary_snapshot jsonb not null,
  samples_snapshot jsonb null,
  notes text null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz null,
  cancelled_by text null
);

alter table retention_purge_runs drop constraint if exists retention_purge_runs_status_valid;
alter table retention_purge_runs add constraint retention_purge_runs_status_valid check (
  status in ('DRY_RUN_SNAPSHOT', 'CANCELLED')
);

alter table retention_purge_runs drop constraint if exists retention_purge_runs_policy_snapshot_object;
alter table retention_purge_runs add constraint retention_purge_runs_policy_snapshot_object check (
  jsonb_typeof(policy_snapshot) = 'object'
);

alter table retention_purge_runs drop constraint if exists retention_purge_runs_summary_snapshot_object;
alter table retention_purge_runs add constraint retention_purge_runs_summary_snapshot_object check (
  jsonb_typeof(summary_snapshot) = 'object'
);

alter table retention_purge_runs drop constraint if exists retention_purge_runs_samples_snapshot_object;
alter table retention_purge_runs add constraint retention_purge_runs_samples_snapshot_object check (
  samples_snapshot is null or jsonb_typeof(samples_snapshot) = 'object'
);

create index if not exists idx_retention_purge_runs_tenant_created
  on retention_purge_runs (tenant_id, created_at desc);

create index if not exists idx_retention_purge_runs_tenant_status
  on retention_purge_runs (tenant_id, status);

alter table retention_purge_runs enable row level security;

commit;
