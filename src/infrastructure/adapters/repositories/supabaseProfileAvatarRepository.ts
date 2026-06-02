import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileAvatarIdentityRow } from "../../media/profileAvatarCacheService.js";
import type { ProfileAvatarCacheStatus } from "../../../lib/profileAvatarCacheCommon.js";

export class SupabaseProfileAvatarRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findIdentityForCache(tenantId: string, contactIdentityId: string): Promise<ProfileAvatarIdentityRow | null> {
    const { data, error } = await this.supabase
      .from("contact_identities")
      .select(
        "id,tenant_id,contact_id,profile_image_url,profile_image_cached_path,profile_image_cache_status,profile_image_source_url_hash"
      )
      .eq("tenant_id", tenantId)
      .eq("id", contactIdentityId)
      .maybeSingle();
    if (error) throw error;
    return data as ProfileAvatarIdentityRow | null;
  }

  async findIdentityIdByChannelExternalUser(input: {
    tenantId: string;
    channel: string;
    externalUserId: string;
  }): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("contact_identities")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("channel_type", input.channel)
      .eq("external_user_id", input.externalUserId)
      .maybeSingle();
    if (error) throw error;
    return data?.id ? String(data.id) : null;
  }

  async updateIdentityCacheFields(input: {
    tenantId: string;
    contactIdentityId: string;
    status: ProfileAvatarCacheStatus;
    cachedPath?: string | null;
    cachedAt?: Date | null;
    sourceUrlHash?: string | null;
  }): Promise<void> {
    const patch: Record<string, unknown> = {
      profile_image_cache_status: input.status,
      updated_at: new Date().toISOString()
    };
    if (input.cachedPath !== undefined) patch.profile_image_cached_path = input.cachedPath;
    if (input.cachedAt !== undefined) {
      patch.profile_image_cached_at = input.cachedAt ? input.cachedAt.toISOString() : null;
    }
    if (input.sourceUrlHash !== undefined) patch.profile_image_source_url_hash = input.sourceUrlHash;

    const { error } = await this.supabase
      .from("contact_identities")
      .update(patch)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.contactIdentityId);
    if (error) throw error;
  }

  async markIdentityPending(input: {
    tenantId: string;
    contactIdentityId: string;
    sourceUrlHash: string;
  }): Promise<void> {
    await this.updateIdentityCacheFields({
      tenantId: input.tenantId,
      contactIdentityId: input.contactIdentityId,
      status: "pending",
      sourceUrlHash: input.sourceUrlHash
    });
  }

  async denormalizeCachedAvatar(input: {
    tenantId: string;
    contactId: string;
    publicUrl: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    const { error: contactError } = await this.supabase
      .from("contacts")
      .update({ profile_image_url: input.publicUrl, updated_at: now })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.contactId);
    if (contactError) throw contactError;

    const { error: convError } = await this.supabase
      .from("conversations")
      .update({ participant_profile_image_url: input.publicUrl, updated_at: now })
      .eq("tenant_id", input.tenantId)
      .eq("contact_id", input.contactId);
    if (convError) throw convError;
  }
}
