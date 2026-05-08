-- Sprint 1 (A): extend lead_status enum only.
-- Keep this migration isolated so new enum values are committed
-- before any later migration uses them in defaults/inserts.

do $$
begin
  if exists (select 1 from pg_type where typname = 'lead_status') then
    alter type lead_status add value if not exists 'UNASSIGNED';
    alter type lead_status add value if not exists 'IN_PROGRESS';
    alter type lead_status add value if not exists 'CLOSED';
  end if;
end $$;
