-- Phase II-D1-A: team member (sales_agents) assignment config columns + enum. Additive only; no queue/worker changes.
-- Requires PostgreSQL 15+ for ADD VALUE IF NOT EXISTS where used elsewhere in repo; enum here uses DO duplicate_object pattern.

begin;

do $$ begin
  create type sales_assignment_mode as enum ('AUTO', 'MANUAL_ONLY', 'PAUSED');
exception when duplicate_object then null;
end $$;

alter table sales_agents add column if not exists assignment_enabled boolean not null default false;
alter table sales_agents add column if not exists assignment_mode sales_assignment_mode not null default 'MANUAL_ONLY';
alter table sales_agents add column if not exists max_active_conversations integer null;
alter table sales_agents add column if not exists max_active_leads integer null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_agents_max_active_conversations_nonneg'
  ) then
    alter table sales_agents
      add constraint sales_agents_max_active_conversations_nonneg
      check (max_active_conversations is null or max_active_conversations >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'sales_agents_max_active_leads_nonneg'
  ) then
    alter table sales_agents
      add constraint sales_agents_max_active_leads_nonneg
      check (max_active_leads is null or max_active_leads >= 0);
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
