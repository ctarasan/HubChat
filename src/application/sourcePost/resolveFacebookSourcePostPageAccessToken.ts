import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";
import { isActiveChannelConnectionStatus } from "../../domain/channelConnectionScope.js";
import type { ChannelConnectionRepository } from "../../domain/ports.js";
import { readChannelCredentialEncryptionKeyFromEnv } from "../../lib/channelCredentialEncryption.js";

export type FacebookSourcePostPageTokenSource = "channel_connection" | "environment";

export type ResolveFacebookSourcePostPageAccessTokenFailureReason =
  | "missing_page_reference"
  | "ambiguous_match"
  | "no_match"
  | "credential_unavailable"
  | "env_unavailable";

export type ResolveFacebookSourcePostPageAccessTokenResult =
  | {
      ok: true;
      pageAccessToken: string;
      source: FacebookSourcePostPageTokenSource;
      connectionId: string | null;
      providerPageId: string | null;
    }
  | {
      ok: false;
      reason: ResolveFacebookSourcePostPageAccessTokenFailureReason;
      providerPageId: string | null;
    };

export type FacebookSourcePostCredentialRepository = Pick<
  ChannelConnectionRepository,
  "listByTenant" | "listCredentialMetadataByConnection" | "retrieveDecryptedCredentialForRuntime"
>;

/** Prefer webhook/entry Page id; otherwise derive from Meta `{pageId}_{objectId}` post id. */
export function extractFacebookProviderPageId(input: {
  facebookPageId?: string | null;
  facebookPostId?: string | null;
}): string | null {
  const fromPage = input.facebookPageId?.trim();
  if (fromPage) return fromPage;
  const postId = input.facebookPostId?.trim();
  if (!postId) return null;
  const separator = postId.indexOf("_");
  if (separator <= 0) return null;
  const pageId = postId.slice(0, separator).trim();
  return pageId.length > 0 ? pageId : null;
}

function matchFacebookPageConnections(
  connections: ChannelConnectionRecord[],
  tenantId: string,
  providerPageId: string
): ChannelConnectionRecord[] {
  return connections.filter(
    (connection) =>
      connection.tenantId === tenantId &&
      connection.provider === "FACEBOOK" &&
      isActiveChannelConnectionStatus(connection.status) &&
      (connection.providerPageId ?? "").trim() === providerPageId
  );
}

async function decryptConnectionAccessToken(input: {
  channelConnectionRepository: FacebookSourcePostCredentialRepository;
  tenantId: string;
  connection: ChannelConnectionRecord;
}): Promise<string | null> {
  if (input.connection.tenantId !== input.tenantId) return null;

  const metadata = await input.channelConnectionRepository.listCredentialMetadataByConnection(
    input.tenantId,
    input.connection.id
  );
  const accessTokenMeta = metadata.find((row) => row.credentialType === "ACCESS_TOKEN");
  if (!accessTokenMeta || accessTokenMeta.credentialState !== "SET") return null;
  if (!readChannelCredentialEncryptionKeyFromEnv()) return null;

  try {
    const decrypted = await input.channelConnectionRepository.retrieveDecryptedCredentialForRuntime({
      tenantId: input.tenantId,
      connectionId: input.connection.id,
      credentialType: "ACCESS_TOKEN"
    });
    const token = decrypted?.plaintextSecret?.trim() ?? "";
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

function tryEnvFallback(input: {
  providerPageId: string | null;
  envPageAccessToken?: string | null;
  envPageId?: string | null;
}): ResolveFacebookSourcePostPageAccessTokenResult {
  const envToken = input.envPageAccessToken?.trim() ?? "";
  if (!envToken) {
    return { ok: false, reason: "env_unavailable", providerPageId: input.providerPageId };
  }
  const envPageId = input.envPageId?.trim() ?? "";
  // Never use env token for a different Page when both identities are known.
  if (envPageId && input.providerPageId && envPageId !== input.providerPageId) {
    return { ok: false, reason: "env_unavailable", providerPageId: input.providerPageId };
  }
  return {
    ok: true,
    pageAccessToken: envToken,
    source: "environment",
    connectionId: null,
    providerPageId: input.providerPageId
  };
}

/**
 * Resolve Page access token for Facebook Source Post Graph enrichment.
 * Prefers the unique active FACEBOOK channel connection for tenant + Page;
 * falls back to legacy FACEBOOK_PAGE_ACCESS_TOKEN only when no usable match exists.
 */
export async function resolveFacebookSourcePostPageAccessToken(input: {
  tenantId: string;
  facebookPageId?: string | null;
  facebookPostId?: string | null;
  channelConnectionRepository?: FacebookSourcePostCredentialRepository | null;
  /** Preloaded tenant connections (must already be tenant-scoped). */
  connections?: ChannelConnectionRecord[] | null;
  envPageAccessToken?: string | null;
  envPageId?: string | null;
}): Promise<ResolveFacebookSourcePostPageAccessTokenResult> {
  const providerPageId = extractFacebookProviderPageId({
    facebookPageId: input.facebookPageId,
    facebookPostId: input.facebookPostId
  });

  if (!providerPageId) {
    // Without a Page id we cannot safely bind a channel credential; env may still apply.
    return tryEnvFallback({
      providerPageId: null,
      envPageAccessToken: input.envPageAccessToken,
      envPageId: input.envPageId
    });
  }

  if (input.channelConnectionRepository) {
    const connections =
      input.connections ?? (await input.channelConnectionRepository.listByTenant(input.tenantId));
    const matches = matchFacebookPageConnections(connections, input.tenantId, providerPageId);

    if (matches.length > 1) {
      return { ok: false, reason: "ambiguous_match", providerPageId };
    }

    if (matches.length === 1) {
      const connection = matches[0]!;
      const token = await decryptConnectionAccessToken({
        channelConnectionRepository: input.channelConnectionRepository,
        tenantId: input.tenantId,
        connection
      });
      if (token) {
        return {
          ok: true,
          pageAccessToken: token,
          source: "channel_connection",
          connectionId: connection.id,
          providerPageId
        };
      }
      // Unique connection but credential unusable → allow env fallback below.
    }
  }

  return tryEnvFallback({
    providerPageId,
    envPageAccessToken: input.envPageAccessToken,
    envPageId: input.envPageId
  });
}
