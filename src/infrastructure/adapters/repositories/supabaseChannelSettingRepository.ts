import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelSettingSafeDto, SupportedChannelSettingChannel, UpdateChannelSettingInput } from "../../../domain/channelSettings.js";
import type { ChannelSettingRepository } from "../../../domain/ports.js";
import {
  assertSafeConfigJson,
  buildSecretsConfiguredMeta,
  mergeChannelSecrets
} from "../../../lib/channelSettingSecrets.js";
import { throwIfSupabaseError } from "../../../lib/supabasePostgrestError.js";

const SAFE_LIST_SELECT =
  "id,tenant_id,channel,enabled,display_name,config_json,secret_fingerprint_json,created_at,updated_at";

const INTERNAL_SELECT = `${SAFE_LIST_SELECT},secret_json`;

type DbRow = {
  id: string;
  tenant_id: string;
  channel: string;
  enabled: boolean;
  display_name: string | null;
  config_json: Record<string, unknown>;
  secret_fingerprint_json: Record<string, unknown>;
  secret_json?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function toSafeDto(row: DbRow): ChannelSettingSafeDto {
  const channel = row.channel as SupportedChannelSettingChannel;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    channel,
    enabled: Boolean(row.enabled),
    displayName: row.display_name,
    configJson: assertSafeConfigJson(row.config_json ?? {}),
    secretsConfigured: buildSecretsConfiguredMeta(channel, row.secret_fingerprint_json ?? {}),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

export class SupabaseChannelSettingRepository implements ChannelSettingRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listByTenant(tenantId: string): Promise<ChannelSettingSafeDto[]> {
    const { data, error } = await this.supabase
      .from("channel_settings")
      .select(SAFE_LIST_SELECT)
      .eq("tenant_id", tenantId)
      .order("channel", { ascending: true });
    throwIfSupabaseError(error);
    return (data ?? []).map((row) => toSafeDto(row as DbRow));
  }

  async findByTenantAndChannel(
    tenantId: string,
    channel: SupportedChannelSettingChannel
  ): Promise<ChannelSettingSafeDto | null> {
    const { data, error } = await this.supabase
      .from("channel_settings")
      .select(SAFE_LIST_SELECT)
      .eq("tenant_id", tenantId)
      .eq("channel", channel)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return toSafeDto(data as DbRow);
  }

  private async findInternal(tenantId: string, channel: SupportedChannelSettingChannel): Promise<DbRow | null> {
    const { data, error } = await this.supabase
      .from("channel_settings")
      .select(INTERNAL_SELECT)
      .eq("tenant_id", tenantId)
      .eq("channel", channel)
      .maybeSingle();
    throwIfSupabaseError(error);
    return (data as DbRow | null) ?? null;
  }

  async upsertForTenant(input: UpdateChannelSettingInput): Promise<ChannelSettingSafeDto> {
    const existing = await this.findInternal(input.tenantId, input.channel);
    const nowIso = new Date().toISOString();

    const configJson =
      input.configJson !== undefined
        ? assertSafeConfigJson(input.configJson)
        : assertSafeConfigJson(existing?.config_json ?? {});

    const { secretJson, secretFingerprintJson } = mergeChannelSecrets(
      input.channel,
      existing?.secret_json ?? {},
      input.secretsPatch,
      input.clearSecretKeys
    );

    const payload = {
      tenant_id: input.tenantId,
      channel: input.channel,
      enabled: input.enabled !== undefined ? input.enabled : (existing?.enabled ?? false),
      display_name: input.displayName !== undefined ? input.displayName : (existing?.display_name ?? null),
      config_json: configJson,
      secret_json: secretJson,
      secret_fingerprint_json: secretFingerprintJson,
      updated_at: nowIso
    };

    const { data, error } = await this.supabase
      .from("channel_settings")
      .upsert(payload, { onConflict: "tenant_id,channel" })
      .select(SAFE_LIST_SELECT)
      .single();
    throwIfSupabaseError(error);
    return toSafeDto(data as DbRow);
  }
}
