import type { ChannelSettingPublicDto, UpdateChannelSettingInput } from "../../domain/channelSettings.js";
import type { ChannelSettingRepository } from "../../domain/ports.js";
import {
  normalizeClearSecretKeys,
  normalizeIncomingSecretsPatch
} from "../../lib/channelSettingApiSecrets.js";

export class UpsertChannelSettingUseCase {
  constructor(private readonly channelSettingRepository: ChannelSettingRepository) {}

  async execute(input: UpdateChannelSettingInput): Promise<ChannelSettingPublicDto> {
    const secretsPatch = normalizeIncomingSecretsPatch(input.channel, input.secretsPatch);
    const clearSecretKeys = normalizeClearSecretKeys(
      input.channel,
      input.clearSecrets,
      input.legacyClearSecretKeys
    );

    const providerAccountName =
      input.providerAccountName !== undefined
        ? input.providerAccountName
        : input.displayName !== undefined
          ? input.displayName
          : undefined;

    return this.channelSettingRepository.upsertForTenant({
      tenantId: input.tenantId,
      channel: input.channel,
      enabled: input.enabled,
      displayName: input.displayName,
      configJson: input.configJson,
      providerPageId: input.providerPageId,
      providerAccountName,
      secretsPatch,
      clearSecretKeys
    });
  }
}
