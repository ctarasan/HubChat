-- Phase II-C1: additive enum values for conversation and lead status (no removals, no queue changes).
-- Requires PostgreSQL 15+ for ADD VALUE IF NOT EXISTS on enums (Supabase default).

begin;

alter type conversation_status add value if not exists 'RESOLVED';
alter type conversation_status add value if not exists 'ARCHIVED';

alter type lead_status add value if not exists 'UNQUALIFIED';

-- Refresh PostgREST schema cache so new enum labels are visible to the API.
notify pgrst, 'reload schema';

commit;
