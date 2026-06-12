import { sanitizeSourcePostThumbnailUrl } from "./sourcePostThumbnailSanitize.js";

const DEFAULT_META_GRAPH_VERSION = "v25.0";

function normalizeGraphVersion(value: string | undefined): string {
  const raw = (value ?? DEFAULT_META_GRAPH_VERSION).trim();
  if (!raw) return DEFAULT_META_GRAPH_VERSION;
  if (/^\d+\.\d+$/.test(raw)) return `v${raw}`;
  if (/^v\d+\.\d+$/i.test(raw)) return `v${raw.slice(1)}`;
  return raw.startsWith("v") ? raw : `v${raw}`;
}

function pickTextCandidate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type FacebookPostMessageFetchResult =
  | { ok: true; message: string; thumbnailUrl: string | null }
  | { ok: false; reason: "missing_access_token" | "graph_http_error" | "graph_empty_message" | "graph_fetch_error" };

/** Fail-open Graph read for parent post text and preview image (no IDs/URLs in error paths). */
export async function fetchFacebookPostMessageFromGraph(input: {
  postId: string;
  pageAccessToken?: string | null;
  graphVersion?: string;
}): Promise<FacebookPostMessageFetchResult> {
  const postId = input.postId.trim();
  const token = input.pageAccessToken?.trim();
  if (!postId) return { ok: false, reason: "graph_empty_message" };
  if (!token) return { ok: false, reason: "missing_access_token" };

  try {
    const graphVersion = normalizeGraphVersion(
      input.graphVersion ?? process.env.META_GRAPH_VERSION ?? process.env.FACEBOOK_GRAPH_VERSION
    );
    const response = await fetch(
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(postId)}?fields=message,full_picture&access_token=${encodeURIComponent(token)}`
    );
    if (!response.ok) {
      return { ok: false, reason: "graph_http_error" };
    }
    const parsed = (await response.json()) as { message?: unknown; full_picture?: unknown };
    const message = pickTextCandidate(parsed.message);
    const thumbnailUrl = sanitizeSourcePostThumbnailUrl(parsed.full_picture);
    if (!message && !thumbnailUrl) return { ok: false, reason: "graph_empty_message" };
    return { ok: true, message: message ?? "", thumbnailUrl };
  } catch {
    return { ok: false, reason: "graph_fetch_error" };
  }
}
