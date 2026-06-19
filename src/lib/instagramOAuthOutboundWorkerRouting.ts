import type { OutboundMessageRequestedPayload } from "../domain/events.js";
import type { InstagramCredentialBinding } from "../domain/instagramOAuthOutboundContract.js";
import { isInstagramOAuthOutboundImageEnabled } from "./instagramOAuthOutboundImageFlags.js";
import { isInstagramOAuthOutboundTextEnabled } from "./instagramOAuthOutboundTextFlags.js";
import {
  isConnectionBoundInstagramOAuthBinding,
  parseInstagramCredentialBindingFromPayload
} from "./instagramOAuthOutboundQueueContract.js";
import { InstagramOAuthImageDeliveryError } from "./instagramOAuthImageDeliveryErrors.js";
import { InstagramOAuthTextDeliveryError } from "./instagramOAuthTextDeliveryErrors.js";
import { mapInstagramOAuthTextDeliveryError } from "./instagramOAuthTextDeliveryErrors.js";
import { isInstagramOAuthWorkerRoutingEnabled } from "./instagramOAuthWorkerRoutingFlags.js";

export type InstagramOutboundJobClass =
  | "LEGACY_INSTAGRAM_JOB"
  | "OAUTH_INSTAGRAM_JOB"
  | "NON_INSTAGRAM_JOB"
  | "INVALID_OR_AMBIGUOUS_JOB";

export type InstagramOAuthWorkerDeliveryFailure = {
  internalCode: string;
  userFacingMessage: string;
  technicalSummary: string;
  retryable: boolean;
};

const OAUTH_WORKER_ROUTING_DISABLED =
  "Instagram OAuth worker routing is disabled. Enable routing flags before OAuth delivery.";
const OAUTH_BINDING_INVALID = "Instagram outbound queue binding is invalid or ambiguous.";
const OAUTH_MESSAGE_KIND_MISMATCH = "Instagram OAuth queue binding message kind does not match payload.";

export function classifyInstagramOutboundJob(
  payload: OutboundMessageRequestedPayload
): InstagramOutboundJobClass {
  if (payload.channel !== "INSTAGRAM") return "NON_INSTAGRAM_JOB";

  let binding: InstagramCredentialBinding | null;
  try {
    binding = parseInstagramCredentialBindingFromPayload(payload as unknown as Record<string, unknown>);
  } catch {
    return "INVALID_OR_AMBIGUOUS_JOB";
  }

  if (isConnectionBoundInstagramOAuthBinding(binding)) return "OAUTH_INSTAGRAM_JOB";
  if (binding === null || binding.mode === "LEGACY") return "LEGACY_INSTAGRAM_JOB";
  return "INVALID_OR_AMBIGUOUS_JOB";
}

export function parseOAuthInstagramCredentialBinding(
  payload: OutboundMessageRequestedPayload
): Extract<InstagramCredentialBinding, { mode: "CONNECTION_BOUND" }> | null {
  const binding = parseInstagramCredentialBindingFromPayload(payload as unknown as Record<string, unknown>);
  return isConnectionBoundInstagramOAuthBinding(binding) ? binding : null;
}

export function assertOAuthInstagramWorkerRoutingEnabled(
  binding: Extract<InstagramCredentialBinding, { mode: "CONNECTION_BOUND" }>,
  env: Record<string, string | undefined> = process.env
): InstagramOAuthWorkerDeliveryFailure | null {
  if (!isInstagramOAuthWorkerRoutingEnabled(env)) {
    return {
      internalCode: "OAUTH_WORKER_ROUTING_DISABLED",
      userFacingMessage: OAUTH_WORKER_ROUTING_DISABLED,
      technicalSummary: OAUTH_WORKER_ROUTING_DISABLED,
      retryable: false
    };
  }

  if (binding.messageKind === "TEXT" && !isInstagramOAuthOutboundTextEnabled(env)) {
    return {
      internalCode: "OAUTH_OUTBOUND_TEXT_DISABLED",
      userFacingMessage: "Instagram OAuth text outbound is disabled.",
      technicalSummary: "Instagram OAuth text outbound is disabled.",
      retryable: false
    };
  }

  if (binding.messageKind === "IMAGE" && !isInstagramOAuthOutboundImageEnabled(env)) {
    return {
      internalCode: "OAUTH_OUTBOUND_IMAGE_DISABLED",
      userFacingMessage: "Instagram OAuth image outbound is disabled.",
      technicalSummary: "Instagram OAuth image outbound is disabled.",
      retryable: false
    };
  }

  return null;
}

export function oauthBindingMatchesPayloadMessageType(
  binding: Extract<InstagramCredentialBinding, { mode: "CONNECTION_BOUND" }>,
  payload: OutboundMessageRequestedPayload
): boolean {
  const messageType = payload.messageType ?? "TEXT";
  if (binding.messageKind === "TEXT") return messageType === "TEXT";
  if (binding.messageKind === "IMAGE") return messageType === "IMAGE";
  return false;
}

export function mapInstagramOAuthWorkerDeliveryFailure(error: unknown): InstagramOAuthWorkerDeliveryFailure {
  if (error instanceof InstagramOAuthTextDeliveryError) {
    const failure = error.failure;
    return {
      internalCode: failure.code,
      userFacingMessage: failure.message,
      technicalSummary: failure.message,
      retryable: failure.retryable
    };
  }
  if (error instanceof InstagramOAuthImageDeliveryError) {
    const failure = error.failure;
    return {
      internalCode: failure.code,
      userFacingMessage: failure.message,
      technicalSummary: failure.message,
      retryable: failure.retryable
    };
  }

  const mapped = mapInstagramOAuthTextDeliveryError(error);
  return {
    internalCode: mapped.code,
    userFacingMessage: mapped.message,
    technicalSummary: mapped.message,
    retryable: mapped.retryable
  };
}

export function invalidOAuthBindingFailure(): InstagramOAuthWorkerDeliveryFailure {
  return {
    internalCode: "OAUTH_BINDING_INVALID",
    userFacingMessage: OAUTH_BINDING_INVALID,
    technicalSummary: OAUTH_BINDING_INVALID,
    retryable: false
  };
}

export function oauthMessageKindMismatchFailure(): InstagramOAuthWorkerDeliveryFailure {
  return {
    internalCode: "OAUTH_MESSAGE_KIND_MISMATCH",
    userFacingMessage: OAUTH_MESSAGE_KIND_MISMATCH,
    technicalSummary: OAUTH_MESSAGE_KIND_MISMATCH,
    retryable: false
  };
}
