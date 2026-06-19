import type { InstagramOAuthResolverErrorClassification } from "../domain/instagramOAuthOutboundContract.js";
import { InstagramOAuthMessagingError } from "../infrastructure/adapters/meta/instagramOAuthMessagingClient.js";
import { isInstagramOAuthOutboundImageEnabled } from "./instagramOAuthOutboundImageFlags.js";
import { InstagramOAuthImageDeliveryValidationError } from "./instagramOAuthImageDeliveryValidation.js";
import { InstagramOAuthTextDeliveryValidationError } from "./instagramOAuthTextDeliveryValidation.js";
import {
  InstagramOAuthConfigurationError,
  InstagramOAuthCredentialExpiredError,
  InstagramOAuthCredentialReauthRequiredError,
  InstagramOAuthCredentialUnavailableError,
  InstagramOAuthResolverError,
  InstagramOAuthRuntimeDisabledError
} from "./instagramOAuthResolverErrors.js";

export type InstagramOAuthImageDeliveryErrorCode =
  | "OAUTH_IMAGE_DISABLED"
  | "OAUTH_RUNTIME_DISABLED"
  | "CHANNEL_CONNECTION_REQUIRED"
  | "CREDENTIAL_NOT_FOUND"
  | "REAUTH_REQUIRED"
  | "TOKEN_EXPIRED"
  | "TOKEN_REVOKED"
  | "PERMISSION_MISSING"
  | "RECIPIENT_UNAVAILABLE"
  | "MESSAGE_WINDOW_CLOSED"
  | "IMAGE_URL_INVALID"
  | "IMAGE_URL_UNAVAILABLE"
  | "UNSUPPORTED_MEDIA"
  | "MEDIA_TOO_LARGE"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_CONTRACT_ERROR"
  | "DELIVERY_FAILED_RETRYABLE"
  | "DELIVERY_FAILED_TERMINAL"
  | "CONFIGURATION_AMBIGUOUS";

export type InstagramOAuthImageDeliveryFailure = {
  code: InstagramOAuthImageDeliveryErrorCode;
  message: string;
  retryable: boolean;
  classification: InstagramOAuthResolverErrorClassification | "retryable" | "terminal_delivery";
  logFields: Record<string, string | number | boolean | null>;
};

export class InstagramOAuthImageDeliveryError extends Error {
  override readonly name = "InstagramOAuthImageDeliveryError";

  constructor(public readonly failure: InstagramOAuthImageDeliveryFailure) {
    super(failure.message);
  }
}

function buildFailure(
  code: InstagramOAuthImageDeliveryErrorCode,
  message: string,
  retryable: boolean,
  classification: InstagramOAuthImageDeliveryFailure["classification"],
  logFields: InstagramOAuthImageDeliveryFailure["logFields"] = {}
): InstagramOAuthImageDeliveryFailure {
  return { code, message, retryable, classification, logFields };
}

export function mapInstagramOAuthImageDeliveryError(error: unknown): InstagramOAuthImageDeliveryFailure {
  if (error instanceof InstagramOAuthImageDeliveryError) {
    return error.failure;
  }

  if (error instanceof InstagramOAuthImageDeliveryValidationError) {
    return buildFailure(error.code, error.message, false, "terminal_delivery");
  }

  if (error instanceof InstagramOAuthTextDeliveryValidationError) {
    const code =
      error.code === "CONFIGURATION_AMBIGUOUS"
        ? "CONFIGURATION_AMBIGUOUS"
        : "RECIPIENT_UNAVAILABLE";
    return buildFailure(code, error.message, false, "terminal_delivery");
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
      case "UNSUPPORTED_MEDIA":
        return buildFailure("UNSUPPORTED_MEDIA", error.message, false, "terminal_delivery", {
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
    "Instagram OAuth image delivery failed.",
    false,
    "terminal_delivery"
  );
}

function isRuntimeFlagExplicitlyEnabled(env: Record<string, string | undefined>): boolean {
  const raw = env.HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function assertInstagramOAuthOutboundImageEnabled(env: Record<string, string | undefined>): void {
  if (!isInstagramOAuthOutboundImageEnabled(env)) {
    throw new InstagramOAuthImageDeliveryError(
      buildFailure(
        isRuntimeFlagExplicitlyEnabled(env) ? "OAUTH_IMAGE_DISABLED" : "OAUTH_RUNTIME_DISABLED",
        isRuntimeFlagExplicitlyEnabled(env)
          ? "Instagram OAuth outbound image delivery is disabled."
          : "Instagram OAuth runtime is disabled.",
        false,
        "feature_disabled"
      )
    );
  }
}
