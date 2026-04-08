import type { ChannelType } from "../../../domain/entities.js";
import type { RateLimiterPort } from "../../../domain/ports.js";

export class NoopRateLimiter implements RateLimiterPort {
  async checkOrThrow(_tenantId: string, _channel: ChannelType): Promise<void> {}
}
