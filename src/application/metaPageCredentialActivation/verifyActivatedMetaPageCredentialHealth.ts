import type { MetaPageCredentialActivationResult } from "../../domain/metaPageCredentialActivation.js";
import type { MetaPageBindingChannelType } from "../../domain/metaPageCredentials.js";
import type { MetaPageCredentialBindingMetadata } from "../../domain/metaPageCredentials.js";
import type { MetaPageCredentialMaterial } from "../../domain/metaPageCredentials.js";
import {
  verifyFacebookChannelHealth,
  verifyInstagramChannelHealth,
  type FetchFn
} from "../../infrastructure/adapters/channels/channelHealthCheck.js";
import { normalizeMetaGraphVersion } from "../../lib/facebookOAuthConfig.js";

export type VerifyActivatedMetaPageCredentialHealthInput = {
  activation: MetaPageCredentialActivationResult;
  material: MetaPageCredentialMaterial;
  bindings: MetaPageCredentialBindingMetadata[];
  facebookConnectionId: string;
  instagramConnectionId?: string | null;
  requestedChannels: MetaPageBindingChannelType[];
  fetchFn?: FetchFn;
  graphVersion?: string;
};

export async function verifyActivatedMetaPageCredentialHealth(
  input: VerifyActivatedMetaPageCredentialHealthInput
): Promise<{ ok: true } | { ok: false; message: string }> {
  const graphVersion = normalizeMetaGraphVersion(input.graphVersion);

  if (input.material.credentialVersion !== input.activation.credentialVersion) {
    return { ok: false, message: "Committed credential version does not match activation result" };
  }

  if (input.material.credentialId !== input.activation.credentialId) {
    return { ok: false, message: "Committed credential id does not match activation result" };
  }

  for (const expected of input.activation.bindings) {
    const binding = input.bindings.find(
      (row) =>
        row.id === expected.bindingId &&
        row.channelConnectionId === expected.channelConnectionId &&
        row.channelType === expected.channelType &&
        row.bindingStatus === "ACTIVE" &&
        row.credentialVersion === expected.credentialVersion
    );
    if (!binding) {
      return { ok: false, message: "Committed binding does not match activation result" };
    }
  }

  const fbHealth = await verifyFacebookChannelHealth(
    {
      tenantId: input.material.tenantId,
      channel: "FACEBOOK",
      enabled: true,
      providerPageId: input.material.facebookPageId,
      providerAccountName: null,
      secrets: { accessToken: input.material.accessToken }
    },
    input.fetchFn,
    graphVersion
  );
  if (!fbHealth.ok) {
    return { ok: false, message: fbHealth.message };
  }

  if (input.requestedChannels.includes("INSTAGRAM")) {
    const igHealth = await verifyInstagramChannelHealth(
      {
        tenantId: input.material.tenantId,
        channel: "INSTAGRAM",
        enabled: true,
        providerPageId: input.material.facebookPageId,
        providerAccountName: null,
        secrets: { accessToken: input.material.accessToken }
      },
      input.fetchFn,
      graphVersion
    );
    if (!igHealth.ok) {
      return { ok: false, message: igHealth.message };
    }

    const expectedIgId = input.material.instagramProfessionalAccountId?.trim();
    if (!expectedIgId) {
      return { ok: false, message: "Instagram Professional Account is not present on credential" };
    }

    const igBinding = input.activation.bindings.find((b) => b.channelType === "INSTAGRAM");
    if (!igBinding || igBinding.channelConnectionId !== input.instagramConnectionId) {
      return { ok: false, message: "Instagram binding does not match requested connection" };
    }
  }

  return { ok: true };
}
