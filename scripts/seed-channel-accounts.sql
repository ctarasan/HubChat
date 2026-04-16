-- Seed omni-channel account rows for one tenant.
-- Update v_tenant_name if needed. If tenant does not exist, script creates it.

do $$
declare
  v_tenant_id uuid;
  v_tenant_name text := 'HUB Chat Default Tenant';
begin
  select id into v_tenant_id
  from tenants
  where name = v_tenant_name
  limit 1;

  if v_tenant_id is null then
    insert into tenants (name)
    values (v_tenant_name)
    returning id into v_tenant_id;
  end if;

  insert into channel_accounts (
    tenant_id,
    channel,
    external_account_id,
    display_name,
    credential_ref,
    metadata_json,
    is_active
  )
  values
    (v_tenant_id, 'LINE', 'line-oa-main', 'LINE Official Account', 'secret://line/main', '{"region":"th"}'::jsonb, true),
    (v_tenant_id, 'FACEBOOK', 'fb-page-main', 'Facebook Page', 'secret://facebook/page-main', '{"business":"main"}'::jsonb, true),
    (v_tenant_id, 'INSTAGRAM', 'ig-business-main', 'Instagram Business', 'secret://instagram/business-main', '{}'::jsonb, true),
    (v_tenant_id, 'TIKTOK', 'tiktok-shop-main', 'TikTok Shop', 'secret://tiktok/shop-main', '{}'::jsonb, true),
    (v_tenant_id, 'SHOPEE', 'shopee-shop-main', 'Shopee Store', 'secret://shopee/shop-main', '{}'::jsonb, true),
    (v_tenant_id, 'LAZADA', 'lazada-shop-main', 'Lazada Store', 'secret://lazada/shop-main', '{}'::jsonb, true)
  on conflict (tenant_id, channel, external_account_id) do update
  set
    display_name = excluded.display_name,
    credential_ref = excluded.credential_ref,
    metadata_json = excluded.metadata_json,
    is_active = excluded.is_active,
    updated_at = now();
end $$;
