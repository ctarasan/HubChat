-- META-FB-POSTAPP-1C: OAuth transaction intent + expected Page pin for re-authorize.

begin;

alter table oauth_transactions
  add column if not exists intent text not null default 'CONNECT';

alter table oauth_transactions
  add column if not exists expected_page_id text null;

do $$
begin
  alter table oauth_transactions
    add constraint oauth_transactions_intent_check
    check (intent in ('CONNECT', 'RECONNECT', 'REAUTHORIZE'));
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_oauth_transactions_intent
  on oauth_transactions (intent);

notify pgrst, 'reload schema';

commit;
