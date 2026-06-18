import type { InstagramOAuthResolverErrorClassification } from "../domain/instagramOAuthOutboundContract.js";

export class InstagramOAuthResolverError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly classification: InstagramOAuthResolverErrorClassification
  ) {
    super(message);
    this.name = "InstagramOAuthResolverError";
  }
}

export class InstagramConnectionBindingMissingError extends InstagramOAuthResolverError {
  override readonly name = "InstagramConnectionBindingMissingError";
  constructor() {
    super("Instagram OAuth connection binding is required", "CONNECTION_BINDING_MISSING", "terminal_configuration");
  }
}

export class InstagramConnectionNotFoundError extends InstagramOAuthResolverError {
  override readonly name = "InstagramConnectionNotFoundError";
  constructor() {
    super("Instagram channel connection not found", "CONNECTION_NOT_FOUND", "terminal_configuration");
  }
}

export class InstagramConnectionProviderMismatchError extends InstagramOAuthResolverError {
  override readonly name = "InstagramConnectionProviderMismatchError";
  constructor() {
    super("Channel connection provider mismatch for Instagram OAuth", "CONNECTION_PROVIDER_MISMATCH", "terminal_configuration");
  }
}

export class InstagramOAuthCredentialNotReadyError extends InstagramOAuthResolverError {
  override readonly name = "InstagramOAuthCredentialNotReadyError";
  constructor() {
    super("Instagram OAuth credential is not ready for delivery", "CREDENTIAL_NOT_READY", "terminal_configuration");
  }
}

export class InstagramOAuthCredentialReauthRequiredError extends InstagramOAuthResolverError {
  override readonly name = "InstagramOAuthCredentialReauthRequiredError";
  constructor() {
    super("Instagram OAuth credential requires reauthorization", "REAUTH_REQUIRED", "reauth_required");
  }
}

export class InstagramOAuthCredentialTemporarilyUnavailableError extends InstagramOAuthResolverError {
  override readonly name = "InstagramOAuthCredentialTemporarilyUnavailableError";
  constructor() {
    super("Instagram OAuth credential is temporarily unavailable", "CREDENTIAL_TEMPORARILY_UNAVAILABLE", "retryable");
  }
}

export class InstagramOAuthCredentialExpiredError extends InstagramOAuthResolverError {
  override readonly name = "InstagramOAuthCredentialExpiredError";
  constructor() {
    super("Instagram OAuth access token has expired", "CREDENTIAL_EXPIRED", "reauth_required");
  }
}

export class InstagramOAuthCredentialDecryptError extends InstagramOAuthResolverError {
  override readonly name = "InstagramOAuthCredentialDecryptError";
  constructor() {
    super("Instagram OAuth credential could not be decrypted", "CREDENTIAL_DECRYPT_FAILED", "terminal_configuration");
  }
}

export class InstagramOAuthDeliveryPathMismatchError extends InstagramOAuthResolverError {
  override readonly name = "InstagramOAuthDeliveryPathMismatchError";
  constructor() {
    super("Instagram OAuth delivery path is not supported", "DELIVERY_PATH_MISMATCH", "terminal_configuration");
  }
}

export class InstagramOAuthAuthFamilyMismatchError extends InstagramOAuthResolverError {
  override readonly name = "InstagramOAuthAuthFamilyMismatchError";
  constructor() {
    super("Instagram OAuth auth family is not supported", "AUTH_FAMILY_MISMATCH", "terminal_configuration");
  }
}

export class InstagramOAuthRuntimeDisabledError extends InstagramOAuthResolverError {
  override readonly name = "InstagramOAuthRuntimeDisabledError";
  constructor() {
    super("Instagram OAuth runtime is disabled", "OAUTH_RUNTIME_DISABLED", "feature_disabled");
  }
}

export class InstagramOAuthConfigurationError extends InstagramOAuthResolverError {
  override readonly name = "InstagramOAuthConfigurationError";
  constructor(message = "Instagram OAuth configuration is invalid") {
    super(message, "CONFIGURATION_ERROR", "terminal_configuration");
  }
}

export class InstagramOAuthCredentialUnavailableError extends InstagramOAuthResolverError {
  override readonly name = "InstagramOAuthCredentialUnavailableError";
  constructor() {
    super("Instagram OAuth credential is unavailable", "CREDENTIAL_UNAVAILABLE", "terminal_configuration");
  }
}
