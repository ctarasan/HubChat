import type { ChannelType, ProviderThreadType } from "../../domain/entities.js";
import type {
  InstagramCredentialBinding,
  InstagramOAuthOutboundMessageKind
} from "../../domain/instagramOAuthOutboundContract.js";
import { INSTAGRAM_OAUTH_OUTBOUND_QUEUE_CONTRACT_VERSION } from "../../domain/instagramOAuthOutboundContract.js";
import type {
  ChannelConnectionRepository,
  ChannelSettingRepository,
  InstagramOAuthCredentialRepository
} from "../../domain/ports.js";
import { serializeInstagramCredentialBindingForQueue } from "../../lib/instagramOAuthOutboundQueueContract.js";
import { isOAuthManagedInstagramConnection } from "./instagramOAuthRuntimeCredential.js";

export class InstagramOutboundEnqueueBindingError extends Error {
  override readonly name = "InstagramOutboundEnqueueBindingError";
}

export type ResolveInstagramOutboundEnqueueBindingInput = {
  tenantId: string;
  channel: ChannelType;
  messageType: "TEXT" | "IMAGE" | "DOCUMENT_PDF";
  providerThreadType?: ProviderThreadType | null;
  channelConnectionId?: string | null;
};

export type ResolveInstagramOutboundEnqueueBindingDeps = {
  channelConnectionRepository: ChannelConnectionRepository;
  instagramOAuthCredentialRepository: InstagramOAuthCredentialRepository;
  channelSettingRepository: Pick<
    ChannelSettingRepository,
    "findByTenantAndChannel" | "getRuntimeConfigForConnectionTest"
  >;
};

async function isLegacyInstagramPageTokenConfigured(
  deps: ResolveInstagramOutboundEnqueueBindingDeps,
  tenantId: string
): Promise<boolean> {
  const setting = await deps.channelSettingRepository.findByTenantAndChannel(tenantId, "INSTAGRAM");
  if (!setting?.configured) return false;
  const runtime = await deps.channelSettingRepository.getRuntimeConfigForConnectionTest({
    tenantId,
    channel: "INSTAGRAM"
  });
  return Boolean(runtime?.secrets.accessToken?.trim());
}

function toOAuthMessageKind(messageType: "TEXT" | "IMAGE"): InstagramOAuthOutboundMessageKind {
  return messageType === "IMAGE" ? "IMAGE" : "TEXT";
}

/**
 * Derives immutable Instagram OAuth queue binding from trusted DB state at enqueue time.
 * Returns null for legacy Instagram jobs and non-Instagram channels.
 */
export async function resolveInstagramOutboundEnqueueBinding(
  input: ResolveInstagramOutboundEnqueueBindingInput,
  deps: ResolveInstagramOutboundEnqueueBindingDeps
): Promise<InstagramCredentialBinding | null> {
  if (input.channel !== "INSTAGRAM") return null;
  if (input.providerThreadType === "INSTAGRAM_COMMENT") return null;

  if (input.messageType !== "TEXT" && input.messageType !== "IMAGE") {
    return null;
  }

  const connectionId = input.channelConnectionId?.trim() || null;

  if (!connectionId) {
    const tenantConnection = await deps.channelConnectionRepository.findByTenantAndProvider(
      input.tenantId,
      "INSTAGRAM"
    );
    if (!tenantConnection) return null;

    const tenantCredentials = await deps.instagramOAuthCredentialRepository.findByConnection({
      tenantId: input.tenantId,
      channelConnectionId: tenantConnection.id
    });
    if (!isOAuthManagedInstagramConnection(tenantConnection, tenantCredentials)) {
      return null;
    }

    const legacyConfigured = await isLegacyInstagramPageTokenConfigured(deps, input.tenantId);
    if (!legacyConfigured) {
      throw new InstagramOutboundEnqueueBindingError(
        "Instagram outbound requires a channel connection binding. Contact an administrator."
      );
    }
    return null;
  }

  const connection = await deps.channelConnectionRepository.findById(input.tenantId, connectionId);
  if (!connection || connection.provider !== "INSTAGRAM" || connection.tenantId !== input.tenantId) {
    throw new InstagramOutboundEnqueueBindingError(
      "Instagram channel connection is invalid for this conversation."
    );
  }

  const credentials = await deps.instagramOAuthCredentialRepository.findByConnection({
    tenantId: input.tenantId,
    channelConnectionId: connectionId
  });

  if (!isOAuthManagedInstagramConnection(connection, credentials)) {
    return null;
  }

  const legacyConfigured = await isLegacyInstagramPageTokenConfigured(deps, input.tenantId);
  if (legacyConfigured) {
    throw new InstagramOutboundEnqueueBindingError("Instagram connection auth configuration is ambiguous.");
  }

  return serializeInstagramCredentialBindingForQueue({
    mode: "CONNECTION_BOUND",
    contractVersion: INSTAGRAM_OAUTH_OUTBOUND_QUEUE_CONTRACT_VERSION,
    provider: "INSTAGRAM",
    authFamily: "INSTAGRAM_BUSINESS_LOGIN",
    deliveryPath: "DATABASE_ONLY",
    channelConnectionId: connectionId,
    messageKind: toOAuthMessageKind(input.messageType)
  });
}
