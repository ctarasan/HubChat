export const FACEBOOK_OAUTH_RESUME_COOKIE_NAME = "hubchat_fb_oauth_session";
export const FACEBOOK_OAUTH_RESUME_COOKIE_PATH = "/api/channel-connect/facebook";
export const FACEBOOK_OAUTH_RESUME_COOKIE_MAX_AGE_SEC = 900;

export type FacebookOAuthResumeCookieOptions = {
  secure: boolean;
  maxAgeSec?: number;
};

export function buildFacebookOAuthResumeSetCookieHeader(
  value: string,
  options: FacebookOAuthResumeCookieOptions
): string {
  const maxAge = options.maxAgeSec ?? FACEBOOK_OAUTH_RESUME_COOKIE_MAX_AGE_SEC;
  const parts = [
    `${FACEBOOK_OAUTH_RESUME_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "HttpOnly",
    `Path=${FACEBOOK_OAUTH_RESUME_COOKIE_PATH}`,
    `Max-Age=${maxAge}`,
    "SameSite=Lax"
  ];
  if (options.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function buildFacebookOAuthResumeClearCookieHeader(
  options: FacebookOAuthResumeCookieOptions
): string {
  const parts = [
    `${FACEBOOK_OAUTH_RESUME_COOKIE_NAME}=`,
    "HttpOnly",
    `Path=${FACEBOOK_OAUTH_RESUME_COOKIE_PATH}`,
    "Max-Age=0",
    "SameSite=Lax"
  ];
  if (options.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function readFacebookOAuthResumeCookieValue(cookieHeader: string | null): string | null {
  if (!cookieHeader?.trim()) return null;
  const prefix = `${FACEBOOK_OAUTH_RESUME_COOKIE_NAME}=`;
  for (const segment of cookieHeader.split(";")) {
    const trimmed = segment.trim();
    if (!trimmed.startsWith(prefix)) continue;
    const raw = trimmed.slice(prefix.length);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}
