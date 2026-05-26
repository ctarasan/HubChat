import pino from "pino";
import type { CreateMarketingEventInput } from "../../domain/marketingEvents.js";
import type { MarketingEventRepository } from "../../domain/ports.js";

const logger = pino({ name: "marketing-event-recorder" });

/** Best-effort insert; never throws to callers (preserves primary flows). */
export async function recordMarketingEventSafe(
  repository: MarketingEventRepository | undefined,
  input: CreateMarketingEventInput
): Promise<void> {
  if (!repository) return;
  try {
    await repository.insert(input);
  } catch (error) {
    logger.warn(
      {
        tenantId: input.tenantId,
        eventType: input.eventType,
        conversationId: input.conversationId ?? null,
        leadId: input.leadId ?? null,
        err: String(error)
      },
      "marketing_events insert failed"
    );
  }
}
