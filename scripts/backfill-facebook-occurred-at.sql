-- Repair historically bad Facebook occurred_at values (e.g. 1970 timestamps)
-- caused by interpreting Meta epoch-seconds as milliseconds.

begin;

-- 1) Fix message occurred_at using created_at as safe fallback.
update messages
set occurred_at = created_at
where channel_type = 'FACEBOOK'
  and occurred_at < timestamptz '2000-01-01'
  and created_at is not null;

-- 2) Recompute each conversation last_message_at from its newest message event time.
with latest_per_conversation as (
  select
    m.conversation_id,
    max(coalesce(m.occurred_at, m.created_at)) as max_message_at
  from messages m
  group by m.conversation_id
)
update conversations c
set
  last_message_at = l.max_message_at,
  updated_at = now()
from latest_per_conversation l
where c.id = l.conversation_id
  and l.max_message_at is not null
  and c.last_message_at is distinct from l.max_message_at;

commit;

