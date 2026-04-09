import pino from "pino";
import type { InboundMessageNormalizedPayload } from "../domain/events.js";
import type { QueuePort } from "../domain/ports.js";
import { ProcessInboundMessageUseCase } from "../application/usecases/processInboundMessage.js";

const logger = pino({ name: "inbound-worker" });

export class InboundWorker {
  constructor(
    private readonly queue: QueuePort,
    private readonly useCase: ProcessInboundMessageUseCase
  ) {}

  async runOnce(): Promise<void> {
    await this.queue.consume<InboundMessageNormalizedPayload>(
      "message.inbound.normalized",
      async (event) => {
        await this.useCase.execute(event);
        logger.info(
          {
            tenantId: event.tenantId,
            channel: event.channel,
            externalUserId: event.externalUserId,
            externalMessageId: event.externalMessageId
          },
          "Inbound message processed"
        );
      }
    );
  }

  async runForever(intervalMs = 500): Promise<void> {
    while (true) {
      try {
        await this.runOnce();
      } catch (error) {
        logger.error(
          { err: error instanceof Error ? { message: error.message, name: error.name } : String(error) },
          "Inbound worker loop failed"
        );
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}
