import pino from "pino";
import type { OutboundMessageRequestedPayload } from "../domain/events.js";
import type { QueuePort } from "../domain/ports.js";
import { SendOutboundMessageUseCase } from "../application/usecases/sendOutboundMessage.js";

const logger = pino({ name: "outbound-worker" });

export class OutboundWorker {
  constructor(
    private readonly queue: QueuePort,
    private readonly useCase: SendOutboundMessageUseCase
  ) {}

  async runOnce(): Promise<void> {
    await this.queue.consume<OutboundMessageRequestedPayload>(
      "message.outbound.requested",
      async (event) => {
        await this.useCase.execute(event);
        logger.info({ event }, "Outbound message sent");
      }
    );
  }

  async runForever(intervalMs = 500): Promise<void> {
    while (true) {
      try {
        await this.runOnce();
      } catch (error) {
        logger.error({ err: error }, "Outbound worker loop failed");
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}
