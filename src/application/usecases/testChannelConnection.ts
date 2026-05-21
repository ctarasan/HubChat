import type {
  ChannelSettingPublicDto,
  ChannelTestConnectionResponseDto,
  SupportedChannelSettingChannel
} from "../../domain/channelSettings.js";
import type { ChannelSettingRepository } from "../../domain/ports.js";
import {
  verifyChannelHealth,
  type ChannelHealthCheckOutcome,
  type FetchFn
} from "../../infrastructure/adapters/channels/channelHealthCheck.js";
import { sanitizeProviderErrorMessage } from "../../lib/sanitizeProviderError.js";

export type TestChannelConnectionInput = {
  tenantId: string;
  channel: SupportedChannelSettingChannel;
};

export type TestChannelConnectionDeps = {
  verifyChannelHealth?: (
    channel: SupportedChannelSettingChannel,
    runtime: NonNullable<Awaited<ReturnType<ChannelSettingRepository["getRuntimeConfigForConnectionTest"]>>>,
    fetchFn?: FetchFn
  ) => Promise<ChannelHealthCheckOutcome>;
  fetchFn?: FetchFn;
};

function buildResponse(
  channel: SupportedChannelSettingChannel,
  ok: boolean,
  status: ChannelTestConnectionResponseDto["status"],
  message: string,
  lastVerifiedAt: string | null,
  lastError: string | null
): ChannelTestConnectionResponseDto {
  return { channel, ok, status, message, lastVerifiedAt, lastError };
}

export class TestChannelConnectionUseCase {
  constructor(
    private readonly channelSettingRepository: ChannelSettingRepository,
    private readonly deps: TestChannelConnectionDeps = {}
  ) {}

  async execute(input: TestChannelConnectionInput): Promise<ChannelTestConnectionResponseDto> {
    const setting: ChannelSettingPublicDto | null = await this.channelSettingRepository.findByTenantAndChannel(
      input.tenantId,
      input.channel
    );

    if (!setting?.enabled) {
      return buildResponse(
        input.channel,
        false,
        "DISABLED",
        "Channel is disabled.",
        setting?.lastVerifiedAt ?? null,
        setting?.lastError ?? null
      );
    }

    if (!setting.configured) {
      return buildResponse(
        input.channel,
        false,
        "NOT_CONFIGURED",
        "Required secrets or configuration are missing.",
        setting.lastVerifiedAt,
        setting.lastError
      );
    }

    const runtime = await this.channelSettingRepository.getRuntimeConfigForConnectionTest({
      tenantId: input.tenantId,
      channel: input.channel
    });

    if (!runtime) {
      return buildResponse(
        input.channel,
        false,
        "NOT_CONFIGURED",
        "Required secrets or configuration are missing.",
        setting.lastVerifiedAt,
        setting.lastError
      );
    }

    const verify = this.deps.verifyChannelHealth ?? verifyChannelHealth;
    const outcome = await verify(input.channel, runtime, this.deps.fetchFn);

    if (outcome.ok) {
      const lastVerifiedAt = new Date().toISOString();
      await this.channelSettingRepository.updateConnectionHealth({
        tenantId: input.tenantId,
        channel: input.channel,
        lastVerifiedAt,
        lastError: null,
        providerPageId: outcome.metadata?.providerPageId ?? undefined,
        providerAccountName: outcome.metadata?.providerAccountName ?? undefined
      });
      return buildResponse(input.channel, true, "READY", outcome.message, lastVerifiedAt, null);
    }

    const lastError = sanitizeProviderErrorMessage(outcome.message);
    await this.channelSettingRepository.updateConnectionHealth({
      tenantId: input.tenantId,
      channel: input.channel,
      lastError
    });
    return buildResponse(input.channel, false, "ERROR", lastError, setting.lastVerifiedAt, lastError);
  }
}
