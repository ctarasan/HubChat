import type { InstagramResolvedCredential, ResolveInstagramConnectionCredentialInput } from "../../domain/instagramOAuthOutboundContract.js";
import type {
  ChannelConnectionRepository,
  InstagramConnectionCredentialResolver,
  InstagramOAuthCredentialRepository
} from "../../domain/ports.js";
import type { InstagramOAuthCredentialStatus } from "../../domain/instagramOAuthCredentials.js";
import { ChannelCredentialEncryptionError } from "../../lib/channelCredentialEncryption.js";
import {
  isInstagramOAuthFoundationEnabled,
  isInstagramOAuthRuntimeEnabled
} from "../../lib/instagramOAuthFoundationFlags.js";
import { isInstagramOAuthTestConnectionEnabled } from "../../lib/instagramOAuthTestConnectionFlags.js";
import {
  InstagramConnectionNotFoundError,
  InstagramConnectionProviderMismatchError,
  InstagramOAuthAuthFamilyMismatchError,
  InstagramOAuthConfigurationError,
  InstagramOAuthCredentialDecryptError,
  InstagramOAuthCredentialExpiredError,
  InstagramOAuthCredentialNotReadyError,
  InstagramOAuthCredentialReauthRequiredError,
  InstagramOAuthCredentialTemporarilyUnavailableError,
  InstagramOAuthCredentialUnavailableError,
  InstagramOAuthDeliveryPathMismatchError,
  InstagramOAuthRuntimeDisabledError,
  InstagramOAuthTestConnectionDisabledError
} from "../../lib/instagramOAuthResolverErrors.js";

export type CreateInstagramConnectionCredentialResolverInput = {
  channelConnectionRepository: ChannelConnectionRepository;
  instagramOAuthCredentialRepository: InstagramOAuthCredentialRepository;
  env?: Record<string, string | undefined>;
  now?: () => Date;
};

function assertRuntimeEnabled(env: Record<string, string | undefined>): void {
  if (!isInstagramOAuthFoundationEnabled(env) || !isInstagramOAuthRuntimeEnabled(env)) {
    throw new InstagramOAuthRuntimeDisabledError();
  }
}

function assertTestConnectionEnabled(env: Record<string, string | undefined>): void {
  if (!isInstagramOAuthFoundationEnabled(env) || !isInstagramOAuthTestConnectionEnabled(env)) {
    throw new InstagramOAuthTestConnectionDisabledError();
  }
}

function assertDeliveryPath(expected: "DATABASE_ONLY", actual: "DATABASE_ONLY"): void {
  if (expected !== actual) {
    throw new InstagramOAuthDeliveryPathMismatchError();
  }
}

function classifyCredentialStatus(status: InstagramOAuthCredentialStatus): void {
  switch (status) {
    case "ACTIVE":
    case "TOKEN_EXPIRING":
      return;
    case "REFRESHING":
      throw new InstagramOAuthCredentialTemporarilyUnavailableError();
    case "PENDING":
      throw new InstagramOAuthCredentialNotReadyError();
    case "REAUTH_REQUIRED":
      throw new InstagramOAuthCredentialReauthRequiredError();
    case "REVOKED":
    case "DISCONNECTED":
      throw new InstagramOAuthCredentialUnavailableError();
    case "ERROR":
      throw new InstagramOAuthConfigurationError();
    default:
      throw new InstagramOAuthConfigurationError();
  }
}

function assertTokenUsable(tokenExpiresAt: Date | null, now: Date): void {
  if (!tokenExpiresAt) return;
  if (tokenExpiresAt.getTime() <= now.getTime()) {
    throw new InstagramOAuthCredentialExpiredError();
  }
}

async function resolveInstagramOAuthCredential(
  input: CreateInstagramConnectionCredentialResolverInput,
  resolveInput: ResolveInstagramConnectionCredentialInput
): Promise<InstagramResolvedCredential> {
  const now = (input.now ?? (() => new Date()))();

  if (resolveInput.expectedAuthFamily !== "INSTAGRAM_BUSINESS_LOGIN") {
    throw new InstagramOAuthAuthFamilyMismatchError();
  }
  assertDeliveryPath(resolveInput.expectedDeliveryPath, "DATABASE_ONLY");

  const connection = await input.channelConnectionRepository.findById(
    resolveInput.tenantId,
    resolveInput.channelConnectionId
  );
  if (!connection) {
    throw new InstagramConnectionNotFoundError();
  }
  if (connection.provider !== "INSTAGRAM") {
    throw new InstagramConnectionProviderMismatchError();
  }

  const activeCredential = await input.instagramOAuthCredentialRepository.findActiveByConnection({
    tenantId: resolveInput.tenantId,
    channelConnectionId: resolveInput.channelConnectionId
  });
  if (!activeCredential) {
    throw new InstagramOAuthCredentialUnavailableError();
  }

  if (activeCredential.authFamily !== "INSTAGRAM_BUSINESS_LOGIN") {
    throw new InstagramOAuthAuthFamilyMismatchError();
  }

  classifyCredentialStatus(activeCredential.credentialStatus);
  assertTokenUsable(
    activeCredential.tokenExpiresAt ? new Date(activeCredential.tokenExpiresAt) : null,
    now
  );

  let material;
  try {
    material = await input.instagramOAuthCredentialRepository.retrieveDecryptedMaterial({
      tenantId: resolveInput.tenantId,
      channelConnectionId: resolveInput.channelConnectionId,
      credentialId: activeCredential.id
    });
  } catch (err) {
    if (err instanceof ChannelCredentialEncryptionError) {
      throw new InstagramOAuthCredentialDecryptError();
    }
    throw err;
  }

  if (!material?.accessToken.trim()) {
    throw new InstagramOAuthCredentialDecryptError();
  }

  if (!activeCredential.providerInstagramAccountId?.trim()) {
    throw new InstagramOAuthConfigurationError("Instagram provider account identity is missing");
  }

  return {
    credentialId: activeCredential.id,
    credentialVersion: activeCredential.credentialVersion,
    tenantId: resolveInput.tenantId,
    channelConnectionId: resolveInput.channelConnectionId,
    providerInstagramAccountId: activeCredential.providerInstagramAccountId,
    providerUserId: activeCredential.providerUserId,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN",
    accessToken: material.accessToken,
    tokenExpiresAt: material.tokenExpiresAt
  };
}

export function createInstagramConnectionCredentialResolver(
  input: CreateInstagramConnectionCredentialResolverInput
): InstagramConnectionCredentialResolver {
  const env = input.env ?? process.env;

  return {
    async resolveForDelivery(resolveInput): Promise<InstagramResolvedCredential> {
      assertRuntimeEnabled(env);
      return resolveInstagramOAuthCredential(input, resolveInput);
    },
    async resolveForConnectionTest(resolveInput): Promise<InstagramResolvedCredential> {
      assertTestConnectionEnabled(env);
      return resolveInstagramOAuthCredential(input, resolveInput);
    }
  };
}
