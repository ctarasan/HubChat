import type { IdempotencyPort } from "../../../domain/ports.js";

export class NoopIdempotency implements IdempotencyPort {
  async hasProcessed(_scope: string, _key: string): Promise<boolean> {
    return false;
  }

  async markProcessed(_scope: string, _key: string): Promise<void> {}
}
