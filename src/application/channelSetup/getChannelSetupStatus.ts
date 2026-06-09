import { buildChannelSetupStatusList, type ChannelSetupStatusListDto } from "../../domain/channelSetupStatus.js";
import type { ChannelConnectionRepository, ChannelSettingRepository } from "../../domain/ports.js";

export async function getChannelSetupStatus(input: {
  tenantId: string;
  channelSettingRepository: Pick<ChannelSettingRepository, "listByTenant">;
  channelConnectionRepository: Pick<ChannelConnectionRepository, "listByTenant">;
}): Promise<ChannelSetupStatusListDto> {
  const [settings, connections] = await Promise.all([
    input.channelSettingRepository.listByTenant(input.tenantId),
    input.channelConnectionRepository.listByTenant(input.tenantId)
  ]);

  return buildChannelSetupStatusList({ settings, connections });
}
