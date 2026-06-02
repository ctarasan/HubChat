-- Phase II: durable profile avatar cache on contact_identities (Meta/LINE CDN URLs expire).
alter table contact_identities add column if not exists profile_image_cached_path text null;
alter table contact_identities add column if not exists profile_image_cached_at timestamptz null;
alter table contact_identities add column if not exists profile_image_cache_status text null;
alter table contact_identities add column if not exists profile_image_source_url_hash text null;

alter table contact_identities drop constraint if exists contact_identities_profile_image_cache_status_valid;
alter table contact_identities add constraint contact_identities_profile_image_cache_status_valid check (
  profile_image_cache_status is null
  or profile_image_cache_status in ('pending', 'ok', 'failed', 'skipped')
);

comment on column contact_identities.profile_image_cached_path is 'Supabase Storage object path (profile-avatars bucket), not a full URL.';
comment on column contact_identities.profile_image_cache_status is 'pending|ok|failed|skipped';
