import type { ChannelSettingSafeDto, UpdateChannelSettingInput } from "../../domain/channelSettings.js";
import type { ChannelSettingRepository } from "../../domain/ports.js";
import { assertSafeConfigJson, validateSecretsPatch } from "../../lib/channelSettingSecrets.js";

export class UpsertChannelSettingUseCase {
  constructor(private readonly channelSettingRepository: ChannelSettingRepository) {}

  async execute(input: UpdateChannelSettingInput): Promise<ChannelSettingSafeDto> {
    if (input.configJson !== undefined) {
      assertSafeConfigJson(input.configJson);
    }
    validateSecretsPatch(input.channel, input.secretsPatch, input.clearSecretKeys);
    return this.channelSettingRepository.upsertForTenant(input);
  }
}
