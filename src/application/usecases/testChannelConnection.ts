import type { ChannelSettingPublicDto, ChannelTestConnectionResponseDto, ChannelRuntimeConfig, SupportedChannelSettingChannel } from "../../domain/channelSettings.js";
import type { ChannelSettingRepository, ChannelConnectionRepository, InstagramOAuthCredentialRepository } from "../../domain/ports.js";
import {
  verifyChannelHealth,
  type ChannelHealthCheckOutcome,
  type FetchFn
} from "../../infrastructure/adapters/channels/channelHealthCheck.js";
import { sanitizeProviderErrorMessage } from "../../lib/sanitizeProviderError.js";
import {
  isOAuthManagedFacebookConnection,
  resolveFacebookRuntimeCredentialForTest
} from "../facebookOAuth/facebookOAuthRuntimeCredential.js";
import { isOAuthManagedInstagramConnection } from "../instagramOAuth/instagramOAuthRuntimeCredential.js";
import { tryInstagramOAuthTestConnection } from "../instagramOAuth/instagramOAuthTestConnection.js";

export type TestChannelConnectionInput = {
  tenantId: string;
  channel: SupportedChannelSettingChannel;
};

export type TestChannelConnectionDeps = {
  verifyChannelHealth?: (
    channel: SupportedChannelSettingChannel,
    runtime: ChannelRuntimeConfig,
    fetchFn?: FetchFn
  ) => Promise<ChannelHealthCheckOutcome>;
  fetchFn?: FetchFn;
  channelConnectionRepository?: ChannelConnectionRepository;
  instagramOAuthCredentialRepository?: InstagramOAuthCredentialRepository;
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

  private async verifyAndPersist(
    input: TestChannelConnectionInput,
    setting: ChannelSettingPublicDto,
    runtime: ChannelRuntimeConfig
  ): Promise<ChannelTestConnectionResponseDto> {
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

  private async tryOAuthManagedFacebookRuntime(
    input: TestChannelConnectionInput,
    setting: ChannelSettingPublicDto
  ): Promise<ChannelTestConnectionResponseDto | null> {
    if (input.channel !== "FACEBOOK" || !this.deps.channelConnectionRepository) {
      return null;
    }

    const connection = await this.deps.channelConnectionRepository.findByTenantAndProvider(
      input.tenantId,
      "FACEBOOK"
    );
    const credentialMetadata = connection
      ? await this.deps.channelConnectionRepository.listCredentialMetadataByConnection(
          input.tenantId,
          connection.id
        )
      : [];
    if (!isOAuthManagedFacebookConnection(connection, credentialMetadata)) {
      return null;
    }

    const resolved = await resolveFacebookRuntimeCredentialForTest({
      tenantId: input.tenantId,
      channelConnectionRepository: this.deps.channelConnectionRepository,
      channelSettingRepository: this.channelSettingRepository
    });
    if (!resolved.ok) {
      return buildResponse(
        input.channel,
        false,
        "ERROR",
        resolved.message,
        setting.lastVerifiedAt,
        resolved.message
      );
    }

    return this.verifyAndPersist(input, setting, resolved.resolved.runtime);
  }

  private async tryOAuthManagedInstagramRuntime(
    input: TestChannelConnectionInput,
    setting: ChannelSettingPublicDto
  ): Promise<ChannelTestConnectionResponseDto | null> {
    if (
      input.channel !== "INSTAGRAM" ||
      !this.deps.channelConnectionRepository ||
      !this.deps.instagramOAuthCredentialRepository
    ) {
      return null;
    }

    const connection = await this.deps.channelConnectionRepository.findByTenantAndProvider(
      input.tenantId,
      "INSTAGRAM"
    );
    const credentials = connection
      ? await this.deps.instagramOAuthCredentialRepository.findByConnection({
          tenantId: input.tenantId,
          channelConnectionId: connection.id
        })
      : [];

    if (!isOAuthManagedInstagramConnection(connection, credentials)) {
      return null;
    }

    const legacyRuntime = await this.channelSettingRepository.getRuntimeConfigForConnectionTest({
      tenantId: input.tenantId,
      channel: "INSTAGRAM"
    });
    const legacyConfigured = Boolean(
      setting.configured && legacyRuntime?.secrets.accessToken?.trim()
    );
    if (legacyConfigured) {
      return buildResponse(
        input.channel,
        false,
        "ERROR",
        "Instagram connection auth configuration is ambiguous.",
        setting.lastVerifiedAt,
        "Ambiguous configuration."
      );
    }

    const outcome = await tryInstagramOAuthTestConnection(
      { tenantId: input.tenantId },
      {
        channelConnectionRepository: this.deps.channelConnectionRepository,
        instagramOAuthCredentialRepository: this.deps.instagramOAuthCredentialRepository
      }
    );
    if (outcome.kind === "NOT_OAUTH_MANAGED") {
      return null;
    }
    return outcome.response;
  }

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

    const oauthManagedResult = await this.tryOAuthManagedFacebookRuntime(input, setting);
    if (oauthManagedResult) {
      return oauthManagedResult;
    }

    const oauthInstagramResult = await this.tryOAuthManagedInstagramRuntime(input, setting);
    if (oauthInstagramResult) {
      return oauthInstagramResult;
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

    return this.verifyAndPersist(input, setting, runtime);
  }
}
