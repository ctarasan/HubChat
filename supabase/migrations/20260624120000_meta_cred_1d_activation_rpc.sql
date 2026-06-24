-- META-CRED-1D-B: verified metadata columns, activation idempotency, transactional activation RPC.
-- Additive only. Does not execute remotely in this phase. Rotation RPC deferred to META-CRED-1D-D.

begin;

do $$
begin
  create type public.meta_page_credential_activation_request_status as enum (
    'PROCESSING',
    'COMPLETED',
    'FAILED'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.meta_page_credentials
  add column if not exists granted_scopes text[] not null default '{}',
  add column if not exists token_expires_at timestamptz null,
  add column if not exists data_access_expires_at timestamptz null,
  add column if not exists provider_token_type text not null default '',
  add column if not exists verification_version integer not null default 0;

alter table public.meta_page_credentials
  drop constraint if exists meta_page_credentials_granted_scopes_normalized;

alter table public.meta_page_credentials
  add constraint meta_page_credentials_active_granted_scopes check (
    status <> 'ACTIVE'::meta_page_credential_status
    or coalesce(array_length(granted_scopes, 1), 0) >= 1
  );

alter table public.meta_page_credentials
  drop constraint if exists meta_page_credentials_active_verification_version;

alter table public.meta_page_credentials
  add constraint meta_page_credentials_active_verification_version check (
    status <> 'ACTIVE'::meta_page_credential_status
    or verification_version >= 1
  );

alter table public.meta_page_credentials
  drop constraint if exists meta_page_credentials_active_provider_token_type;

alter table public.meta_page_credentials
  add constraint meta_page_credentials_active_provider_token_type check (
    status <> 'ACTIVE'::meta_page_credential_status
    or length(btrim(provider_token_type)) > 0
  );

create table if not exists public.meta_page_credential_activation_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  idempotency_key text not null,
  request_fingerprint text not null,
  status public.meta_page_credential_activation_request_status not null default 'PROCESSING',
  credential_id uuid null,
  credential_version integer null,
  response_json jsonb null,
  error_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint meta_page_activation_requests_key_len check (
    length(btrim(idempotency_key)) between 1 and 128
  ),
  constraint meta_page_activation_requests_fingerprint_len check (
    length(btrim(request_fingerprint)) between 1 and 128
  ),
  constraint meta_page_activation_requests_version_positive check (
    credential_version is null or credential_version >= 1
  )
);

create unique index if not exists idx_meta_page_activation_requests_tenant_key
  on public.meta_page_credential_activation_requests (tenant_id, idempotency_key);

create index if not exists idx_meta_page_activation_requests_tenant
  on public.meta_page_credential_activation_requests (tenant_id);

alter table public.meta_page_credential_activation_requests enable row level security;

create or replace function public.activate_meta_page_credential_tx(
  p_tenant_id uuid,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_encrypted_access_token text,
  p_token_fingerprint text,
  p_credential_family text,
  p_provider_app_id text,
  p_facebook_page_id text,
  p_instagram_professional_account_id text,
  p_granted_scopes text[],
  p_token_expires_at timestamptz,
  p_data_access_expires_at timestamptz,
  p_provider_token_type text,
  p_verification_version integer,
  p_verified_at timestamptz,
  p_expected_credential_version integer,
  p_credential_id uuid,
  p_facebook_connection_id uuid,
  p_instagram_connection_id uuid,
  p_requested_channels text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_idem public.meta_page_credential_activation_requests%rowtype;
  v_fb_conn public.channel_connections%rowtype;
  v_ig_conn public.channel_connections%rowtype;
  v_existing_active_id uuid;
  v_credential_id uuid;
  v_credential_version integer;
  v_fb_binding_id uuid;
  v_ig_binding_id uuid;
  v_now timestamptz := now();
  v_wants_instagram boolean := 'INSTAGRAM' = any (coalesce(p_requested_channels, '{}'::text[]));
  v_response jsonb;
begin
  if p_tenant_id is null then
    raise exception 'META_ACTIVATION_INPUT_INVALID' using errcode = 'P0001';
  end if;

  if length(btrim(coalesce(p_idempotency_key, ''))) < 1
     or length(btrim(coalesce(p_idempotency_key, ''))) > 128
     or length(btrim(coalesce(p_request_fingerprint, ''))) < 1
     or length(btrim(coalesce(p_request_fingerprint, ''))) > 128 then
    raise exception 'META_ACTIVATION_INPUT_INVALID' using errcode = 'P0001';
  end if;

  if length(btrim(coalesce(p_encrypted_access_token, ''))) = 0
     or length(btrim(coalesce(p_token_fingerprint, ''))) = 0 then
    raise exception 'META_ACTIVATION_INPUT_INVALID' using errcode = 'P0001';
  end if;

  if btrim(coalesce(p_credential_family, '')) <> 'META_PAGE_FACEBOOK_LOGIN' then
    raise exception 'META_ACTIVATION_INPUT_INVALID' using errcode = 'P0001';
  end if;

  if p_verification_version is null or p_verification_version < 1 then
    raise exception 'META_ACTIVATION_INPUT_INVALID' using errcode = 'P0001';
  end if;

  if p_verified_at is null then
    raise exception 'META_ACTIVATION_INPUT_INVALID' using errcode = 'P0001';
  end if;

  if length(btrim(coalesce(p_provider_app_id, ''))) = 0
     or length(btrim(coalesce(p_facebook_page_id, ''))) = 0
     or length(btrim(coalesce(p_provider_token_type, ''))) = 0 then
    raise exception 'META_ACTIVATION_INPUT_INVALID' using errcode = 'P0001';
  end if;

  if not ('FACEBOOK' = any (coalesce(p_requested_channels, '{}'::text[]))) then
    raise exception 'META_ACTIVATION_INPUT_INVALID' using errcode = 'P0001';
  end if;

  if v_wants_instagram and p_instagram_connection_id is null then
    raise exception 'META_ACTIVATION_INPUT_INVALID' using errcode = 'P0001';
  end if;

  if not v_wants_instagram and p_instagram_connection_id is not null then
    raise exception 'META_ACTIVATION_INPUT_INVALID' using errcode = 'P0001';
  end if;

  if v_wants_instagram and length(btrim(coalesce(p_instagram_professional_account_id, ''))) = 0 then
    raise exception 'META_ACTIVATION_INPUT_INVALID' using errcode = 'P0001';
  end if;

  if p_facebook_connection_id is not null
     and p_instagram_connection_id is not null
     and p_facebook_connection_id = p_instagram_connection_id then
    raise exception 'META_ACTIVATION_INPUT_INVALID' using errcode = 'P0001';
  end if;

  select *
  into v_idem
  from public.meta_page_credential_activation_requests
  where tenant_id = p_tenant_id
    and idempotency_key = btrim(p_idempotency_key)
  for update;

  if found then
    if v_idem.request_fingerprint <> btrim(p_request_fingerprint) then
      raise exception 'META_ACTIVATION_CONFLICT' using errcode = 'P0001';
    end if;
    if v_idem.status = 'COMPLETED' and v_idem.response_json is not null then
      return v_idem.response_json || jsonb_build_object('idempotencyReplay', true);
    end if;
    if v_idem.status = 'PROCESSING' then
      raise exception 'META_ACTIVATION_CONFLICT' using errcode = 'P0001';
    end if;
  else
    insert into public.meta_page_credential_activation_requests (
      tenant_id,
      idempotency_key,
      request_fingerprint,
      status
    )
    values (
      p_tenant_id,
      btrim(p_idempotency_key),
      btrim(p_request_fingerprint),
      'PROCESSING'
    );
  end if;

  select *
  into v_fb_conn
  from public.channel_connections
  where tenant_id = p_tenant_id
    and id = p_facebook_connection_id
  for update;

  if not found or v_fb_conn.provider <> 'FACEBOOK'::channel_type then
    raise exception 'META_CONNECTION_TYPE_MISMATCH' using errcode = 'P0001';
  end if;

  if coalesce(nullif(btrim(v_fb_conn.provider_account_id), ''), nullif(btrim(v_fb_conn.provider_page_id), ''))
     is distinct from btrim(p_facebook_page_id) then
    raise exception 'META_CONNECTION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_wants_instagram then
    select *
    into v_ig_conn
    from public.channel_connections
    where tenant_id = p_tenant_id
      and id = p_instagram_connection_id
    for update;

    if not found or v_ig_conn.provider <> 'INSTAGRAM'::channel_type then
      raise exception 'META_CONNECTION_TYPE_MISMATCH' using errcode = 'P0001';
    end if;

    if coalesce(nullif(btrim(v_ig_conn.provider_account_id), ''), nullif(btrim(v_ig_conn.provider_ig_account_id), ''))
       is distinct from btrim(p_instagram_professional_account_id) then
      raise exception 'META_CONNECTION_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  if coalesce(p_expected_credential_version, -1) = 0 then
    if p_credential_id is not null then
      raise exception 'META_ACTIVATION_INPUT_INVALID' using errcode = 'P0001';
    end if;

    select id
    into v_existing_active_id
    from public.meta_page_credentials
    where tenant_id = p_tenant_id
      and status = 'ACTIVE'::meta_page_credential_status
    limit 1
    for update;

    if v_existing_active_id is not null then
      raise exception 'META_ACTIVATION_CONFLICT' using errcode = 'P0001';
    end if;

    insert into public.meta_page_credentials (
      tenant_id,
      credential_family,
      provider_app_id,
      facebook_page_id,
      instagram_professional_account_id,
      encrypted_access_token,
      token_fingerprint,
      encryption_format_version,
      key_version,
      credential_version,
      status,
      verified_at,
      last_verified_at,
      granted_scopes,
      token_expires_at,
      data_access_expires_at,
      provider_token_type,
      verification_version
    )
    values (
      p_tenant_id,
      'META_PAGE_FACEBOOK_LOGIN'::meta_page_credential_family,
      btrim(p_provider_app_id),
      btrim(p_facebook_page_id),
      nullif(btrim(coalesce(p_instagram_professional_account_id, '')), ''),
      btrim(p_encrypted_access_token),
      btrim(p_token_fingerprint),
      'v1',
      1,
      1,
      'ACTIVE'::meta_page_credential_status,
      p_verified_at,
      p_verified_at,
      coalesce(p_granted_scopes, '{}'::text[]),
      p_token_expires_at,
      p_data_access_expires_at,
      btrim(p_provider_token_type),
      p_verification_version
    )
    returning id, credential_version into v_credential_id, v_credential_version;
  else
    if p_credential_id is null or p_expected_credential_version is null or p_expected_credential_version < 1 then
      raise exception 'META_ACTIVATION_INPUT_INVALID' using errcode = 'P0001';
    end if;

    update public.meta_page_credentials
    set
      encrypted_access_token = btrim(p_encrypted_access_token),
      token_fingerprint = btrim(p_token_fingerprint),
      provider_app_id = btrim(p_provider_app_id),
      facebook_page_id = btrim(p_facebook_page_id),
      instagram_professional_account_id = nullif(btrim(coalesce(p_instagram_professional_account_id, '')), ''),
      granted_scopes = coalesce(p_granted_scopes, '{}'::text[]),
      token_expires_at = p_token_expires_at,
      data_access_expires_at = p_data_access_expires_at,
      provider_token_type = btrim(p_provider_token_type),
      verification_version = p_verification_version,
      verified_at = p_verified_at,
      last_verified_at = p_verified_at,
      credential_version = p_expected_credential_version + 1,
      updated_at = v_now
    where tenant_id = p_tenant_id
      and id = p_credential_id
      and credential_version = p_expected_credential_version
      and status = 'ACTIVE'::meta_page_credential_status
    returning id, credential_version into v_credential_id, v_credential_version;

    if not found then
      raise exception 'META_CREDENTIAL_VERSION_CONFLICT' using errcode = 'P0001';
    end if;
  end if;

  update public.meta_page_credential_bindings
  set binding_status = 'DISABLED'::meta_page_binding_status, updated_at = v_now
  where tenant_id = p_tenant_id
    and channel_connection_id = p_facebook_connection_id
    and binding_status = 'ACTIVE'::meta_page_binding_status;

  if v_wants_instagram then
    update public.meta_page_credential_bindings
    set binding_status = 'DISABLED'::meta_page_binding_status, updated_at = v_now
    where tenant_id = p_tenant_id
      and channel_connection_id = p_instagram_connection_id
      and binding_status = 'ACTIVE'::meta_page_binding_status;
  end if;

  insert into public.meta_page_credential_bindings (
    tenant_id,
    credential_id,
    channel_connection_id,
    channel_type,
    binding_status,
    credential_version,
    activated_at
  )
  values (
    p_tenant_id,
    v_credential_id,
    p_facebook_connection_id,
    'FACEBOOK'::channel_type,
    'ACTIVE'::meta_page_binding_status,
    v_credential_version,
    v_now
  )
  returning id into v_fb_binding_id;

  if v_wants_instagram then
    insert into public.meta_page_credential_bindings (
      tenant_id,
      credential_id,
      channel_connection_id,
      channel_type,
      binding_status,
      credential_version,
      activated_at
    )
    values (
      p_tenant_id,
      v_credential_id,
      p_instagram_connection_id,
      'INSTAGRAM'::channel_type,
      'ACTIVE'::meta_page_binding_status,
      v_credential_version,
      v_now
    )
    returning id into v_ig_binding_id;
  end if;

  v_response := jsonb_build_object(
    'activationStatus', 'ACTIVATED_PENDING_HEALTH',
    'credentialId', v_credential_id,
    'credentialVersion', v_credential_version,
    'bindings', (
      case
        when v_wants_instagram then jsonb_build_array(
          jsonb_build_object(
            'channelType', 'FACEBOOK',
            'channelConnectionId', p_facebook_connection_id,
            'bindingId', v_fb_binding_id,
            'credentialVersion', v_credential_version
          ),
          jsonb_build_object(
            'channelType', 'INSTAGRAM',
            'channelConnectionId', p_instagram_connection_id,
            'bindingId', v_ig_binding_id,
            'credentialVersion', v_credential_version
          )
        )
        else jsonb_build_array(
          jsonb_build_object(
            'channelType', 'FACEBOOK',
            'channelConnectionId', p_facebook_connection_id,
            'bindingId', v_fb_binding_id,
            'credentialVersion', v_credential_version
          )
        )
      end
    ),
    'idempotencyReplay', false
  );

  update public.meta_page_credential_activation_requests
  set
    status = 'COMPLETED',
    credential_id = v_credential_id,
    credential_version = v_credential_version,
    response_json = v_response,
    completed_at = v_now,
    updated_at = v_now,
    error_code = null
  where tenant_id = p_tenant_id
    and idempotency_key = btrim(p_idempotency_key);

  return v_response;
end;
$$;

revoke all on function public.activate_meta_page_credential_tx(
  uuid, text, text, text, text, text, text, text, text, text[], timestamptz, timestamptz, text, integer, timestamptz, integer, uuid, uuid, uuid, text[]
) from public;

revoke all on function public.activate_meta_page_credential_tx(
  uuid, text, text, text, text, text, text, text, text, text[], timestamptz, timestamptz, text, integer, timestamptz, integer, uuid, uuid, uuid, text[]
) from anon;

revoke all on function public.activate_meta_page_credential_tx(
  uuid, text, text, text, text, text, text, text, text, text[], timestamptz, timestamptz, text, integer, timestamptz, integer, uuid, uuid, uuid, text[]
) from authenticated;

grant execute on function public.activate_meta_page_credential_tx(
  uuid, text, text, text, text, text, text, text, text, text[], timestamptz, timestamptz, text, integer, timestamptz, integer, uuid, uuid, uuid, text[]
) to service_role;

notify pgrst, 'reload schema';

commit;

-- Rollback notes (manual, not auto-applied):
-- revoke execute on function public.activate_meta_page_credential_tx(...) from service_role;
-- drop function if exists public.activate_meta_page_credential_tx(...);
-- drop table if exists public.meta_page_credential_activation_requests;
-- drop type if exists public.meta_page_credential_activation_request_status;
-- alter table public.meta_page_credentials drop column if exists granted_scopes, ...
