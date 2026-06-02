begin;

alter table conversations drop constraint if exists conversations_provider_thread_type_valid;
alter table conversations add constraint conversations_provider_thread_type_valid check (
  provider_thread_type is null
  or provider_thread_type in ('MESSENGER_DM', 'FACEBOOK_COMMENT', 'INSTAGRAM_DM', 'INSTAGRAM_COMMENT')
);

commit;
