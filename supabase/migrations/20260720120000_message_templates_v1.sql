-- Message Templates V1: personal reusable templates per tenant + auth user.
-- Additive only. No seed data. No changes to messages/conversations tables.
-- Isolation is enforced in the application layer (service role); RLS enabled without policies (defense in depth).

begin;

create table if not exists message_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  owner_user_id uuid not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_templates_title_len check (char_length(btrim(title)) between 1 and 120),
  constraint message_templates_body_len check (char_length(body) between 1 and 10000)
);

create index if not exists idx_message_templates_owner_updated
  on message_templates (tenant_id, owner_user_id, updated_at desc);

alter table message_templates enable row level security;

notify pgrst, 'reload schema';

commit;
