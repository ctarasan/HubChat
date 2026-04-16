import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelType, Contact } from "../../../domain/entities.js";
import type { ContactRepository } from "../../../domain/ports.js";

function mapContact(row: any): Contact {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    displayName: row.display_name,
    phone: row.phone,
    email: row.email,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

export class SupabaseContactRepository implements ContactRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getOrCreateByIdentity(input: {
    tenantId: string;
    channel: ChannelType;
    externalUserId: string;
    profile?: { name?: string; phone?: string; email?: string };
  }): Promise<Contact> {
    const existing = await this.lookupByIdentity(input.tenantId, input.channel, input.externalUserId);
    if (existing) return existing;

    const { data: contactRow, error: createContactError } = await this.supabase
      .from("contacts")
      .insert({
        tenant_id: input.tenantId,
        display_name: input.profile?.name ?? null,
        phone: input.profile?.phone ?? null,
        email: input.profile?.email ?? null
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
        profile_json: input.profile ?? {}
      },
      { onConflict: "tenant_id,channel_type,external_user_id" }
    );

    if (!identityError) return contact;

    const fallback = await this.lookupByIdentity(input.tenantId, input.channel, input.externalUserId);
    if (fallback) return fallback;
    throw identityError;
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
