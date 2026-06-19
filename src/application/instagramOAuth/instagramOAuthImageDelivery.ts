import type { InstagramMessagingScopedUserId } from "../../domain/instagramIdentity.js";
import type {
  ChannelConnectionRepository,
  InstagramConnectionCredentialResolver,
  InstagramOAuthCredentialRepository
} from "../../domain/ports.js";
import {
  createInstagramOAuthMessagingClient,
  type InstagramOAuthMessagingClient
} from "../../infrastructure/adapters/meta/instagramOAuthMessagingClient.js";
import { readInstagramOAuthServerConfig } from "../../lib/instagramOAuthConfig.js";
import {
  assertInstagramOAuthOutboundImageEnabled,
  InstagramOAuthImageDeliveryError,
  mapInstagramOAuthImageDeliveryError
} from "../../lib/instagramOAuthImageDeliveryErrors.js";
import {
  maskInstagramOAuthImageUrlForLog,
  validateInstagramOAuthImageDeliveryMedia
} from "../../lib/instagramOAuthImageDeliveryValidation.js";
import { validateInstagramOAuthTextRecipient } from "../../lib/instagramOAuthTextDeliveryValidation.js";
import { createInstagramConnectionCredentialResolver } from "./resolveInstagramConnectionCredential.js";

export type InstagramOAuthImageDeliveryInput = {
  tenantId: string;
  channelConnectionId: string;
  conversationId: string;
  recipientMessagingScopedUserId: string;
  imageUrl: string;
  mediaMimeType: string;
  fileSizeBytes?: number;
  idempotencyKey: string;
};

export type InstagramOAuthImageDeliveryResult = {
  externalMessageId: string;
  credentialId: string;
  channelConnectionId: string;
  recipientMessagingScopedUserId: InstagramMessagingScopedUserId;
  imageUrlHost: string;
};

export type InstagramOAuthImageDeliveryDeps = {
  channelConnectionRepository: ChannelConnectionRepository;
  instagramOAuthCredentialRepository: InstagramOAuthCredentialRepository;
  credentialResolver?: InstagramConnectionCredentialResolver;
  messagingClient?: InstagramOAuthMessagingClient;
  env?: Record<string, string | undefined>;
};

function assertChannelConnectionId(channelConnectionId: string): void {
  if (!channelConnectionId.trim()) {
    throw new InstagramOAuthImageDeliveryError({
      code: "CHANNEL_CONNECTION_REQUIRED",
      message: "Instagram OAuth image delivery requires channel_connection_id.",
      retryable: false,
      classification: "terminal_configuration",
      logFields: {}
    });
  }
}

export function createInstagramOAuthImageDeliveryService(deps: InstagramOAuthImageDeliveryDeps) {
  const env = deps.env ?? process.env;
  const resolver =
    deps.credentialResolver ??
    createInstagramConnectionCredentialResolver({
      channelConnectionRepository: deps.channelConnectionRepository,
      instagramOAuthCredentialRepository: deps.instagramOAuthCredentialRepository,
      env
    });
  const oauthConfig = readInstagramOAuthServerConfig(env as NodeJS.ProcessEnv);
  const messagingClient =
    deps.messagingClient ??
    createInstagramOAuthMessagingClient({
      graphVersion: oauthConfig.graphVersion
    });

  return {
    async sendImage(input: InstagramOAuthImageDeliveryInput): Promise<InstagramOAuthImageDeliveryResult> {
      try {
        assertInstagramOAuthOutboundImageEnabled(env);
        assertChannelConnectionId(input.channelConnectionId);

        const validatedMedia = validateInstagramOAuthImageDeliveryMedia({
          imageUrl: input.imageUrl,
          mediaMimeType: input.mediaMimeType,
          fileSizeBytes: input.fileSizeBytes
        });

        const credential = await resolver.resolveForDelivery({
          tenantId: input.tenantId,
          channelConnectionId: input.channelConnectionId,
          expectedAuthFamily: "INSTAGRAM_BUSINESS_LOGIN",
          expectedDeliveryPath: "DATABASE_ONLY"
        });

        const recipientMessagingScopedUserId = validateInstagramOAuthTextRecipient({
          recipientMessagingScopedUserId: input.recipientMessagingScopedUserId,
          senderProfessionalAccountId: credential.providerInstagramAccountId
        });

        const delivery = await messagingClient.sendImageMessage({
          professionalAccountId: credential.providerInstagramAccountId,
          accessToken: credential.accessToken,
          recipientMessagingScopedUserId,
          imageUrl: validatedMedia.imageUrl
        });

        return {
          externalMessageId: delivery.externalMessageId,
          credentialId: credential.credentialId,
          channelConnectionId: credential.channelConnectionId,
          recipientMessagingScopedUserId,
          imageUrlHost: validatedMedia.urlHost
        };
      } catch (error) {
        if (error instanceof InstagramOAuthImageDeliveryError) {
          throw error;
        }
        const failure = mapInstagramOAuthImageDeliveryError(error);
        failure.logFields.imageUrlMasked = maskInstagramOAuthImageUrlForLog(input.imageUrl);
        throw new InstagramOAuthImageDeliveryError(failure);
      }
    }
  };
}
