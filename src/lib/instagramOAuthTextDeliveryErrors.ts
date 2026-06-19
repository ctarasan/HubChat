import type { InstagramOAuthResolverErrorClassification } from "../domain/instagramOAuthOutboundContract.js";
import { InstagramOAuthMessagingError } from "../infrastructure/adapters/meta/instagramOAuthMessagingClient.js";
import { isInstagramOAuthOutboundTextEnabled } from "./instagramOAuthOutboundTextFlags.js";
import { InstagramOAuthTextDeliveryValidationError } from "./instagramOAuthTextDeliveryValidation.js";
import {
  InstagramOAuthConfigurationError,
  InstagramOAuthCredentialExpiredError,
  InstagramOAuthCredentialReauthRequiredError,
  InstagramOAuthCredentialUnavailableError,
  InstagramOAuthResolverError,
  InstagramOAuthRuntimeDisabledError
} from "./instagramOAuthResolverErrors.js";

export type InstagramOAuthTextDeliveryErrorCode =
  | "OAUTH_RUNTIME_DISABLED"
  | "OAUTH_OUTBOUND_TEXT_DISABLED"
  | "CHANNEL_CONNECTION_REQUIRED"
  | "CREDENTIAL_NOT_FOUND"
  | "REAUTH_REQUIRED"
  | "TOKEN_EXPIRED"
  | "TOKEN_REVOKED"
  | "PERMISSION_MISSING"
  | "RECIPIENT_UNAVAILABLE"
  | "MESSAGE_WINDOW_CLOSED"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_CONTRACT_ERROR"
  | "DELIVERY_FAILED_RETRYABLE"
  | "DELIVERY_FAILED_TERMINAL"
  | "CONFIGURATION_AMBIGUOUS";

export type InstagramOAuthTextDeliveryFailure = {
  code: InstagramOAuthTextDeliveryErrorCode;
  message: string;
  retryable: boolean;
  classification: InstagramOAuthResolverErrorClassification | "retryable" | "terminal_delivery";
  /** Safe operator log fields only — no tokens, raw provider bodies, or recipient text. */
  logFields: Record<string, string | number | boolean | null>;
};

export class InstagramOAuthTextDeliveryError extends Error {
  override readonly name = "InstagramOAuthTextDeliveryError";

  constructor(public readonly failure: InstagramOAuthTextDeliveryFailure) {
    super(failure.message);
  }
}

function buildFailure(
  code: InstagramOAuthTextDeliveryErrorCode,
  message: string,
  retryable: boolean,
  classification: InstagramOAuthTextDeliveryFailure["classification"],
  logFields: InstagramOAuthTextDeliveryFailure["logFields"] = {}
): InstagramOAuthTextDeliveryFailure {
  return { code, message, retryable, classification, logFields };
}

export function mapInstagramOAuthTextDeliveryError(error: unknown): InstagramOAuthTextDeliveryFailure {
  if (error instanceof InstagramOAuthTextDeliveryError) {
    return error.failure;
  }

  if (error instanceof InstagramOAuthTextDeliveryValidationError) {
    return buildFailure(error.code, error.message, false, "terminal_delivery");
  }

  if (error instanceof InstagramOAuthRuntimeDisabledError) {
    return buildFailure("OAUTH_RUNTIME_DISABLED", error.message, false, "feature_disabled");
  }

  if (error instanceof InstagramOAuthCredentialReauthRequiredError) {
    return buildFailure("REAUTH_REQUIRED", error.message, false, "reauth_required");
  }

  if (error instanceof InstagramOAuthCredentialExpiredError) {
    return buildFailure("TOKEN_EXPIRED", error.message, false, "reauth_required");
  }

  if (error instanceof InstagramOAuthCredentialUnavailableError) {
    return buildFailure("CREDENTIAL_NOT_FOUND", error.message, false, "terminal_configuration");
  }

  if (error instanceof InstagramOAuthConfigurationError) {
    return buildFailure("CONFIGURATION_AMBIGUOUS", error.message, false, "terminal_configuration");
  }

  if (error instanceof InstagramOAuthResolverError) {
    if (error.code === "CREDENTIAL_UNAVAILABLE") {
      return buildFailure("CREDENTIAL_NOT_FOUND", error.message, false, error.classification);
    }
    if (error.code === "CONFIGURATION_ERROR") {
      return buildFailure("CONFIGURATION_AMBIGUOUS", error.message, false, error.classification);
    }
    if (error.classification === "retryable") {
      return buildFailure("DELIVERY_FAILED_RETRYABLE", error.message, true, "retryable");
    }
    return buildFailure("DELIVERY_FAILED_TERMINAL", error.message, false, error.classification);
  }

  if (error instanceof InstagramOAuthMessagingError) {
    switch (error.code) {
      case "REAUTH_REQUIRED":
        return buildFailure("REAUTH_REQUIRED", error.message, false, "reauth_required", {
          httpStatus: error.statusCode ?? null
        });
      case "TOKEN_REVOKED":
        return buildFailure("TOKEN_REVOKED", error.message, false, "reauth_required", {
          httpStatus: error.statusCode ?? null
        });
      case "PERMISSION_MISSING":
        return buildFailure("PERMISSION_MISSING", error.message, false, "terminal_delivery", {
          httpStatus: error.statusCode ?? null
        });
      case "RECIPIENT_UNAVAILABLE":
        return buildFailure("RECIPIENT_UNAVAILABLE", error.message, false, "terminal_delivery", {
          httpStatus: error.statusCode ?? null
        });
      case "MESSAGE_WINDOW_CLOSED":
        return buildFailure("MESSAGE_WINDOW_CLOSED", error.message, false, "terminal_delivery", {
          httpStatus: error.statusCode ?? null
        });
      case "RATE_LIMITED":
        return buildFailure("RATE_LIMITED", error.message, true, "retryable", {
          httpStatus: error.statusCode ?? null
        });
      case "PROVIDER_UNAVAILABLE":
        return buildFailure("PROVIDER_UNAVAILABLE", error.message, true, "retryable", {
          httpStatus: error.statusCode ?? null
        });
      case "PROVIDER_CONTRACT_ERROR":
        return buildFailure("PROVIDER_CONTRACT_ERROR", error.message, false, "terminal_delivery", {
          httpStatus: error.statusCode ?? null
        });
      case "DELIVERY_FAILED_RETRYABLE":
        return buildFailure("DELIVERY_FAILED_RETRYABLE", error.message, true, "retryable", {
          httpStatus: error.statusCode ?? null
        });
      default:
        return buildFailure("DELIVERY_FAILED_TERMINAL", error.message, false, "terminal_delivery", {
          httpStatus: error.statusCode ?? null
        });
    }
  }

  return buildFailure(
    "DELIVERY_FAILED_TERMINAL",
    "Instagram OAuth text delivery failed.",
    false,
    "terminal_delivery"
  );
}

export function assertInstagramOAuthOutboundTextEnabled(env: Record<string, string | undefined>): void {
  if (!isInstagramOAuthOutboundTextEnabled(env)) {
    const runtimeDisabled =
      env.HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED?.trim().toLowerCase() !== "true" &&
      env.HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED?.trim() !== "1" &&
      env.HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED?.trim().toLowerCase() !== "yes" &&
      env.HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED?.trim().toLowerCase() !== "on";
    throw new InstagramOAuthTextDeliveryError(
      buildFailure(
        runtimeDisabled ? "OAUTH_RUNTIME_DISABLED" : "OAUTH_OUTBOUND_TEXT_DISABLED",
        runtimeDisabled
          ? "Instagram OAuth runtime is disabled."
          : "Instagram OAuth outbound text delivery is disabled.",
        false,
        "feature_disabled"
      )
    );
  }
}
