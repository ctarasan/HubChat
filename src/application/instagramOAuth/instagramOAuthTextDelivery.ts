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
  assertInstagramOAuthOutboundTextEnabled,
  InstagramOAuthTextDeliveryError,
  mapInstagramOAuthTextDeliveryError
} from "../../lib/instagramOAuthTextDeliveryErrors.js";
import {
  validateInstagramOAuthTextMessage,
  validateInstagramOAuthTextRecipient
} from "../../lib/instagramOAuthTextDeliveryValidation.js";
import { createInstagramConnectionCredentialResolver } from "./resolveInstagramConnectionCredential.js";

export type InstagramOAuthTextDeliveryInput = {
  tenantId: string;
  channelConnectionId: string;
  conversationId: string;
  recipientMessagingScopedUserId: string;
  messageText: string;
  idempotencyKey: string;
};

export type InstagramOAuthTextDeliveryResult = {
  externalMessageId: string;
  credentialId: string;
  channelConnectionId: string;
  recipientMessagingScopedUserId: InstagramMessagingScopedUserId;
};

export type InstagramOAuthTextDeliveryDeps = {
  channelConnectionRepository: ChannelConnectionRepository;
  instagramOAuthCredentialRepository: InstagramOAuthCredentialRepository;
  credentialResolver?: InstagramConnectionCredentialResolver;
  messagingClient?: InstagramOAuthMessagingClient;
  env?: Record<string, string | undefined>;
};

function assertChannelConnectionId(channelConnectionId: string): void {
  if (!channelConnectionId.trim()) {
    throw new InstagramOAuthTextDeliveryError({
      code: "CHANNEL_CONNECTION_REQUIRED",
      message: "Instagram OAuth text delivery requires channel_connection_id.",
      retryable: false,
      classification: "terminal_configuration",
      logFields: {}
    });
  }
}

export function createInstagramOAuthTextDeliveryService(deps: InstagramOAuthTextDeliveryDeps) {
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
    async sendText(input: InstagramOAuthTextDeliveryInput): Promise<InstagramOAuthTextDeliveryResult> {
      try {
        assertInstagramOAuthOutboundTextEnabled(env);
        assertChannelConnectionId(input.channelConnectionId);

        const credential = await resolver.resolveForDelivery({
          tenantId: input.tenantId,
          channelConnectionId: input.channelConnectionId,
          expectedAuthFamily: "INSTAGRAM_BUSINESS_LOGIN",
          expectedDeliveryPath: "DATABASE_ONLY"
        });

        const messageText = validateInstagramOAuthTextMessage({ messageText: input.messageText });
        const recipientMessagingScopedUserId = validateInstagramOAuthTextRecipient({
          recipientMessagingScopedUserId: input.recipientMessagingScopedUserId,
          senderProfessionalAccountId: credential.providerInstagramAccountId
        });

        const delivery = await messagingClient.sendTextMessage({
          professionalAccountId: credential.providerInstagramAccountId,
          accessToken: credential.accessToken,
          recipientMessagingScopedUserId,
          messageText
        });

        return {
          externalMessageId: delivery.externalMessageId,
          credentialId: credential.credentialId,
          channelConnectionId: credential.channelConnectionId,
          recipientMessagingScopedUserId
        };
      } catch (error) {
        if (error instanceof InstagramOAuthTextDeliveryError) {
          throw error;
        }
        throw new InstagramOAuthTextDeliveryError(mapInstagramOAuthTextDeliveryError(error));
      }
    }
  };
}
