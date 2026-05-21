import type { ChannelRuntimeConfig, SupportedChannelSettingChannel } from "../../domain/channelSettings.js";
import type { ChannelSettingRepository } from "../../domain/ports.js";

export type GetChannelRuntimeConfigInput = {
  tenantId: string;
  channel: SupportedChannelSettingChannel;
};

/** Backend-only resolver; not exposed through HTTP routes. */
export async function getRuntimeConfig(
  channelSettingRepository: ChannelSettingRepository,
  input: GetChannelRuntimeConfigInput
): Promise<ChannelRuntimeConfig | null> {
  return channelSettingRepository.getRuntimeConfig(input);
}
