import type { MarketingEventRecord } from "../../domain/marketingEvents.js";
import {
  buildMarketingAutomationBridgeIdempotencyKey,
  type MarketingAutomationBridgeOutboxEnqueueResult
} from "../../domain/marketingAutomationBridgeOutbox.js";
import type { MarketingAutomationBridgeOutboxRepository } from "../../domain/ports.js";
import { mapMarketingEventToAutomationBridge } from "../../lib/marketingAutomationBridge.js";

export type EnqueueMarketingAutomationBridgeOutboxResult =
  | MarketingAutomationBridgeOutboxEnqueueResult
  | "skipped";

export class EnqueueMarketingAutomationBridgeOutboxUseCase {
  constructor(
    private readonly deps: {
      marketingAutomationBridgeOutboxRepository: MarketingAutomationBridgeOutboxRepository;
    }
  ) {}

  async execute(input: {
    marketingEvent: MarketingEventRecord;
  }): Promise<EnqueueMarketingAutomationBridgeOutboxResult> {
    const payload = mapMarketingEventToAutomationBridge(input.marketingEvent);
    if (!payload) {
      return "skipped";
    }

    return this.deps.marketingAutomationBridgeOutboxRepository.enqueueFromMarketingEvent({
      tenantId: input.marketingEvent.tenantId,
      marketingEventId: input.marketingEvent.id,
      eventType: payload.eventType,
      schemaVersion: payload.schemaVersion,
      payloadJson: payload,
      idempotencyKey: buildMarketingAutomationBridgeIdempotencyKey(
        input.marketingEvent.tenantId,
        input.marketingEvent.id
      )
    });
  }
}
