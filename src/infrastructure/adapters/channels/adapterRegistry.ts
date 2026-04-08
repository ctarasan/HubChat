import type { ChannelType } from "../../../domain/entities.js";
import type { ChannelAdapter } from "../../../domain/ports.js";

export class ChannelAdapterRegistry {
  private readonly map = new Map<ChannelType, ChannelAdapter>();

  register(adapter: ChannelAdapter): void {
    this.map.set(adapter.channel, adapter);
  }

  get(channel: ChannelType): ChannelAdapter {
    const adapter = this.map.get(channel);
    if (!adapter) throw new Error(`Adapter not found for channel: ${channel}`);
    return adapter;
  }
}
