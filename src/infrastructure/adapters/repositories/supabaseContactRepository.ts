import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelType, Contact } from "../../../domain/entities.js";
import type { ContactRepository } from "../../../domain/ports.js";

function mapContact(row: any): Contact {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    displayName: row.display_name,
    profileImageUrl: row.profile_image_url ?? null,
    phone: row.phone,
    email: row.email,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

export class SupabaseContactRepository implements ContactRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private sanitizeDisplayName(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private sanitizeProfileImageUrl(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private profileImageFromProfile(profile?: {
    name?: string;
    phone?: string;
    email?: string;
    avatarUrl?: string;
    profileImageUrl?: string;
  }): string | null {
    return this.sanitizeProfileImageUrl(profile?.profileImageUrl ?? profile?.avatarUrl);
  }

  async getOrCreateByIdentity(input: {
    tenantId: string;
    channel: ChannelType;
    externalUserId: string;
    profile?: { name?: string; phone?: string; email?: string; avatarUrl?: string; profileImageUrl?: string };
  }): Promise<Contact> {
    const existing = await this.lookupByIdentity(input.tenantId, input.channel, input.externalUserId);
    if (existing) return existing;

    const incomingImage = this.profileImageFromProfile(input.profile);

    const { data: contactRow, error: createContactError } = await this.supabase
      .from("contacts")
      .insert({
        tenant_id: input.tenantId,
        display_name: input.profile?.name ?? null,
        phone: input.profile?.phone ?? null,
        email: input.profile?.email ?? null,
        profile_image_url: incomingImage
      })
      .select("*")
      .single();
    if (createContactError) throw createContactError;

    const contact = mapContact(contactRow);
    const { error: identityError } = await this.supabase.from("contact_identities").upsert(
      {
        tenant_id: input.tenantId,
        contact_id: contact.id,
        channel_type: input.channel,
        external_user_id: input.externalUserId,
        display_name: input.profile?.name ?? null,
        profile_image_url: incomingImage,
        profile_json: input.profile ?? {}
      },
      { onConflict: "tenant_id,channel_type,external_user_id" }
    );

    if (!identityError) return contact;

    const fallback = await this.lookupByIdentity(input.tenantId, input.channel, input.externalUserId);
    if (fallback) return fallback;
    throw identityError;
  }

  async upsertIdentityProfile(input: {
    tenantId: string;
    channel: ChannelType;
    externalUserId: string;
    displayName?: string | null;
    profileImageUrl?: string | null;
    profile?: {
      name?: string;
      phone?: string;
      email?: string;
      avatarUrl?: string;
      profileImageUrl?: string;
    };
  }): Promise<{ contactId: string | null; displayName: string | null; profileImageUrl: string | null }> {
    const incomingName = this.sanitizeDisplayName(input.displayName ?? input.profile?.name);
    const incomingImage =
      this.sanitizeProfileImageUrl(input.profileImageUrl) ?? this.profileImageFromProfile(input.profile);

    const { data: identityRow, error: identityError } = await this.supabase
      .from("contact_identities")
      .select("contact_id,display_name,profile_json,profile_image_url")
      .eq("tenant_id", input.tenantId)
      .eq("channel_type", input.channel)
      .eq("external_user_id", input.externalUserId)
      .maybeSingle();
    if (identityError) throw identityError;

    if (!identityRow) {
      const mergedProfile = {
        ...(input.profile ?? {}),
        ...(incomingName ? { name: incomingName } : {}),
        ...(incomingImage ? { profileImageUrl: incomingImage } : {})
      };
      await this.getOrCreateByIdentity({
        tenantId: input.tenantId,
        channel: input.channel,
        externalUserId: input.externalUserId,
        profile: mergedProfile
      });
      const { data: insertedIdentity, error: insertedErr } = await this.supabase
        .from("contact_identities")
        .select("contact_id,display_name,profile_image_url")
        .eq("tenant_id", input.tenantId)
        .eq("channel_type", input.channel)
        .eq("external_user_id", input.externalUserId)
        .maybeSingle();
      if (insertedErr) throw insertedErr;
      return {
        contactId: insertedIdentity?.contact_id ? String(insertedIdentity.contact_id) : null,
        displayName: this.sanitizeDisplayName(insertedIdentity?.display_name ?? incomingName),
        profileImageUrl: this.sanitizeProfileImageUrl(insertedIdentity?.profile_image_url as string | null) ?? incomingImage
      };
    }

    const existingIdentityName = this.sanitizeDisplayName(identityRow.display_name);
    const existingIdentityImage = this.sanitizeProfileImageUrl(identityRow.profile_image_url as string | null);
    const mergedProfile = { ...((identityRow.profile_json ?? {}) as Record<string, unknown>), ...(input.profile ?? {}) };
    const resolvedName = incomingName ?? existingIdentityName;
    const resolvedImage = incomingImage ?? existingIdentityImage;

    const identityPatch: Record<string, unknown> = {
      profile_json: mergedProfile,
      updated_at: new Date().toISOString()
    };
    if (incomingName) {
      identityPatch.display_name = incomingName;
    }
    if (incomingImage) {
      identityPatch.profile_image_url = incomingImage;
    }

    const { error: updateIdentityError } = await this.supabase
      .from("contact_identities")
      .update(identityPatch)
      .eq("tenant_id", input.tenantId)
      .eq("channel_type", input.channel)
      .eq("external_user_id", input.externalUserId);
    if (updateIdentityError) throw updateIdentityError;

    if (identityRow.contact_id && incomingName) {
      const { data: contactRow, error: contactLookupError } = await this.supabase
        .from("contacts")
        .select("display_name")
        .eq("id", identityRow.contact_id)
        .eq("tenant_id", input.tenantId)
        .maybeSingle();
      if (contactLookupError) throw contactLookupError;
      const existingContactName = this.sanitizeDisplayName(contactRow?.display_name);
      if (existingContactName !== incomingName) {
        const { error: contactUpdateError } = await this.supabase
          .from("contacts")
          .update({ display_name: incomingName, updated_at: new Date().toISOString() })
          .eq("id", identityRow.contact_id)
          .eq("tenant_id", input.tenantId);
        if (contactUpdateError) throw contactUpdateError;
      }
    }

    if (identityRow.contact_id && incomingImage) {
      const { error: contactImgErr } = await this.supabase
        .from("contacts")
        .update({ profile_image_url: incomingImage, updated_at: new Date().toISOString() })
        .eq("id", identityRow.contact_id)
        .eq("tenant_id", input.tenantId);
      if (contactImgErr) throw contactImgErr;
    }

    return {
      contactId: identityRow.contact_id ? String(identityRow.contact_id) : null,
      displayName: resolvedName,
      profileImageUrl: resolvedImage
    };
  }

  private async lookupByIdentity(tenantId: string, channel: ChannelType, externalUserId: string): Promise<Contact | null> {
    const { data: identityRow, error: identityError } = await this.supabase
      .from("contact_identities")
      .select("contact_id")
      .eq("tenant_id", tenantId)
      .eq("channel_type", channel)
      .eq("external_user_id", externalUserId)
      .maybeSingle();
    if (identityError) throw identityError;
    if (!identityRow?.contact_id) return null;

    const { data: contactRow, error: contactError } = await this.supabase
      .from("contacts")
      .select("*")
      .eq("id", identityRow.contact_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (contactError) throw contactError;
    return contactRow ? mapContact(contactRow) : null;
  }
}
