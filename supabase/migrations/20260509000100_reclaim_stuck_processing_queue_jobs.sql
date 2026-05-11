-- Reclaim queue_jobs stuck in PROCESSING (e.g. worker crash before markDone/markFailed).
-- Mirrors the outbox timeout pattern (claim_outbox_events).

create or replace function claim_queue_jobs(
  p_topic text,
  p_limit int default 1,
  p_processing_timeout_seconds int default 300
)
returns table (
  id uuid,
  tenant_id uuid,
  payload_json jsonb,
  retry_count int,
  max_retries int
)
language plpgsql
as $$
begin
  return query
  with cte as (
    select q.id
    from queue_jobs q
    where q.topic = p_topic
      and q.available_at <= now()
      and (
        q.status = 'PENDING'
        or (
          q.status = 'PROCESSING'
          and q.updated_at <= now() - make_interval(secs => greatest(1, p_processing_timeout_seconds))
        )
      )
    order by q.available_at asc
    for update skip locked
    limit greatest(1, least(200, p_limit))
  )
  update queue_jobs q
  set status = 'PROCESSING', updated_at = now()
  from cte
  where q.id = cte.id
  returning q.id, q.tenant_id, q.payload_json, q.retry_count, q.max_retries;
end;
$$;
