import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { ProfileAvatarCacheStatus } from "./profileAvatarCacheCommon.js";

export {
  PROFILE_AVATAR_CACHE_TOPIC,
  PROFILE_AVATAR_CACHE_STATUSES,
  buildProfileAvatarPublicUrl,
  buildProfileAvatarStoragePath,
  identityHasProfileAvatarCacheMetadata,
  isProfileAvatarCacheEnabled,
  profileAvatarBucketName,
  type ProfileAvatarCacheStatus
} from "./profileAvatarCacheCommon.js";

const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;

export function profileAvatarMaxBytes(env: Record<string, string | undefined> = process.env): number {
  const raw = env.HUBCHAT_PROFILE_AVATAR_MAX_BYTES?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return DEFAULT_MAX_BYTES;
}

export function profileAvatarFetchTimeoutMs(env: Record<string, string | undefined> = process.env): number {
  const raw = env.HUBCHAT_PROFILE_AVATAR_FETCH_TIMEOUT_MS?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return DEFAULT_FETCH_TIMEOUT_MS;
}

export function hashProfileImageSourceUrl(url: string): string {
  return createHash("sha256").update(url.trim()).digest("hex");
}

function isPrivateIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function isBlockedProfileImageHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  const withoutBrackets = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  const ipVersion = isIP(withoutBrackets);
  if (ipVersion === 4) {
    const parts = withoutBrackets.split(".").map((p) => Number(p));
    if (parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      return isPrivateIpv4(parts);
    }
    return true;
  }
  if (ipVersion === 6) {
    const h = withoutBrackets.toLowerCase();
    if (h === "::1" || h === "::") return true;
    if (h.startsWith("fc") || h.startsWith("fd")) return true;
    if (h.startsWith("fe80")) return true;
  }
  return false;
}

/** Provider profile image hosts (HTTPS only). No open proxy. */
export function isAllowlistedProfileImageHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (!h || isBlockedProfileImageHost(h)) return false;
  if (h === "cdninstagram.com" || h.endsWith(".cdninstagram.com")) return true;
  if (/^scontent[^.]*\.cdninstagram\.com$/i.test(h)) return true;
  if (h === "fbcdn.net" || h.endsWith(".fbcdn.net")) return true;
  if (h === "platform-lookaside.fbsbx.com" || h.endsWith(".platform-lookaside.fbsbx.com")) return true;
  if (h === "profile.line-scdn.net" || h.endsWith(".line-scdn.net")) return true;
  if (h === "obs.line-scdn.net") return true;
  return false;
}

export function assertAllowlistedProfileImageUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new ProfileAvatarFetchError("invalid_url", "Profile image URL is invalid");
  }
  if (parsed.protocol !== "https:") {
    throw new ProfileAvatarFetchError("https_required", "Profile image URL must use HTTPS");
  }
  if (!isAllowlistedProfileImageHost(parsed.hostname)) {
    throw new ProfileAvatarFetchError("host_not_allowlisted", "Profile image host is not allowlisted");
  }
  if (isBlockedProfileImageHost(parsed.hostname)) {
    throw new ProfileAvatarFetchError("host_blocked", "Profile image host is blocked");
  }
  return parsed;
}

export class ProfileAvatarFetchError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ProfileAvatarFetchError";
  }
}

export function isRetryableProfileAvatarFetchError(error: unknown): boolean {
  if (error instanceof ProfileAvatarFetchError) {
    return error.code === "timeout" || error.code === "network" || error.code === "fetch_failed";
  }
  return false;
}

function validateImageContentType(contentType: string | null): void {
  const ct = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!ct.startsWith("image/")) {
    throw new ProfileAvatarFetchError("not_image", "Response is not an image");
  }
  if (ct === "image/svg+xml" || ct.includes("svg")) {
    throw new ProfileAvatarFetchError("svg_rejected", "SVG profile images are not allowed");
  }
  if (ct === "text/html" || ct === "application/xhtml+xml") {
    throw new ProfileAvatarFetchError("html_rejected", "HTML responses are not allowed");
  }
}

function sniffImageMagic(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
  if (buf.length >= 12 && buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") {
    return true;
  }
  return false;
}

export type FetchAllowedProfileImageResult = {
  body: Buffer;
  contentType: string | null;
};

export async function fetchAllowlistedProfileImage(
  sourceUrl: string,
  deps?: {
    fetchFn?: typeof fetch;
    maxBytes?: number;
    timeoutMs?: number;
    maxRedirects?: number;
  }
): Promise<FetchAllowedProfileImageResult> {
  const fetchFn = deps?.fetchFn ?? fetch;
  const maxBytes = deps?.maxBytes ?? profileAvatarMaxBytes();
  const timeoutMs = deps?.timeoutMs ?? profileAvatarFetchTimeoutMs();
  const maxRedirects = deps?.maxRedirects ?? MAX_REDIRECTS;

  let currentUrl = assertAllowlistedProfileImageUrl(sourceUrl).toString();
  let redirectCount = 0;

  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchFn(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "image/*" }
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new ProfileAvatarFetchError("timeout", "Profile image fetch timed out");
      }
      throw new ProfileAvatarFetchError("network", "Profile image fetch failed");
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new ProfileAvatarFetchError("redirect_missing_location", "Redirect missing Location header");
      }
      redirectCount += 1;
      if (redirectCount > maxRedirects) {
        throw new ProfileAvatarFetchError("too_many_redirects", "Too many redirects");
      }
      const next = new URL(location, currentUrl);
      if (next.protocol !== "https:") {
        throw new ProfileAvatarFetchError("https_required", "Redirect target must use HTTPS");
      }
      if (!isAllowlistedProfileImageHost(next.hostname) || isBlockedProfileImageHost(next.hostname)) {
        throw new ProfileAvatarFetchError("redirect_host_blocked", "Redirect target host is not allowed");
      }
      currentUrl = next.toString();
      continue;
    }

    if (!response.ok) {
      throw new ProfileAvatarFetchError(
        response.status === 403 ? "forbidden" : "fetch_failed",
        `Profile image fetch failed (${response.status})`
      );
    }

    validateImageContentType(response.headers.get("content-type"));

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ProfileAvatarFetchError("empty_body", "Profile image response has no body");
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new ProfileAvatarFetchError("too_large", "Profile image exceeds size limit");
      }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    if (body.length === 0) {
      throw new ProfileAvatarFetchError("empty_body", "Profile image response is empty");
    }
    if (!sniffImageMagic(body)) {
      throw new ProfileAvatarFetchError("not_image", "Response bytes are not a supported image");
    }
    return { body, contentType: response.headers.get("content-type") };
  }
}

export function mapCacheStatusForDb(outcome: "ok" | "failed" | "skipped"): ProfileAvatarCacheStatus {
  if (outcome === "ok") return "ok";
  if (outcome === "skipped") return "ok";
  return "failed";
}
