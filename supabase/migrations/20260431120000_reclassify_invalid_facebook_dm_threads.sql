begin;

update public.conversations
set
  provider_thread_type = 'FACEBOOK_COMMENT',
  updated_at = now()
where provider_thread_type = 'MESSENGER_DM'
  and channel_type = 'FACEBOOK'
  and provider_external_user_id is not null
  and (
    channel_thread_id is null
    or channel_thread_id not like 'user:%'
  );

commit;

-- verification query (expected 0 rows)
-- select id, provider_thread_type, provider_external_user_id, provider_page_id, channel_thread_id
-- from public.conversations
-- where provider_thread_type = 'MESSENGER_DM'
--   and channel_type = 'FACEBOOK'
--   and channel_thread_id not like 'user:%';
