-- Phase II-C2-A: additive follow-up columns on conversations for Team Inbox SLA/follow-up foundation.
-- No queue, worker, or enum changes.

begin;

alter table conversations add column if not exists follow_up_at timestamptz null;
alter table conversations add column if not exists follow_up_note text null;

notify pgrst, 'reload schema';

commit;
