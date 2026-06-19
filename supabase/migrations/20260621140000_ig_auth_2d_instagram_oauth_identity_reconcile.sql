-- IG-AUTH-2E.6C: idempotent reconciliation for IG-AUTH-2D identity columns.
-- Safe when 20260621120000 recorded the 2E.3 file instead of 2D, or when 2D was skipped.
-- Duplicate ADD COLUMN / constraint reconciliation is intentional.

begin;

alter table instagram_oauth_credentials
  add column if not exists verified_username text null,
  add column if not exists verified_account_type text null,
  add column if not exists identity_verified_at timestamptz null;

alter table instagram_oauth_credentials
  drop constraint if exists instagram_oauth_credentials_verified_account_type_scope;

alter table instagram_oauth_credentials
  add constraint instagram_oauth_credentials_verified_account_type_scope check (
    verified_account_type is null
    or verified_account_type in ('BUSINESS', 'CREATOR')
  );

notify pgrst, 'reload schema';

commit;
