create extension if not exists "uuid-ossp";

do $$ begin
  create type channel_type as enum ('LINE','FACEBOOK','INSTAGRAM','TIKTOK','SHOPEE','LAZADA');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type lead_status as enum ('NEW','ASSIGNED','CONTACTED','QUALIFIED','PROPOSAL_SENT','NEGOTIATION','WON','LOST','UNQUALIFIED');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type conversation_status as enum ('OPEN','PENDING','CLOSED','RESOLVED','ARCHIVED');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type message_direction as enum ('INBOUND','OUTBOUND');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type sender_type as enum ('CUSTOMER','SALES','SYSTEM');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type sales_role as enum ('SALES','MANAGER','ADMIN');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type sales_status as enum ('ACTIVE','INACTIVE');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type sales_assignment_mode as enum ('AUTO','MANUAL_ONLY','PAUSED');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type activity_type as enum ('MESSAGE_SENT','MESSAGE_RECEIVED','STATUS_CHANGED','ASSIGNED','NOTE_ADDED');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type queue_status as enum ('PENDING','PROCESSING','DONE','FAILED','DEAD_LETTER');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type idempotency_status as enum ('PROCESSING','DONE');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type outbox_status as enum ('PENDING','PROCESSING','DISPATCHED','DEAD_LETTER');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type marketing_automation_bridge_outbox_status as enum (
    'PENDING',
    'PROCESSING',
    'SENT',
    'FAILED',
    'DEAD_LETTER'
  );
exception when duplicate_object then null;
end $$;

create table if not exists tenants (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists sales_agents (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  email text not null,
  role sales_role not null default 'SALES',
  status sales_status not null default 'ACTIVE',
  assignment_enabled boolean not null default false,
  assignment_mode sales_assignment_mode not null default 'MANUAL_ONLY',
  max_active_conversations integer null,
  max_active_leads integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

alter table sales_agents drop constraint if exists sales_agents_max_active_conversations_nonneg;
alter table sales_agents add constraint sales_agents_max_active_conversations_nonneg check (
  max_active_conversations is null or max_active_conversations >= 0
);
alter table sales_agents drop constraint if exists sales_agents_max_active_leads_nonneg;
alter table sales_agents add constraint sales_agents_max_active_leads_nonneg check (
  max_active_leads is null or max_active_leads >= 0
);

create table if not exists channel_accounts (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  channel channel_type not null,
  external_account_id text not null,
  display_name text null,
  metadata_json jsonb not null default '{}'::jsonb,
  credential_ref text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel, external_account_id)
);

create table if not exists channel_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  channel channel_type not null,
  enabled boolean not null default false,
  display_name text null,
  config_json jsonb not null default '{}'::jsonb,
  secret_json jsonb not null default '{}'::jsonb,
  secret_fingerprint_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel),
  constraint channel_settings_g1_channel_scope check (
    channel in ('LINE'::channel_type, 'FACEBOOK'::channel_type, 'INSTAGRAM'::channel_type)
  ),
  constraint channel_settings_config_json_object check (jsonb_typeof(config_json) = 'object'),
  constraint channel_settings_secret_json_object check (jsonb_typeof(secret_json) = 'object'),
  constraint channel_settings_secret_fingerprint_json_object check (jsonb_typeof(secret_fingerprint_json) = 'object')
);

create index if not exists idx_channel_settings_tenant on channel_settings (tenant_id);

do $$
begin
  create type channel_connection_status as enum (
    'DRAFT',
    'AUTHORIZING',
    'CONNECTED',
    'WEBHOOK_CONFIGURED',
    'WEBHOOK_VERIFIED',
    'INBOUND_VERIFIED',
    'OUTBOUND_VERIFIED',
    'READY',
    'ERROR',
    'RECONNECT_REQUIRED',
    'REVOKED'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type channel_credential_state as enum (
    'EMPTY',
    'SET',
    'EXPIRED',
    'REVOKED'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type channel_credential_type as enum (
    'ACCESS_TOKEN',
    'REFRESH_TOKEN',
    'CHANNEL_SECRET',
    'APP_SECRET',
    'VERIFY_TOKEN'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists channel_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  provider channel_type not null,
  status channel_connection_status not null default 'DRAFT',
  provider_account_id text null,
  provider_account_name text null,
  provider_page_id text null,
  provider_ig_account_id text null,
  public_connection_key text not null,
  webhook_endpoint text null,
  webhook_active boolean not null default false,
  last_inbound_verified_at timestamptz null,
  last_outbound_verified_at timestamptz null,
  last_health_check_at timestamptz null,
  last_error_code text null,
  last_error_message_safe text null,
  connected_by uuid null,
  connected_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channel_connections_provider_scope check (
    provider in ('LINE'::channel_type, 'FACEBOOK'::channel_type, 'INSTAGRAM'::channel_type)
  ),
  constraint channel_connections_public_key_format check (
    public_connection_key ~ '^ccp_[A-Za-z0-9_-]{16,128}$'
  ),
  unique (tenant_id, provider),
  unique (public_connection_key)
);

create index if not exists idx_channel_connections_tenant on channel_connections (tenant_id);
create index if not exists idx_channel_connections_tenant_provider on channel_connections (tenant_id, provider);
create index if not exists idx_channel_connections_provider_account on channel_connections (tenant_id, provider, provider_account_id);

create table if not exists channel_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  connection_id uuid not null references channel_connections (id) on delete cascade,
  provider channel_type not null,
  credential_type channel_credential_type not null,
  encrypted_secret_value text not null default '',
  secret_fingerprint text null,
  token_expires_at timestamptz null,
  credential_state channel_credential_state not null default 'EMPTY',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channel_credentials_provider_scope check (
    provider in ('LINE'::channel_type, 'FACEBOOK'::channel_type, 'INSTAGRAM'::channel_type)
  ),
  unique (connection_id, credential_type)
);

create index if not exists idx_channel_credentials_tenant on channel_credentials (tenant_id);
create index if not exists idx_channel_credentials_connection on channel_credentials (connection_id);

do $$
begin
  create type oauth_transaction_status as enum (
    'PENDING',
    'CALLBACK_RECEIVED',
    'PAGES_READY',
    'COMPLETED',
    'FAILED',
    'EXPIRED'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists oauth_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  connection_id uuid not null references channel_connections (id) on delete cascade,
  provider channel_type not null default 'FACEBOOK'::channel_type,
  state_hash text not null,
  resume_session_hash text null,
  status oauth_transaction_status not null default 'PENDING',
  initiated_by_auth_user_id text not null,
  initiated_by_sales_agent_id uuid not null,
  encrypted_user_token text null,
  user_token_expires_at timestamptz null,
  page_candidates_json jsonb null,
  selected_page_id text null,
  error_category text null,
  callback_received_at timestamptz null,
  consumed_at timestamptz null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint oauth_transactions_provider_scope check (
    provider in ('FACEBOOK'::channel_type)
  )
);

create unique index if not exists idx_oauth_transactions_state_hash_active
  on oauth_transactions (state_hash)
  where consumed_at is null;

create unique index if not exists idx_oauth_transactions_resume_session_hash_active
  on oauth_transactions (resume_session_hash)
  where consumed_at is null and resume_session_hash is not null;

create index if not exists idx_oauth_transactions_tenant on oauth_transactions (tenant_id);
create index if not exists idx_oauth_transactions_connection on oauth_transactions (connection_id);
create index if not exists idx_oauth_transactions_expires_at on oauth_transactions (expires_at);

do $$
begin
  create type instagram_oauth_auth_family as enum (
    'LEGACY_FACEBOOK_PAGE',
    'INSTAGRAM_BUSINESS_LOGIN'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type instagram_oauth_credential_status as enum (
    'PENDING',
    'ACTIVE',
    'TOKEN_EXPIRING',
    'REFRESHING',
    'REAUTH_REQUIRED',
    'REVOKED',
    'DISCONNECTED',
    'ERROR'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type instagram_oauth_refresh_status as enum (
    'NEVER',
    'SUCCESS',
    'RETRYABLE_FAILURE',
    'TERMINAL_FAILURE'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type instagram_oauth_connection_health_status as enum (
    'UNKNOWN',
    'HEALTHY',
    'DEGRADED',
    'UNHEALTHY'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists instagram_oauth_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  channel_connection_id uuid not null references channel_connections (id) on delete cascade,
  provider channel_type not null default 'INSTAGRAM'::channel_type,
  auth_family instagram_oauth_auth_family not null,
  credential_status instagram_oauth_credential_status not null default 'PENDING',
  access_token_ciphertext text not null default '',
  token_type text not null default 'bearer',
  token_expires_at timestamptz null,
  refresh_eligible_at timestamptz null,
  last_refresh_at timestamptz null,
  last_refresh_status instagram_oauth_refresh_status not null default 'NEVER',
  last_refresh_error_code text null,
  granted_scopes text[] null,
  provider_instagram_account_id text null,
  provider_user_id text null,
  connected_by_sales_agent_id uuid null,
  connected_at timestamptz null,
  revoked_at timestamptz null,
  reauth_required_at timestamptz null,
  connection_health_status instagram_oauth_connection_health_status not null default 'UNKNOWN',
  credential_version integer not null default 1,
  secret_fingerprint text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_oauth_credentials_provider_scope check (
    provider = 'INSTAGRAM'::channel_type
  ),
  constraint instagram_oauth_credentials_version_positive check (credential_version >= 1),
  constraint instagram_oauth_credentials_token_type_scope check (
    token_type in ('bearer')
  )
);

create index if not exists idx_instagram_oauth_credentials_tenant
  on instagram_oauth_credentials (tenant_id);

create index if not exists idx_instagram_oauth_credentials_tenant_connection
  on instagram_oauth_credentials (tenant_id, channel_connection_id);

create index if not exists idx_instagram_oauth_credentials_connection
  on instagram_oauth_credentials (channel_connection_id);

create unique index if not exists idx_instagram_oauth_credentials_active_connection
  on instagram_oauth_credentials (channel_connection_id)
  where credential_status in (
    'PENDING',
    'ACTIVE',
    'TOKEN_EXPIRING',
    'REFRESHING',
    'REAUTH_REQUIRED'
  );

create unique index if not exists idx_instagram_oauth_credentials_active_ig_account
  on instagram_oauth_credentials (provider_instagram_account_id)
  where provider_instagram_account_id is not null
    and credential_status in (
      'PENDING',
      'ACTIVE',
      'TOKEN_EXPIRING',
      'REFRESHING',
      'REAUTH_REQUIRED'
    );

create table if not exists tenant_sla_policies (
  tenant_id uuid primary key,
  enabled boolean not null default true,
  warning_before_breach_minutes integer not null,
  exclude_resolved boolean not null default false,
  exclude_archived boolean not null default false,
  rules jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid null,
  constraint tenant_sla_policies_warning_positive check (warning_before_breach_minutes > 0),
  constraint tenant_sla_policies_rules_object check (jsonb_typeof(rules) = 'object'),
  constraint tenant_sla_policies_version_positive check (version >= 1)
);

create index if not exists idx_tenant_sla_policies_tenant on tenant_sla_policies (tenant_id);

create table if not exists leads (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  source_channel channel_type not null,
  external_user_id text not null,
  name text null,
  phone text null,
  email text null,
  status lead_status not null default 'NEW',
  assigned_sales_id uuid null references sales_agents(id),
  lead_score int null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_contact_at timestamptz null,
  unique (tenant_id, source_channel, external_user_id)
);

create table if not exists customers (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  lead_id uuid null references leads(id),
  external_user_id text null,
  name text null,
  phone text null,
  email text null,
  created_at timestamptz not null default now()
);

create table if not exists contacts (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  display_name text null,
  phone text null,
  email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists contact_identities (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  contact_id uuid not null references contacts(id),
  channel_type channel_type not null,
  external_user_id text not null,
  display_name text null,
  profile_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel_type, external_user_id)
);

create table if not exists conversations (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  lead_id uuid not null references leads(id),
  contact_id uuid null references contacts(id),
  channel_account_id uuid null references channel_accounts(id),
  channel_type channel_type not null,
  channel_thread_id text not null,
  participant_display_name text null,
  participant_profile_image_url text null,
  unread_count int not null default 0,
  last_read_at timestamptz null,
  last_message_preview text null,
  last_message_type text null,
  status conversation_status not null default 'OPEN',
  assigned_agent_id uuid null references sales_agents(id),
  last_message_at timestamptz not null default now(),
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel_type, channel_thread_id)
);

create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  conversation_id uuid not null references conversations(id),
  channel_type channel_type not null,
  external_message_id text null,
  message_type text not null default 'TEXT',
  direction message_direction not null,
  sender_type sender_type not null,
  sender_id text null,
  content text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, channel_type, external_message_id)
);

create table if not exists message_events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  message_id uuid not null references messages(id),
  event_type text not null,
  occurred_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb
);

create table if not exists activity_logs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  lead_id uuid not null references leads(id),
  type activity_type not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists conversation_events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  conversation_id uuid not null references conversations(id),
  lead_id uuid null references leads(id) on delete set null,
  actor_sales_agent_id uuid null references sales_agents(id) on delete set null,
  actor_auth_user_id uuid null,
  event_type text not null,
  old_value jsonb null,
  new_value jsonb null,
  metadata_json jsonb not null default '{}'::jsonb,
  note text null,
  created_at timestamptz not null default now()
);

create table if not exists automation_rules (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  trigger_type text not null,
  conditions_json jsonb not null default '{}'::jsonb,
  actions_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists webhook_events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  channel_type channel_type not null,
  external_event_id text not null,
  idempotency_key text not null,
  payload_json jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz null,
  unique (tenant_id, channel_type, idempotency_key)
);

create table if not exists queue_jobs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  topic text not null,
  payload_json jsonb not null,
  status queue_status not null default 'PENDING',
  available_at timestamptz not null default now(),
  retry_count int not null default 0,
  max_retries int not null default 10,
  last_error text null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, topic, idempotency_key)
);

create table if not exists idempotency_keys (
  scope text not null,
  key text not null,
  status idempotency_status not null default 'PROCESSING',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (scope, key)
);

create table if not exists rate_limit_counters (
  tenant_id uuid not null references tenants(id),
  channel channel_type not null,
  window_key bigint not null,
  current_count int not null default 0,
  window_started_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, channel, window_key)
);

create table if not exists outbox_events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id),
  topic text not null,
  payload_json jsonb not null,
  idempotency_key text not null,
  status outbox_status not null default 'PENDING',
  available_at timestamptz not null default now(),
  attempt_count int not null default 0,
  max_attempts int not null default 25,
  last_error text null,
  dispatched_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, topic, idempotency_key)
);

create table if not exists marketing_events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants (id),
  lead_id uuid null references leads (id) on delete set null,
  conversation_id uuid null references conversations (id) on delete set null,
  channel text null,
  event_type text not null,
  occurred_at timestamptz not null,
  actor_type text not null,
  actor_user_id uuid null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table marketing_events drop constraint if exists marketing_events_actor_type_valid;
alter table marketing_events add constraint marketing_events_actor_type_valid check (
  actor_type in ('SYSTEM', 'CUSTOMER', 'AGENT')
);

alter table marketing_events drop constraint if exists marketing_events_event_type_valid;
alter table marketing_events add constraint marketing_events_event_type_valid check (
  event_type in (
    'LEAD_CREATED',
    'LEAD_STATUS_CHANGED',
    'CONVERSATION_CREATED',
    'CONVERSATION_STATUS_CHANGED',
    'CUSTOMER_MESSAGE_RECEIVED',
    'AGENT_MESSAGE_SENT',
    'FOLLOW_UP_SCHEDULED',
    'FOLLOW_UP_CLEARED',
    'SLA_DUE_SET',
    'SLA_CLEARED'
  )
);

create table if not exists marketing_automation_bridge_outbox (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants (id),
  marketing_event_id uuid not null references marketing_events (id),
  event_type text not null,
  payload_json jsonb not null,
  schema_version text not null default '1',
  status marketing_automation_bridge_outbox_status not null default 'PENDING',
  available_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  max_attempts integer not null default 25,
  last_error text null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz null,
  constraint marketing_automation_bridge_outbox_attempt_count_nonneg check (attempt_count >= 0),
  constraint marketing_automation_bridge_outbox_max_attempts_positive check (max_attempts > 0),
  constraint marketing_automation_bridge_outbox_payload_json_object check (jsonb_typeof(payload_json) = 'object'),
  constraint marketing_automation_bridge_outbox_tenant_marketing_event_unique unique (tenant_id, marketing_event_id),
  constraint marketing_automation_bridge_outbox_tenant_idempotency_unique unique (tenant_id, idempotency_key)
);

alter table channel_accounts add column if not exists display_name text null;
alter table channel_accounts add column if not exists metadata_json jsonb not null default '{}'::jsonb;
alter table channel_accounts add column if not exists is_active boolean not null default true;
alter table channel_accounts add column if not exists updated_at timestamptz not null default now();

alter table conversations add column if not exists contact_id uuid null references contacts(id);
alter table conversations add column if not exists channel_account_id uuid null references channel_accounts(id);
alter table conversations add column if not exists participant_display_name text null;
alter table conversations add column if not exists participant_profile_image_url text null;
alter table conversations add column if not exists unread_count int not null default 0;
alter table conversations add column if not exists last_read_at timestamptz null;
alter table conversations add column if not exists last_message_preview text null;
alter table conversations add column if not exists last_message_type text null;
alter table conversations add column if not exists provider_thread_type text null;
alter table conversations add column if not exists provider_comment_id text null;
alter table conversations add column if not exists provider_post_id text null;
alter table conversations add column if not exists channel_connection_id uuid null references channel_connections (id) on delete set null;
alter table conversations add column if not exists provider_page_id text null;
alter table conversations add column if not exists provider_external_user_id text null;
alter table conversations add column if not exists private_reply_sent_at timestamptz null;
alter table conversations add column if not exists private_reply_comment_id text null;
alter table conversations add column if not exists facebook_private_reply_sent_at timestamptz null;
alter table conversations add column if not exists facebook_private_reply_message_id text null;
alter table conversations add column if not exists facebook_private_reply_status text null;
alter table conversations add column if not exists facebook_public_reply_sent_at timestamptz null;
alter table conversations add column if not exists converted_to_dm_at timestamptz null;
alter table conversations drop constraint if exists conversations_provider_thread_type_valid;
alter table conversations add constraint conversations_provider_thread_type_valid check (
  provider_thread_type is null or provider_thread_type in ('MESSENGER_DM', 'FACEBOOK_COMMENT', 'INSTAGRAM_DM', 'INSTAGRAM_COMMENT')
);
alter table conversations drop constraint if exists conversations_unread_count_non_negative;
alter table conversations add constraint conversations_unread_count_non_negative check (unread_count >= 0);

alter table conversations add column if not exists assignment_status text not null default 'UNASSIGNED';
alter table conversations add column if not exists priority text not null default 'NORMAL';
alter table conversations add column if not exists first_response_at timestamptz null;
alter table conversations add column if not exists last_customer_message_at timestamptz null;
alter table conversations add column if not exists last_agent_message_at timestamptz null;
alter table conversations add column if not exists sla_due_at timestamptz null;
alter table conversations add column if not exists closed_at timestamptz null;

alter table conversations add column if not exists follow_up_at timestamptz null;
alter table conversations add column if not exists follow_up_note text null;

alter table conversations drop constraint if exists conversations_assignment_status_valid;
alter table conversations add constraint conversations_assignment_status_valid check (
  assignment_status in ('UNASSIGNED', 'ASSIGNED', 'REASSIGNED', 'UNASSIGNED_AGAIN')
);

alter table conversations drop constraint if exists conversations_priority_valid;
alter table conversations add constraint conversations_priority_valid check (
  priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')
);

alter table contacts add column if not exists profile_image_url text null;

alter table contact_identities add column if not exists profile_image_url text null;
alter table contact_identities add column if not exists profile_image_cached_path text null;
alter table contact_identities add column if not exists profile_image_cached_at timestamptz null;
alter table contact_identities add column if not exists profile_image_cache_status text null;
alter table contact_identities add column if not exists profile_image_source_url_hash text null;

alter table contact_identities drop constraint if exists contact_identities_profile_image_cache_status_valid;
alter table contact_identities add constraint contact_identities_profile_image_cache_status_valid check (
  profile_image_cache_status is null
  or profile_image_cache_status in ('pending', 'ok', 'failed', 'skipped')
);

alter table messages add column if not exists message_type text not null default 'TEXT';
alter table messages add column if not exists raw_payload jsonb not null default '{}'::jsonb;
alter table messages add column if not exists media_url text null;
alter table messages add column if not exists preview_url text null;
alter table messages add column if not exists file_size_bytes bigint null;
alter table messages add column if not exists width int null;
alter table messages add column if not exists height int null;

create index if not exists idx_leads_tenant_status on leads (tenant_id, status);
create index if not exists idx_leads_assigned on leads (tenant_id, assigned_sales_id, status);
create index if not exists idx_leads_tenant_updated_id on leads (tenant_id, updated_at desc, id desc);
create index if not exists idx_leads_tenant_channel_updated_id on leads (tenant_id, source_channel, updated_at desc, id desc);
create index if not exists idx_channel_accounts_lookup on channel_accounts (tenant_id, channel, is_active);
create index if not exists idx_contact_identities_lookup on contact_identities (tenant_id, channel_type, external_user_id);
create index if not exists idx_conv_tenant_last_message on conversations (tenant_id, last_message_at desc);
create index if not exists idx_conv_tenant_status_last_id on conversations (tenant_id, status, last_message_at desc, id desc);
create index if not exists idx_conv_tenant_channel_last_id on conversations (tenant_id, channel_type, last_message_at desc, id desc);
create index if not exists idx_conversations_channel_connection on conversations (tenant_id, channel_connection_id) where channel_connection_id is not null;
create index if not exists idx_conversations_tenant_provider_page on conversations (tenant_id, channel_type, provider_page_id) where provider_page_id is not null;
create index if not exists idx_conversations_tenant_channel_thread on conversations (tenant_id, channel_type, channel_thread_id);
create index if not exists idx_conversations_provider_external_user on conversations (provider_external_user_id);
create index if not exists idx_conv_contact_last_message on conversations (contact_id, last_message_at desc);
create index if not exists idx_messages_conv_created on messages (conversation_id, created_at asc);
create index if not exists idx_messages_tenant_conv_created_id on messages (tenant_id, conversation_id, created_at desc, id desc);
create index if not exists idx_messages_channel_created on messages (channel_type, created_at desc);
create index if not exists idx_messages_channel_external_message on messages (channel_type, external_message_id);
create index if not exists idx_activity_lead_created on activity_logs (lead_id, created_at desc);
create index if not exists idx_message_events_message_occurred on message_events (message_id, occurred_at desc);
create index if not exists idx_conv_tii_tenant_assigned_agent_last_msg
  on conversations (tenant_id, assigned_agent_id, last_message_at desc);
create index if not exists idx_conv_tii_tenant_assignment_status_last_msg
  on conversations (tenant_id, assignment_status, last_message_at desc);
create index if not exists idx_conv_tii_tenant_priority_last_msg
  on conversations (tenant_id, priority, last_message_at desc);
create index if not exists idx_conv_tii_tenant_lead
  on conversations (tenant_id, lead_id);
create index if not exists idx_conversation_events_tenant_conv_created
  on conversation_events (tenant_id, conversation_id, created_at desc);
create index if not exists idx_conversation_events_tenant_type_created
  on conversation_events (tenant_id, event_type, created_at desc);
create index if not exists idx_conversation_events_tenant_actor_agent_created
  on conversation_events (tenant_id, actor_sales_agent_id, created_at desc);
create index if not exists idx_jobs_polling on queue_jobs (status, available_at, topic);
create index if not exists idx_idempotency_keys_expires on idempotency_keys (expires_at);
create index if not exists idx_rate_limit_counters_updated on rate_limit_counters (updated_at);
create index if not exists idx_outbox_pending on outbox_events (status, available_at, topic);
create index if not exists idx_marketing_events_tenant_occurred
  on marketing_events (tenant_id, occurred_at desc);
create index if not exists idx_marketing_events_tenant_lead_occurred
  on marketing_events (tenant_id, lead_id, occurred_at desc)
  where lead_id is not null;
create index if not exists idx_marketing_events_tenant_conv_occurred
  on marketing_events (tenant_id, conversation_id, occurred_at desc)
  where conversation_id is not null;
create index if not exists idx_marketing_events_tenant_type_occurred
  on marketing_events (tenant_id, event_type, occurred_at desc);
create index if not exists idx_marketing_automation_bridge_outbox_status_available
  on marketing_automation_bridge_outbox (status, available_at);

alter table marketing_events enable row level security;
alter table marketing_automation_bridge_outbox enable row level security;

alter table leads enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table activity_logs enable row level security;

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

create or replace function claim_queue_job(p_topic text)
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
  select * from claim_queue_jobs(p_topic, 1);
end;
$$;

create or replace function acquire_idempotency_key(
  p_scope text,
  p_key text,
  p_processing_ttl_seconds int default 300
)
returns boolean
language plpgsql
as $$
declare
  inserted_count int := 0;
  v_status idempotency_status;
  v_expires_at timestamptz;
begin
  insert into idempotency_keys (scope, key, status, expires_at, created_at, updated_at)
  values (p_scope, p_key, 'PROCESSING', now() + make_interval(secs => p_processing_ttl_seconds), now(), now())
  on conflict (scope, key) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count > 0 then
    return false;
  end if;

  select status, expires_at
  into v_status, v_expires_at
  from idempotency_keys
  where scope = p_scope and key = p_key;

  if v_status is null then
    return false;
  end if;

  if v_status = 'DONE' and v_expires_at > now() then
    return true;
  end if;
  if v_status = 'PROCESSING' and v_expires_at > now() then
    return true;
  end if;

  update idempotency_keys
  set status = 'PROCESSING',
      expires_at = now() + make_interval(secs => p_processing_ttl_seconds),
      updated_at = now()
  where scope = p_scope and key = p_key;

  return false;
end;
$$;

create or replace function check_rate_limit(
  p_tenant_id uuid,
  p_channel channel_type,
  p_limit int,
  p_window_seconds int
)
returns table (
  allowed boolean,
  current_count int,
  reset_at timestamptz
)
language plpgsql
as $$
declare
  v_window_seconds int := greatest(1, p_window_seconds);
  v_window_key bigint := floor(extract(epoch from now()) / v_window_seconds);
  v_count int;
begin
  insert into rate_limit_counters (tenant_id, channel, window_key, current_count, window_started_at, updated_at)
  values (p_tenant_id, p_channel, v_window_key, 1, to_timestamp(v_window_key * v_window_seconds), now())
  on conflict (tenant_id, channel, window_key)
  do update set
    current_count = rate_limit_counters.current_count + 1,
    updated_at = now()
  returning rate_limit_counters.current_count into v_count;

  return query
  select
    (v_count <= greatest(1, p_limit)) as allowed,
    v_count as current_count,
    to_timestamp((v_window_key + 1) * v_window_seconds) as reset_at;
end;
$$;

create or replace function claim_outbox_events(
  p_topic text default null,
  p_limit int default 50,
  p_processing_timeout_seconds int default 120
)
returns table (
  id uuid,
  tenant_id uuid,
  topic text,
  payload_json jsonb,
  idempotency_key text,
  attempt_count int,
  max_attempts int
)
language plpgsql
as $$
begin
  return query
  with cte as (
    select o.id
    from outbox_events o
    where (
        o.status = 'PENDING'
        or (o.status = 'PROCESSING' and o.updated_at <= now() - make_interval(secs => greatest(1, p_processing_timeout_seconds)))
      )
      and o.available_at <= now()
      and (p_topic is null or o.topic = p_topic)
    order by o.available_at asc
    for update skip locked
    limit greatest(1, least(200, p_limit))
  )
  update outbox_events o
  set status = 'PROCESSING',
      attempt_count = o.attempt_count + 1,
      updated_at = now()
  from cte
  where o.id = cte.id
  returning o.id, o.tenant_id, o.topic, o.payload_json, o.idempotency_key, o.attempt_count, o.max_attempts;
end;
$$;

create or replace function claim_marketing_automation_bridge_outbox(
  p_limit int default 50,
  p_processing_timeout_seconds int default 120
)
returns table (
  id uuid,
  tenant_id uuid,
  marketing_event_id uuid,
  event_type text,
  payload_json jsonb,
  schema_version text,
  status marketing_automation_bridge_outbox_status,
  available_at timestamptz,
  attempt_count int,
  max_attempts int,
  last_error text,
  idempotency_key text,
  created_at timestamptz,
  updated_at timestamptz,
  sent_at timestamptz
)
language plpgsql
as $$
begin
  return query
  with cte as (
    select o.id
    from marketing_automation_bridge_outbox o
    where o.available_at <= now()
      and (
        o.status = 'PENDING'
        or (
          o.status = 'PROCESSING'
          and o.updated_at <= now() - make_interval(secs => greatest(1, p_processing_timeout_seconds))
        )
      )
    order by o.available_at asc
    for update skip locked
    limit greatest(1, least(200, p_limit))
  )
  update marketing_automation_bridge_outbox o
  set status = 'PROCESSING',
      attempt_count = o.attempt_count + 1,
      updated_at = now()
  from cte
  where o.id = cte.id
  returning
    o.id,
    o.tenant_id,
    o.marketing_event_id,
    o.event_type,
    o.payload_json,
    o.schema_version,
    o.status,
    o.available_at,
    o.attempt_count,
    o.max_attempts,
    o.last_error,
    o.idempotency_key,
    o.created_at,
    o.updated_at,
    o.sent_at;
end;
$$;

create or replace function save_webhook_event_with_outbox(
  p_tenant_id uuid,
  p_channel_type channel_type,
  p_external_event_id text,
  p_idempotency_key text,
  p_payload_json jsonb,
  p_outbox_topic text,
  p_outbox_payload_json jsonb,
  p_outbox_idempotency_key text
)
returns boolean
language plpgsql
as $$
declare
  inserted_count int := 0;
begin
  insert into webhook_events (
    tenant_id,
    channel_type,
    external_event_id,
    idempotency_key,
    payload_json
  )
  values (
    p_tenant_id,
    p_channel_type,
    p_external_event_id,
    p_idempotency_key,
    p_payload_json
  )
  on conflict (tenant_id, channel_type, idempotency_key) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    return false;
  end if;

  insert into outbox_events (
    tenant_id,
    topic,
    payload_json,
    idempotency_key,
    status,
    available_at
  )
  values (
    p_tenant_id,
    p_outbox_topic,
    p_outbox_payload_json,
    p_outbox_idempotency_key,
    'PENDING',
    now()
  )
  on conflict (tenant_id, topic, idempotency_key) do nothing;

  return true;
end;
$$;

create or replace function create_outbound_message_with_outbox(
  p_tenant_id uuid,
  p_lead_id uuid,
  p_conversation_id uuid,
  p_conversation_ids jsonb,
  p_channel channel_type,
  p_channel_thread_id text,
  p_content text,
  p_message_type text default 'TEXT',
  p_media_url text default null,
  p_preview_url text default null,
  p_media_mime_type text default null,
  p_file_name text default null,
  p_file_size_bytes bigint default null,
  p_width int default null,
  p_height int default null
)
returns table (message_id uuid)
language plpgsql
as $$
declare
  v_message_id uuid;
  v_message_type text := upper(coalesce(p_message_type, 'TEXT'));
  v_metadata jsonb := '{}'::jsonb;
begin
  if v_message_type not in ('TEXT', 'IMAGE', 'DOCUMENT_PDF') then
    raise exception 'Unsupported outbound message type: %', v_message_type;
  end if;
  if v_message_type = 'IMAGE' then
    if p_media_url is null or length(trim(p_media_url)) = 0 then
      raise exception 'media_url is required for IMAGE outbound';
    end if;
    if p_media_mime_type is null or p_media_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
      raise exception 'Unsupported media mime type: %', p_media_mime_type;
    end if;
    v_metadata := jsonb_build_object(
      'mediaUrl', p_media_url,
      'previewUrl', coalesce(p_preview_url, p_media_url),
      'mediaMimeType', p_media_mime_type
    );
    if p_file_size_bytes is not null then
      v_metadata := jsonb_set(v_metadata, '{fileSizeBytes}', to_jsonb(p_file_size_bytes), true);
    end if;
    if p_width is not null then
      v_metadata := jsonb_set(v_metadata, '{width}', to_jsonb(p_width), true);
    end if;
    if p_height is not null then
      v_metadata := jsonb_set(v_metadata, '{height}', to_jsonb(p_height), true);
    end if;
  elsif v_message_type = 'DOCUMENT_PDF' then
    if p_media_url is null or length(trim(p_media_url)) = 0 then
      raise exception 'media_url is required for DOCUMENT_PDF outbound';
    end if;
    if p_media_mime_type is null or p_media_mime_type <> 'application/pdf' then
      raise exception 'Unsupported media mime type for DOCUMENT_PDF: %', p_media_mime_type;
    end if;
    if p_file_name is null or length(trim(p_file_name)) = 0 then
      raise exception 'file_name is required for DOCUMENT_PDF outbound';
    end if;
    v_metadata := jsonb_build_object(
      'mediaUrl', p_media_url,
      'mediaMimeType', p_media_mime_type,
      'fileName', p_file_name
    );
    if p_file_size_bytes is not null then
      v_metadata := jsonb_set(v_metadata, '{fileSizeBytes}', to_jsonb(p_file_size_bytes), true);
    end if;
  end if;

  insert into messages (
    tenant_id,
    conversation_id,
    channel_type,
    external_message_id,
    message_type,
    direction,
    sender_type,
    content,
    metadata_json,
    media_url,
    preview_url,
    file_size_bytes,
    width,
    height
  )
  values (
    p_tenant_id,
    p_conversation_id,
    p_channel,
    null,
    v_message_type,
    'OUTBOUND',
    'SALES',
    p_content,
    v_metadata,
    p_media_url,
    coalesce(p_preview_url, p_media_url),
    p_file_size_bytes,
    p_width,
    p_height
  )
  returning id into v_message_id;

  update conversations
  set
    last_message_at = now(),
    last_message_type = v_message_type,
    last_message_preview = case
      when v_message_type = 'IMAGE' then '[Image]'
      when v_message_type = 'DOCUMENT_PDF' then '[PDF] ' || coalesce(nullif(trim(p_file_name), ''), 'document.pdf')
      else left(coalesce(nullif(trim(p_content), ''), '[Empty]'), 120)
    end,
    updated_at = now()
  where id = p_conversation_id and tenant_id = p_tenant_id;

  insert into activity_logs (
    tenant_id,
    lead_id,
    type,
    metadata_json
  )
  values (
    p_tenant_id,
    p_lead_id,
    'MESSAGE_SENT',
    jsonb_build_object('messageId', v_message_id, 'queued', true)
  );

  insert into outbox_events (
    tenant_id,
    topic,
    payload_json,
    idempotency_key,
    status,
    available_at
  )
  values (
    p_tenant_id,
    'message.outbound.requested',
    jsonb_build_object(
      'tenantId', p_tenant_id,
      'leadId', p_lead_id,
      'messageId', v_message_id,
      'conversationId', p_conversation_id,
      'conversationIds', coalesce(p_conversation_ids, '[]'::jsonb),
      'channel', p_channel,
      'channelThreadId', p_channel_thread_id,
      'content', p_content,
      'messageType', v_message_type,
      'mediaUrl', p_media_url,
      'previewUrl', coalesce(p_preview_url, p_media_url),
      'mediaMimeType', p_media_mime_type,
      'fileName', p_file_name,
      'fileSizeBytes', p_file_size_bytes,
      'width', p_width,
      'height', p_height
    ),
    concat('outbound:', p_tenant_id::text, ':', v_message_id::text),
    'PENDING',
    now()
  );

  return query select v_message_id;
end;
$$;

create or replace function get_queue_runtime_stats()
returns table (
  depth bigint,
  lag_ms bigint
)
language sql
as $$
  select
    count(*)::bigint as depth,
    coalesce(max((extract(epoch from now() - available_at) * 1000)::bigint), 0)::bigint as lag_ms
  from queue_jobs
  where status = 'PENDING'
    and available_at <= now();
$$;

create or replace function get_outbox_runtime_stats()
returns table (
  depth bigint,
  lag_ms bigint
)
language sql
as $$
  select
    count(*)::bigint as depth,
    coalesce(max((extract(epoch from now() - available_at) * 1000)::bigint), 0)::bigint as lag_ms
  from outbox_events
  where status = 'PENDING'
    and available_at <= now();
$$;

create or replace view v_omni_messages_daily as
select
  tenant_id,
  date_trunc('day', created_at) as day,
  channel_type,
  direction,
  count(*)::bigint as message_count
from messages
group by tenant_id, date_trunc('day', created_at), channel_type, direction;

create or replace view v_omni_contacts_by_channel as
select
  tenant_id,
  channel_type,
  count(distinct contact_id)::bigint as unique_contacts
from contact_identities
group by tenant_id, channel_type;

create or replace view v_omni_open_conversations as
select
  tenant_id,
  channel_type,
  count(*)::bigint as open_conversations
from conversations
where status <> 'CLOSED'
group by tenant_id, channel_type;
