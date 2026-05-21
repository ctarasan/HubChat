import type { ChannelSettingPublicDto, UpdateChannelSettingInput } from "../../domain/channelSettings.js";
import type { ChannelSettingRepository } from "../../domain/ports.js";
import {
  normalizeApiClearSecrets,
  normalizeApiSecretsPatch
} from "../../lib/channelSettingApiSecrets.js";

export class UpsertChannelSettingUseCase {
  constructor(private readonly channelSettingRepository: ChannelSettingRepository) {}

  async execute(input: UpdateChannelSettingInput): Promise<ChannelSettingPublicDto> {
    const secretsPatch = normalizeApiSecretsPatch(input.channel, input.secretsPatch);
    const clearSecretKeys = normalizeApiClearSecrets(input.channel, input.clearSecrets);

    return this.channelSettingRepository.upsertForTenant({
      tenantId: input.tenantId,
      channel: input.channel,
      enabled: input.enabled,
      providerPageId: input.providerPageId,
      providerAccountName: input.providerAccountName,
      secretsPatch,
      clearSecretKeys
    });
  }
}
