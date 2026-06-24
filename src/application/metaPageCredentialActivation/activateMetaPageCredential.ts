import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";
import type { MetaPageCredentialActivationPort } from "../../domain/ports.js";
import type { MetaPageCredentialRepository } from "../../domain/ports.js";
import type { ChannelConnectionRepository } from "../../domain/ports.js";
import type { TrustedMetaPageConnectionIdentity } from "../../domain/metaPageCredentialVerification.js";
import { META_PAGE_CREDENTIAL_INITIAL_VERSION } from "../../domain/metaPageCredentialActivation.js";
import { MetaPageCredentialActivationApiError } from "../../lib/metaPageCredentialActivationApiErrors.js";
import {
  encryptChannelCredentialPlaintext,
  resolveChannelCredentialEncryptionKey
} from "../../lib/channelCredentialEncryption.js";
import { buildMetaPageCredentialActivationRequestFingerprint } from "../../lib/metaPageCredentialActivationFingerprint.js";
import {
  assertMetaPageCredentialActivationAuditSafe,
  buildMetaPageCredentialActivationAuditEvent
} from "../../lib/metaPageCredentialActivationAudit.js";
import { VerifyMetaPageCredentialUseCase } from "../metaPageCredentialVerification/verifyMetaPageCredential.js";
import type {
  ActivateMetaPageCredentialCommand,
  MetaPageCredentialActivationOutcome
} from "./activateMetaPageCredentialTypes.js";
import { verifyActivatedMetaPageCredentialHealth } from "./verifyActivatedMetaPageCredentialHealth.js";
import type { FetchFn } from "../../infrastructure/adapters/channels/channelHealthCheck.js";

export type ActivateMetaPageCredentialUseCaseDeps = {
  verifyMetaPageCredential: VerifyMetaPageCredentialUseCase;
  activationPort: MetaPageCredentialActivationPort;
  metaPageCredentialRepository: Pick<
    MetaPageCredentialRepository,
    "retrieveDecryptedMaterial" | "listBindingsForCredential" | "getCredentialById"
  >;
  channelConnectionRepository: Pick<ChannelConnectionRepository, "findById">;
  expectedAppId: string;
  graphVersion?: string;
  fetchFn?: FetchFn;
  audit?: (event: ReturnType<typeof buildMetaPageCredentialActivationAuditEvent>) => void;
};

function connectionAccountId(connection: ChannelConnectionRecord): string {
  if (connection.provider === "FACEBOOK") {
    return (connection.providerAccountId ?? connection.providerPageId ?? "").trim();
  }
  return (connection.providerAccountId ?? connection.providerIgAccountId ?? "").trim();
}

function toTrustedConnection(
  tenantId: string,
  connection: ChannelConnectionRecord
): TrustedMetaPageConnectionIdentity {
  const provider = connection.provider === "INSTAGRAM" ? "INSTAGRAM" : "FACEBOOK";
  return {
    tenantId,
    connectionId: connection.id,
    provider,
    providerAccountId: connectionAccountId(connection)
  };
}

async function loadTrustedConnection(
  deps: ActivateMetaPageCredentialUseCaseDeps,
  tenantId: string,
  connectionId: string,
  expectedProvider: "FACEBOOK" | "INSTAGRAM"
): Promise<TrustedMetaPageConnectionIdentity> {
  const connection = await deps.channelConnectionRepository.findById(tenantId, connectionId);
  if (!connection || connection.tenantId !== tenantId) {
    throw new MetaPageCredentialActivationApiError(
      "META_CONNECTION_NOT_FOUND",
      "Channel connection is not available for activation",
      400,
      false
    );
  }
  if (connection.provider !== expectedProvider) {
    throw new MetaPageCredentialActivationApiError(
      "META_CONNECTION_TYPE_MISMATCH",
      "Channel connection type mismatch for activation",
      400,
      false
    );
  }
  const trusted = toTrustedConnection(tenantId, connection);
  if (!trusted.providerAccountId) {
    throw new MetaPageCredentialActivationApiError(
      "META_CONNECTION_NOT_FOUND",
      "Channel connection identity is missing",
      400,
      false
    );
  }
  return trusted;
}

export class ActivateMetaPageCredentialUseCase {
  constructor(private readonly deps: ActivateMetaPageCredentialUseCaseDeps) {}

  async execute(command: ActivateMetaPageCredentialCommand): Promise<MetaPageCredentialActivationOutcome> {
    if (command.requestedChannels.includes("INSTAGRAM") && !command.instagramConnectionId) {
      throw new MetaPageCredentialActivationApiError(
        "META_ACTIVATION_INPUT_INVALID",
        "Instagram connection is required when Instagram is requested",
        400,
        false
      );
    }

    const facebookConnection = await loadTrustedConnection(
      this.deps,
      command.tenantId,
      command.facebookConnectionId,
      "FACEBOOK"
    );

    const instagramConnection =
      command.requestedChannels.includes("INSTAGRAM") && command.instagramConnectionId
        ? await loadTrustedConnection(
            this.deps,
            command.tenantId,
            command.instagramConnectionId,
            "INSTAGRAM"
          )
        : null;

    const proof = await this.deps.verifyMetaPageCredential.execute({
      tenantId: command.tenantId,
      accessToken: command.accessToken,
      requestedChannels: command.requestedChannels,
      expectedAppId: this.deps.expectedAppId,
      facebookConnection,
      instagramConnection
    });

    const requestFingerprint = buildMetaPageCredentialActivationRequestFingerprint({
      tenantId: command.tenantId,
      facebookConnectionId: command.facebookConnectionId,
      instagramConnectionId: command.instagramConnectionId ?? null,
      requestedChannels: command.requestedChannels,
      expectedCredentialVersion: command.expectedCredentialVersion,
      credentialId: command.credentialId ?? null,
      tokenFingerprint: proof.metadata.tokenFingerprint,
      facebookPageId: proof.metadata.facebookPageId,
      instagramProfessionalAccountId: proof.metadata.instagramProfessionalAccountId,
      verificationVersion: proof.metadata.verificationVersion
    });

    const keyResolution = resolveChannelCredentialEncryptionKey({ env: process.env });
    if (keyResolution.status !== "configured") {
      throw new MetaPageCredentialActivationApiError(
        "META_ACTIVATION_FAILED",
        "Credential encryption is unavailable",
        503,
        false
      );
    }

    const encryptedAccessTokenCiphertext = proof.consumeAccessToken((token) =>
      encryptChannelCredentialPlaintext(token, keyResolution.keyMaterial)
    );

    const activation = await this.deps.activationPort.activate({
      tenantId: command.tenantId,
      proof,
      encryptedAccessTokenCiphertext,
      facebookConnectionId: command.facebookConnectionId,
      instagramConnectionId: command.instagramConnectionId ?? null,
      expectedCredentialVersion: command.expectedCredentialVersion,
      credentialId:
        command.expectedCredentialVersion > META_PAGE_CREDENTIAL_INITIAL_VERSION
          ? command.credentialId ?? null
          : null,
      idempotencyKey: command.idempotencyKey,
      requestFingerprint
    });

    const credential = await this.deps.metaPageCredentialRepository.getCredentialById({
      tenantId: command.tenantId,
      credentialId: activation.credentialId
    });
    if (!credential || credential.credentialVersion !== activation.credentialVersion) {
      throw new MetaPageCredentialActivationApiError(
        "META_ACTIVATION_FAILED",
        "Activation committed credential could not be loaded",
        500,
        true
      );
    }

    const material = await this.deps.metaPageCredentialRepository.retrieveDecryptedMaterial({
      tenantId: command.tenantId,
      credentialId: activation.credentialId
    });
    if (!material) {
      throw new MetaPageCredentialActivationApiError(
        "META_POST_ACTIVATION_HEALTH_FAILED",
        "Post-activation health verification failed",
        202,
        false
      );
    }

    const bindings = await this.deps.metaPageCredentialRepository.listBindingsForCredential({
      tenantId: command.tenantId,
      credentialId: activation.credentialId
    });

    const health = await verifyActivatedMetaPageCredentialHealth({
      activation,
      material,
      bindings,
      facebookConnectionId: command.facebookConnectionId,
      instagramConnectionId: command.instagramConnectionId ?? null,
      requestedChannels: command.requestedChannels,
      fetchFn: this.deps.fetchFn,
      graphVersion: this.deps.graphVersion
    });

    const outcome: MetaPageCredentialActivationOutcome = {
      state: health.ok ? "ACTIVATED_HEALTHY_PENDING_CUTOVER" : "ACTIVATED_HEALTH_FAILED",
      activationStatus: "ACTIVATED_PENDING_HEALTH",
      credentialId: activation.credentialId,
      credentialVersion: activation.credentialVersion,
      bindings: activation.bindings,
      idempotencyReplay: activation.idempotencyReplay,
      requestedChannels: command.requestedChannels
    };

    const auditEvent = buildMetaPageCredentialActivationAuditEvent({
      eventType: "META_PAGE_CREDENTIAL_ACTIVATION",
      tenantId: command.tenantId,
      actorSalesAgentId: command.actorSalesAgentId,
      requestedChannels: command.requestedChannels,
      credentialId: activation.credentialId,
      credentialVersion: activation.credentialVersion,
      activationState: outcome.state,
      errorCode: health.ok ? null : "META_POST_ACTIVATION_HEALTH_FAILED"
    });
    assertMetaPageCredentialActivationAuditSafe(auditEvent);
    this.deps.audit?.(auditEvent);

    return outcome;
  }
}
