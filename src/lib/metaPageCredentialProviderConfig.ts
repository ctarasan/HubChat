/** Build Meta app access token for debug_token inspection (server-side only). */
export function buildMetaAppAccessToken(appId: string, appSecret: string): string {
  const id = appId.trim();
  const secret = appSecret.trim();
  if (!id || !secret) {
    throw new Error("Meta App credentials are not configured");
  }
  return `${id}|${secret}`;
}
