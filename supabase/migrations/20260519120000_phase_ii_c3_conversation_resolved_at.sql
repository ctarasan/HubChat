-- Phase II-C3: ensure writable RESOLVED/ARCHIVED lifecycle columns exist on deployed DBs.
-- Code paths (updateConversationStatus, inbox list select) reference conversations.resolved_at.
-- Enum values are idempotent with 20260512180000_phase_ii_c1_status_enums.sql.

begin;

alter type conversation_status add value if not exists 'RESOLVED';
alter type conversation_status add value if not exists 'ARCHIVED';

alter table conversations add column if not exists resolved_at timestamptz null;

notify pgrst, 'reload schema';

commit;
