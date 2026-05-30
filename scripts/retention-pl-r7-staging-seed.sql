-- PL-R7-A staging/local ONLY — retention raw payload redaction rehearsal seeds.
-- NOT a migration. Do NOT run on production.
-- Edit placeholders before use. Requires existing tenant and schema from master migrations.
--
-- See: docs/hubchat-retention-pl-r7-staging-rehearsal-plan.md

-- =============================================================================
-- CONFIG — set these for your staging/local rehearsal tenant
-- =============================================================================
-- :tenant_id        — uuid of disposable test tenant
-- :archived_conv_id — uuid for ARCHIVED conversation (C-A)
-- :open_conv_id     — uuid for OPEN conversation (C-OPEN)
-- :lead_id          — optional uuid if conversations.lead_id is required

-- Example (replace with real UUIDs):
-- \set tenant_id '00000000-0000-0000-0000-000000000001'

-- Cutoff: rows must be older than 90-day raw payload policy; use 120 days for buffer.
-- eligible_ts  = now() - interval '120 days'
-- recent_ts    = now() - interval '7 days'

-- =============================================================================
-- W1 — eligible webhook (old, non-empty payload_json)
-- =============================================================================
-- insert into webhook_events (tenant_id, received_at, payload_json, ...)
-- values (
--   :tenant_id,
--   now() - interval '120 days',
--   '{"rehearsal":"pl-r7","slot":"W1"}'::jsonb
-- );

-- =============================================================================
-- W2 — control webhook (recent, non-empty payload_json) — must NOT redact
-- =============================================================================
-- insert into webhook_events (...)
-- values (:tenant_id, now() - interval '7 days', '{"rehearsal":"pl-r7","slot":"W2"}'::jsonb);

-- =============================================================================
-- W3 — control webhook (old, already redacted) — must NOT change
-- =============================================================================
-- insert into webhook_events (...)
-- values (:tenant_id, now() - interval '120 days', '{}'::jsonb);

-- =============================================================================
-- C-A — ARCHIVED conversation (parent for M1, M2, M4)
-- =============================================================================
-- insert into conversations (id, tenant_id, status, resolved_at, channel_type, ...)
-- values (
--   :archived_conv_id, :tenant_id, 'ARCHIVED',
--   now() - interval '200 days', 'LINE'
-- );

-- =============================================================================
-- C-OPEN — OPEN conversation (parent for M3) — execute must NOT redact M3
-- =============================================================================
-- insert into conversations (id, tenant_id, status, channel_type, ...)
-- values (:open_conv_id, :tenant_id, 'OPEN', 'LINE');

-- =============================================================================
-- M1 — eligible message (archived conv, old created_at, non-empty raw_payload)
-- =============================================================================
-- insert into messages (tenant_id, conversation_id, created_at, raw_payload, body, ...)
-- values (
--   :tenant_id, :archived_conv_id,
--   now() - interval '120 days',
--   '{"rehearsal":"pl-r7","slot":"M1"}'::jsonb,
--   'PL-R7 control body text — must remain after execute'
-- );

-- =============================================================================
-- M2 — control message (archived conv, recent created_at) — must NOT redact
-- =============================================================================
-- insert into messages (...)
-- values (
--   :tenant_id, :archived_conv_id, now() - interval '7 days',
--   '{"rehearsal":"pl-r7","slot":"M2"}'::jsonb, 'M2 body unchanged'
-- );

-- =============================================================================
-- M3 — control message (OPEN conv, old created_at) — must NOT redact
-- =============================================================================
-- insert into messages (...)
-- values (
--   :tenant_id, :open_conv_id, now() - interval '120 days',
--   '{"rehearsal":"pl-r7","slot":"M3"}'::jsonb, 'M3 body unchanged'
-- );

-- =============================================================================
-- M4 — optional: same as M1 with media_url set — verify media_url unchanged post-execute
-- =============================================================================

-- =============================================================================
-- CLEANUP (optional, after rehearsal)
-- =============================================================================
-- delete from messages where tenant_id = :tenant_id and raw_payload @> '{"rehearsal":"pl-r7"}';
-- delete from webhook_events where tenant_id = :tenant_id and payload_json @> '{"rehearsal":"pl-r7"}';
-- delete from conversations where id in (:archived_conv_id, :open_conv_id);
