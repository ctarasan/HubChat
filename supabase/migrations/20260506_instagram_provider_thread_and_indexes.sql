begin;

alter table conversations drop constraint if exists conversations_provider_thread_type_valid;
alter table conversations add constraint conversations_provider_thread_type_valid check (
  provider_thread_type is null or provider_thread_type in ('MESSENGER_DM', 'FACEBOOK_COMMENT', 'INSTAGRAM_DM')
);

create index if not exists idx_conversations_tenant_channel_thread
  on conversations (tenant_id, channel_type, channel_thread_id);

create index if not exists idx_conversations_provider_external_user
  on conversations (provider_external_user_id);

create index if not exists idx_messages_channel_external_message
  on messages (channel_type, external_message_id);

commit;
