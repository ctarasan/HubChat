import type { InstagramProfessionalAccountId } from "../domain/instagramIdentity.js";
import { asInstagramMessagingScopedUserId } from "../domain/instagramIdentity.js";

const IGSID_PATTERN = /^\d+$/;

export class InstagramOAuthTextDeliveryValidationError extends Error {
  override readonly name = "InstagramOAuthTextDeliveryValidationError";

  constructor(
    message: string,
    readonly code:
      | "RECIPIENT_UNAVAILABLE"
      | "CONFIGURATION_AMBIGUOUS"
      | "DELIVERY_FAILED_TERMINAL"
  ) {
    super(message);
  }
}

export function validateInstagramOAuthTextMessage(input: { messageText: string }): string {
  const trimmed = input.messageText.trim();
  if (!trimmed.length) {
    throw new InstagramOAuthTextDeliveryValidationError(
      "Instagram OAuth DM text cannot be empty.",
      "DELIVERY_FAILED_TERMINAL"
    );
  }
  const bytes = new TextEncoder().encode(trimmed).length;
  if (bytes > 1000) {
    throw new InstagramOAuthTextDeliveryValidationError(
      "Instagram DM message text must be at most 1000 bytes (UTF-8).",
      "DELIVERY_FAILED_TERMINAL"
    );
  }
  return trimmed;
}

export function validateInstagramOAuthTextRecipient(input: {
  recipientMessagingScopedUserId: string;
  senderProfessionalAccountId?: InstagramProfessionalAccountId | string;
}): ReturnType<typeof asInstagramMessagingScopedUserId> {
  const raw = input.recipientMessagingScopedUserId.trim();
  if (!raw) {
    throw new InstagramOAuthTextDeliveryValidationError(
      "Instagram OAuth DM recipient is required.",
      "RECIPIENT_UNAVAILABLE"
    );
  }
  if (raw.includes("@")) {
    throw new InstagramOAuthTextDeliveryValidationError(
      "Instagram OAuth DM recipient must be a messaging-scoped user ID, not a username.",
      "RECIPIENT_UNAVAILABLE"
    );
  }
  if (!IGSID_PATTERN.test(raw)) {
    throw new InstagramOAuthTextDeliveryValidationError(
      "Instagram OAuth DM recipient must be a numeric messaging-scoped user ID.",
      "RECIPIENT_UNAVAILABLE"
    );
  }
  const senderId = typeof input.senderProfessionalAccountId === "string"
    ? input.senderProfessionalAccountId.trim()
    : "";
  if (senderId && senderId === raw) {
    throw new InstagramOAuthTextDeliveryValidationError(
      "Instagram OAuth DM recipient cannot be the professional account sender ID.",
      "CONFIGURATION_AMBIGUOUS"
    );
  }
  return asInstagramMessagingScopedUserId(raw);
}
