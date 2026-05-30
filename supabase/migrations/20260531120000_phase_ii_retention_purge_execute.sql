-- Phase II retention purge execute foundation (raw payload redaction only).

begin;

alter table retention_purge_runs drop constraint if exists retention_purge_runs_status_valid;
alter table retention_purge_runs add constraint retention_purge_runs_status_valid check (
  status in ('DRY_RUN_SNAPSHOT', 'CANCELLED', 'EXECUTING', 'COMPLETED', 'FAILED')
);

alter table retention_purge_runs add column if not exists execution_target text null;
alter table retention_purge_runs add column if not exists execution_started_at timestamptz null;
alter table retention_purge_runs add column if not exists execution_finished_at timestamptz null;
alter table retention_purge_runs add column if not exists executed_by text null;
alter table retention_purge_runs add column if not exists execution_result jsonb null;
alter table retention_purge_runs add column if not exists execution_error text null;

alter table retention_purge_runs drop constraint if exists retention_purge_runs_execution_target_valid;
alter table retention_purge_runs add constraint retention_purge_runs_execution_target_valid check (
  execution_target is null or execution_target in ('RAW_PAYLOADS')
);

alter table retention_purge_runs drop constraint if exists retention_purge_runs_execution_result_object;
alter table retention_purge_runs add constraint retention_purge_runs_execution_result_object check (
  execution_result is null or jsonb_typeof(execution_result) = 'object'
);

commit;
