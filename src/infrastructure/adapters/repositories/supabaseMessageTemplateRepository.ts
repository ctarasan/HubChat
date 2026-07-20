import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageTemplateDto } from "../../../domain/messageTemplates.js";
import { toMessageTemplateDto, type MessageTemplateRecord } from "../../../domain/messageTemplates.js";
import type { MessageTemplateRepository } from "../../../domain/messageTemplateRepository.js";
import { MESSAGE_TEMPLATE_LIST_LIMIT } from "../../../domain/messageTemplates.js";
import { throwIfSupabaseError } from "../../../lib/supabasePostgrestError.js";

type DbRow = {
  id: string;
  tenant_id: string;
  owner_user_id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
};

const SELECT_COLS = "id,tenant_id,owner_user_id,title,body,created_at,updated_at";

function mapRow(row: DbRow): MessageTemplateRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    ownerUserId: row.owner_user_id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toDto(row: DbRow): MessageTemplateDto {
  return toMessageTemplateDto(mapRow(row));
}

export class SupabaseMessageTemplateRepository implements MessageTemplateRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listByOwner(input: {
    tenantId: string;
    ownerUserId: string;
    limit?: number;
  }): Promise<MessageTemplateDto[]> {
    const limit = Math.min(
      Math.max(1, typeof input.limit === "number" ? Math.floor(input.limit) : MESSAGE_TEMPLATE_LIST_LIMIT),
      MESSAGE_TEMPLATE_LIST_LIMIT
    );
    const { data, error } = await this.supabase
      .from("message_templates")
      .select(SELECT_COLS)
      .eq("tenant_id", input.tenantId)
      .eq("owner_user_id", input.ownerUserId)
      .order("updated_at", { ascending: false })
      .order("title", { ascending: true })
      .limit(limit);
    throwIfSupabaseError(error);
    return (data ?? []).map((row) => toDto(row as DbRow));
  }

  async getByIdForOwner(input: {
    tenantId: string;
    ownerUserId: string;
    id: string;
  }): Promise<MessageTemplateDto | null> {
    const { data, error } = await this.supabase
      .from("message_templates")
      .select(SELECT_COLS)
      .eq("id", input.id)
      .eq("tenant_id", input.tenantId)
      .eq("owner_user_id", input.ownerUserId)
      .maybeSingle();
    throwIfSupabaseError(error);
    if (!data) return null;
    return toDto(data as DbRow);
  }

  async create(input: {
    tenantId: string;
    ownerUserId: string;
    title: string;
    body: string;
  }): Promise<MessageTemplateDto> {
    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .from("message_templates")
      .insert({
        tenant_id: input.tenantId,
        owner_user_id: input.ownerUserId,
        title: input.title,
        body: input.body,
        created_at: now,
        updated_at: now
      })
      .select(SELECT_COLS)
      .single();
    throwIfSupabaseError(error);
    return toDto(data as DbRow);
  }

  async update(input: {
    tenantId: string;
    ownerUserId: string;
    id: string;
    title: string;
    body: string;
  }): Promise<MessageTemplateDto | null> {
    const { data, error } = await this.supabase
      .from("message_templates")
      .update({
        title: input.title,
        body: input.body,
        updated_at: new Date().toISOString()
      })
      .eq("id", input.id)
      .eq("tenant_id", input.tenantId)
      .eq("owner_user_id", input.ownerUserId)
      .select(SELECT_COLS)
      .maybeSingle();
    throwIfSupabaseError(error);
    if (!data) return null;
    return toDto(data as DbRow);
  }

  async delete(input: {
    tenantId: string;
    ownerUserId: string;
    id: string;
  }): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("message_templates")
      .delete()
      .eq("id", input.id)
      .eq("tenant_id", input.tenantId)
      .eq("owner_user_id", input.ownerUserId)
      .select("id")
      .maybeSingle();
    throwIfSupabaseError(error);
    return Boolean(data);
  }
}
