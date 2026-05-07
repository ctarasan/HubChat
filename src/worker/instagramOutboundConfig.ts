import { createHash } from "node:crypto";

interface InstagramOutboundEnv {
  FACEBOOK_PAGE_ACCESS_TOKEN?: string;
  INSTAGRAM_ACCESS_TOKEN?: string;
  FACEBOOK_PAGE_ID?: string;
  INSTAGRAM_PAGE_ID?: string;
  META_GRAPH_VERSION?: string;
  FACEBOOK_GRAPH_VERSION?: string;
  INSTAGRAM_ACCOUNT_ID?: string;
}

export interface InstagramOutboundConfig {
  instagramOutboundEnabled: boolean;
  hasInstagramAccessToken: boolean;
  instagramGraphPageId: string | null;
  instagramTokenSource: "FACEBOOK_PAGE_ACCESS_TOKEN" | "INSTAGRAM_ACCESS_TOKEN" | "none";
  accessToken: string | null;
  graphVersion: string;
  businessAccountId?: string;
  pageId?: string;
  instagramTokenLength: number | null;
  instagramTokenSha256Prefix12: string | null;
}

function sha256Prefix12(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function buildInstagramOutboundConfig(env: InstagramOutboundEnv): InstagramOutboundConfig {
  const facebookPageToken = env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim() || "";
  const instagramToken = env.INSTAGRAM_ACCESS_TOKEN?.trim() || "";
  const instagramAccessToken = facebookPageToken || instagramToken || "";
  const instagramGraphPageId = env.FACEBOOK_PAGE_ID?.trim() || env.INSTAGRAM_PAGE_ID?.trim() || "";
  const graphVersion = env.META_GRAPH_VERSION || env.FACEBOOK_GRAPH_VERSION || "v25.0";
  const instagramTokenSource = facebookPageToken
    ? "FACEBOOK_PAGE_ACCESS_TOKEN"
    : instagramToken
      ? "INSTAGRAM_ACCESS_TOKEN"
      : "none";

  return {
    instagramOutboundEnabled: Boolean(instagramAccessToken && instagramGraphPageId),
    hasInstagramAccessToken: Boolean(instagramAccessToken),
    instagramGraphPageId: instagramGraphPageId || null,
    instagramTokenSource,
    accessToken: instagramAccessToken || null,
    graphVersion,
    businessAccountId: env.INSTAGRAM_ACCOUNT_ID,
    ...(instagramGraphPageId ? { pageId: instagramGraphPageId } : {}),
    instagramTokenLength: instagramAccessToken ? instagramAccessToken.length : null,
    instagramTokenSha256Prefix12: instagramAccessToken ? sha256Prefix12(instagramAccessToken) : null
  };
}
