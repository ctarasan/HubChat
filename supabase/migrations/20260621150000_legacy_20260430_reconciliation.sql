-- IG-AUTH-2E.6I: Legacy 20260430 Option B reconciliation (repository-only).
--
-- Idempotently ensures both historical 20260430 effects:
--   20260430_add_conversation_ids_to_outbound_function.sql
--   20260430_reclassify_invalid_facebook_dm_threads.sql
--
-- This migration is NOT evidence that those two files were independently recorded
-- in remote migration history. It is a unique modern reconciliation point that
-- safely ensures both historical effects before migration-history repair.
--
-- Does not modify supabase_migrations.schema_migrations.

begin;

-- Function effect: reconcile to current final outbound RPC (includes conversationIds
-- from April 20260430 and instagramCredentialBinding from 20260621130000).
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
  p_height int default null,
  p_instagram_credential_binding jsonb default null
)
returns table (message_id uuid)
language plpgsql
as $$
declare
  v_message_id uuid;
  v_message_type text := upper(coalesce(p_message_type, 'TEXT'));
  v_metadata jsonb := '{}'::jsonb;
  v_outbox_payload jsonb;
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

  v_outbox_payload := jsonb_build_object(
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
  );

  if p_instagram_credential_binding is not null then
    v_outbox_payload := jsonb_set(
      v_outbox_payload,
      '{instagramCredentialBinding}',
      p_instagram_credential_binding,
      true
    );
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
    'message.outbound.requested',
    v_outbox_payload,
    concat('outbound:', p_tenant_id::text, ':', v_message_id::text),
    'PENDING',
    now()
  );

  return query select v_message_id;
end;
$$;

-- Data effect: exact historical invalid Facebook DM reclassification predicate.
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
