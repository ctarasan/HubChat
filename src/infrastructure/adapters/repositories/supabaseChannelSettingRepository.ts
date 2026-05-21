import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ChannelRuntimeConfig,
  ChannelSettingPublicDto,
  SupportedChannelSettingChannel,
  UpdateChannelSettingInput
} from "../../../domain/channelSettings.js";
import type { ChannelSettingRepository } from "../../../domain/ports.js";
import {
  assertSafeConfigJson,
  mergeChannelConfigJson,
  mergeChannelSecrets
} from "../../../lib/channelSettingSecrets.js";
import { resolveChannelRuntimeConfig, toChannelSettingPublicDto } from "../../../lib/channelSettingPublicDto.js";
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

export class SupabaseChannelSettingRepository implements ChannelSettingRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listByTenant(tenantId: string): Promise<ChannelSettingPublicDto[]> {
    const { data, error } = await this.supabase
      .from("channel_settings")
      .select(SAFE_LIST_SELECT)
      .eq("tenant_id", tenantId)
      .order("channel", { ascending: true });
    throwIfSupabaseError(error);
    return (data ?? []).map((row) => toChannelSettingPublicDto(row as DbRow));
  }

  async findByTenantAndChannel(
    tenantId: string,
    channel: SupportedChannelSettingChannel
  ): Promise<ChannelSettingPublicDto | null> {
    const { data, error } = await this.supabase
      .from("channel_settings")
      .select(SAFE_LIST_SELECT)
      .eq("tenant_id", tenantId)
      .eq("channel", channel)
      .maybeSingle();
    throwIfSupabaseError(error);
    if (!data) return null;
    return toChannelSettingPublicDto(data as DbRow);
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

  async getRuntimeConfig(input: {
    tenantId: string;
    channel: SupportedChannelSettingChannel;
  }): Promise<ChannelRuntimeConfig | null> {
    const row = await this.findInternal(input.tenantId, input.channel);
    if (!row) return null;
    return resolveChannelRuntimeConfig(input.tenantId, row);
  }

  async upsertForTenant(input: UpdateChannelSettingInput): Promise<ChannelSettingPublicDto> {
    const existing = await this.findInternal(input.tenantId, input.channel);
    const nowIso = new Date().toISOString();

    const configJson = mergeChannelConfigJson(assertSafeConfigJson(existing?.config_json ?? {}), {
      configJson: input.configJson,
      providerPageId: input.providerPageId,
      providerAccountName: input.providerAccountName
    });

    const { secretJson, secretFingerprintJson } = mergeChannelSecrets(
      input.channel,
      existing?.secret_json ?? {},
      input.secretsPatch,
      input.clearSecretKeys
    );

    const displayName =
      input.displayName !== undefined
        ? input.displayName
        : input.providerAccountName !== undefined
          ? input.providerAccountName
          : (existing?.display_name ?? null);

    const payload = {
      tenant_id: input.tenantId,
      channel: input.channel,
      enabled: input.enabled !== undefined ? input.enabled : (existing?.enabled ?? false),
      display_name: displayName,
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
    return toChannelSettingPublicDto(data as DbRow);
  }
}
