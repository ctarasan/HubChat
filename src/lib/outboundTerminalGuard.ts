import type { MessageDeliverySnapshot, MessageRepository } from "../domain/ports.js";
import {
  INTERNAL_CODE_OUTBOUND_IDEMPOTENCY_PENDING,
  INTERNAL_CODE_OUTBOUND_TERMINAL_GUARD,
  RetryableOutboundDeliveryError,
  TH_MSG_OUTBOUND_PROVIDER_GENERIC
} from "./outboundDeliveryError.js";

export function isOutboundMessageTerminal(
  snapshot: MessageDeliverySnapshot | null | undefined
): snapshot is MessageDeliverySnapshot & { deliveryStatus: "SENT" | "FAILED" } {
  return snapshot != null && (snapshot.deliveryStatus === "SENT" || snapshot.deliveryStatus === "FAILED");
}

export function outboundNonTerminalRetryableError(
  messageId: string,
  deliveryStatus: string | null | undefined,
  deliveryErrorCode: string = INTERNAL_CODE_OUTBOUND_TERMINAL_GUARD
): RetryableOutboundDeliveryError {
  return new RetryableOutboundDeliveryError(
    deliveryErrorCode,
    TH_MSG_OUTBOUND_PROVIDER_GENERIC,
    `Outbound message ${messageId} not terminal (delivery_status=${deliveryStatus ?? "missing"})`
  );
}

/**
 * Fail closed unless the message row is SENT or FAILED.
 * Used by OutboundWorker before queue.markDone.
 */
export async function assertOutboundMessageTerminalForQueueDone(
  messageRepository: MessageRepository | undefined,
  messageId: string
): Promise<void> {
  const read = messageRepository?.getDeliverySnapshot;
  if (!read) {
    throw outboundNonTerminalRetryableError(messageId, "snapshot_unavailable");
  }
  const snap = await read.call(messageRepository, messageId);
  if (!isOutboundMessageTerminal(snap)) {
    throw outboundNonTerminalRetryableError(messageId, snap?.deliveryStatus ?? null);
  }
}

/** Idempotency skip path: require snapshot reader; pending/non-terminal → retryable. */
export function assertIdempotencySkipHasDeliverySnapshot(
  messageRepository: MessageRepository,
  messageId: string
): void {
  if (!messageRepository.getDeliverySnapshot) {
    throw outboundNonTerminalRetryableError(
      messageId,
      "snapshot_unavailable",
      INTERNAL_CODE_OUTBOUND_IDEMPOTENCY_PENDING
    );
  }
}
