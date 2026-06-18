-- IG-AUTH-2D: verified professional identity metadata on OAuth credentials (additive only).

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
