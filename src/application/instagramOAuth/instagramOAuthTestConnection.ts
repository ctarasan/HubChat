import type { ChannelTestConnectionResponseDto } from "../../domain/channelSettings.js";
import type { ChannelConnectionRepository, InstagramOAuthCredentialRepository } from "../../domain/ports.js";
import {
  createInstagramProfessionalIdentityClient,
  InstagramProfessionalIdentityError,
  type InstagramProfessionalIdentityClient
} from "../../infrastructure/adapters/meta/instagramProfessionalIdentity.js";
import { maskInstagramProfessionalAccountId } from "../../lib/instagramIdentityMask.js";
import { InstagramIdentityValidationError } from "../../lib/instagramIdentityValidation.js";
import { readInstagramOAuthServerConfig } from "../../lib/instagramOAuthConfig.js";
import { emitInstagramOAuthAudit, type InstagramOAuthAuditSink } from "../../lib/instagramOAuthAudit.js";
import { InstagramOAuthResolverError } from "../../lib/instagramOAuthResolverErrors.js";
import { isInstagramOAuthTestConnectionEnabled } from "../../lib/instagramOAuthTestConnectionFlags.js";
import { createInstagramConnectionCredentialResolver } from "./resolveInstagramConnectionCredential.js";
import {
  findOAuthManagedInstagramCredential,
  isOAuthManagedInstagramConnection
} from "./instagramOAuthRuntimeCredential.js";

export type InstagramOAuthTestConnectionInput = {
  tenantId: string;
};

export type InstagramOAuthTestConnectionDeps = {
  channelConnectionRepository: ChannelConnectionRepository;
  instagramOAuthCredentialRepository: InstagramOAuthCredentialRepository;
  identityClient?: InstagramProfessionalIdentityClient;
  auditSink?: InstagramOAuthAuditSink;
  env?: Record<string, string | undefined>;
  now?: () => Date;
};

export type InstagramOAuthTestConnectionOutcome =
  | { kind: "NOT_OAUTH_MANAGED" }
  | { kind: "OAUTH_TEST_DISABLED"; response: ChannelTestConnectionResponseDto }
  | { kind: "OAUTH_TEST_RESULT"; response: ChannelTestConnectionResponseDto };

function buildOAuthTestDisabledResponse(): ChannelTestConnectionResponseDto {
  return buildResponse(
    false,
    "DISABLED",
    "Instagram OAuth test connection is disabled.",
    null,
    "Test connection disabled."
  );
}

function buildResponse(
  ok: boolean,
  status: ChannelTestConnectionResponseDto["status"],
  message: string,
  lastVerifiedAt: string | null,
  lastError: string | null
): ChannelTestConnectionResponseDto {
  return {
    channel: "INSTAGRAM",
    ok,
    status,
    message,
    lastVerifiedAt,
    lastError
  };
}

function mapResolverError(error: InstagramOAuthResolverError): ChannelTestConnectionResponseDto {
  if (error.classification === "reauth_required") {
    return buildResponse(false, "ERROR", "Instagram OAuth credential requires reauthorization.", null, "Reauthorization required.");
  }
  if (error.code === "OAUTH_TEST_DISABLED" || error.code === "OAUTH_RUNTIME_DISABLED") {
    return buildResponse(false, "DISABLED", "Instagram OAuth test connection is disabled.", null, "Test connection disabled.");
  }
  return buildResponse(false, "ERROR", "Instagram OAuth test connection failed.", null, "Configuration error.");
}

function mapIdentityError(error: InstagramIdentityValidationError): ChannelTestConnectionResponseDto {
  if (error.code === "INSTAGRAM_OAUTH_IDENTITY_MISMATCH") {
    return buildResponse(false, "ERROR", "Instagram account identity does not match the connected credential.", null, "Identity mismatch.");
  }
  if (error.code === "INSTAGRAM_OAUTH_PROVIDER_RATE_LIMITED") {
    return buildResponse(false, "ERROR", "Instagram is temporarily unavailable. Try again shortly.", null, "Provider rate limited.");
  }
  if (error.code === "INSTAGRAM_OAUTH_PROVIDER_UNAVAILABLE") {
    return buildResponse(false, "ERROR", "Instagram is temporarily unavailable. Try again shortly.", null, "Provider unavailable.");
  }
  if (error.code === "INSTAGRAM_OAUTH_REAUTH_REQUIRED") {
    return buildResponse(false, "ERROR", "Instagram OAuth credential requires reauthorization.", null, "Reauthorization required.");
  }
  return buildResponse(false, "ERROR", "Instagram OAuth identity verification failed.", null, "Configuration error.");
}

export async function tryInstagramOAuthTestConnection(
  input: InstagramOAuthTestConnectionInput,
  deps: InstagramOAuthTestConnectionDeps
): Promise<InstagramOAuthTestConnectionOutcome> {
  const env = deps.env ?? process.env;

  const connection = await deps.channelConnectionRepository.findByTenantAndProvider(
    input.tenantId,
    "INSTAGRAM"
  );
  const credentials = connection
    ? await deps.instagramOAuthCredentialRepository.findByConnection({
        tenantId: input.tenantId,
        channelConnectionId: connection.id
      })
    : [];

  if (!isOAuthManagedInstagramConnection(connection, credentials)) {
    return { kind: "NOT_OAUTH_MANAGED" };
  }

  if (!isInstagramOAuthTestConnectionEnabled(env)) {
    return { kind: "OAUTH_TEST_DISABLED", response: buildOAuthTestDisabledResponse() };
  }

  const oauthCredential = findOAuthManagedInstagramCredential(credentials);
  if (!connection || !oauthCredential) {
    return {
      kind: "OAUTH_TEST_RESULT",
      response: buildResponse(
        false,
        "NOT_CONFIGURED",
        "Instagram OAuth credential is not configured.",
        null,
        "Credential not found."
      )
    };
  }

  const resolver = createInstagramConnectionCredentialResolver({
    channelConnectionRepository: deps.channelConnectionRepository,
    instagramOAuthCredentialRepository: deps.instagramOAuthCredentialRepository,
    env,
    now: deps.now
  });

  const config = readInstagramOAuthServerConfig(env as NodeJS.ProcessEnv);
  const identityClient =
    deps.identityClient ??
    createInstagramProfessionalIdentityClient({ graphVersion: config.graphVersion });
  const auditSink = deps.auditSink ?? (() => undefined);

  try {
    const resolved = await resolver.resolveForConnectionTest({
      tenantId: input.tenantId,
      channelConnectionId: connection.id,
      expectedAuthFamily: "INSTAGRAM_BUSINESS_LOGIN",
      expectedDeliveryPath: "DATABASE_ONLY"
    });

    const identity = await identityClient.getOwnProfessionalAccount({
      accessToken: resolved.accessToken
    });

    const persistedId = oauthCredential.providerInstagramAccountId?.trim();
    if (persistedId && persistedId !== String(identity.professionalAccountId)) {
      emitInstagramOAuthAudit(auditSink, "INSTAGRAM_OAUTH_IDENTITY_MISMATCH", {
        tenantId: input.tenantId,
        channelConnectionId: connection.id,
        provider: "INSTAGRAM",
        authFamily: "INSTAGRAM_BUSINESS_LOGIN",
        resultCode: "INSTAGRAM_OAUTH_IDENTITY_MISMATCH"
      });
      return {
        kind: "OAUTH_TEST_RESULT",
        response: mapIdentityError(
          new InstagramIdentityValidationError(
            "INSTAGRAM_OAUTH_IDENTITY_MISMATCH",
            "Persisted Instagram identity does not match provider identity"
          )
        )
      };
    }

    const checkedAt = (deps.now ?? (() => new Date()))().toISOString();
    const masked = maskInstagramProfessionalAccountId(String(identity.professionalAccountId));
    const message = `Instagram OAuth identity verified for @${identity.username} (${masked}). Messaging delivery is validated separately.`;

    emitInstagramOAuthAudit(auditSink, "INSTAGRAM_OAUTH_TEST_CONNECTION_SUCCEEDED", {
      tenantId: input.tenantId,
      channelConnectionId: connection.id,
      provider: "INSTAGRAM",
      authFamily: "INSTAGRAM_BUSINESS_LOGIN",
      resultCode: "READY",
      accountType: identity.accountType
    });

    return {
      kind: "OAUTH_TEST_RESULT",
      response: buildResponse(true, "READY", message, checkedAt, null)
    };
  } catch (error) {
    if (error instanceof InstagramOAuthResolverError) {
      emitInstagramOAuthAudit(auditSink, "INSTAGRAM_OAUTH_TEST_CONNECTION_FAILED", {
        tenantId: input.tenantId,
        channelConnectionId: connection.id,
        provider: "INSTAGRAM",
        authFamily: "INSTAGRAM_BUSINESS_LOGIN",
        resultCode: error.code
      });
      return { kind: "OAUTH_TEST_RESULT", response: mapResolverError(error) };
    }
    if (error instanceof InstagramIdentityValidationError) {
      emitInstagramOAuthAudit(auditSink, "INSTAGRAM_OAUTH_TEST_CONNECTION_FAILED", {
        tenantId: input.tenantId,
        channelConnectionId: connection.id,
        provider: "INSTAGRAM",
        authFamily: "INSTAGRAM_BUSINESS_LOGIN",
        resultCode: error.code
      });
      return { kind: "OAUTH_TEST_RESULT", response: mapIdentityError(error) };
    }
    if (error instanceof InstagramProfessionalIdentityError) {
      emitInstagramOAuthAudit(auditSink, "INSTAGRAM_OAUTH_TEST_CONNECTION_FAILED", {
        tenantId: input.tenantId,
        channelConnectionId: connection.id,
        provider: "INSTAGRAM",
        authFamily: "INSTAGRAM_BUSINESS_LOGIN",
        resultCode: error.code
      });
      return {
        kind: "OAUTH_TEST_RESULT",
        response: mapIdentityError(
          new InstagramIdentityValidationError(error.code, error.message)
        )
      };
    }
    emitInstagramOAuthAudit(auditSink, "INSTAGRAM_OAUTH_TEST_CONNECTION_FAILED", {
      tenantId: input.tenantId,
      channelConnectionId: connection.id,
      provider: "INSTAGRAM",
      authFamily: "INSTAGRAM_BUSINESS_LOGIN",
      resultCode: "INSTAGRAM_OAUTH_PROVIDER_UNAVAILABLE"
    });
    return {
      kind: "OAUTH_TEST_RESULT",
      response: buildResponse(
        false,
        "ERROR",
        "Instagram OAuth test connection failed.",
        null,
        "Provider unavailable."
      )
    };
  }
}
