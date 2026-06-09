-- CCW-1A: link conversations to channel_connections for active-connection scoping.

alter table conversations
  add column if not exists channel_connection_id uuid null references channel_connections (id) on delete set null;

create index if not exists idx_conversations_channel_connection
  on conversations (tenant_id, channel_connection_id)
  where channel_connection_id is not null;

create index if not exists idx_conversations_tenant_provider_page
  on conversations (tenant_id, channel_type, provider_page_id)
  where provider_page_id is not null;
