import type { InstagramOAuthConnectErrorCode } from "./instagramOAuthConnectErrors.js";
import type { InstagramOAuthReturnDestination } from "../domain/instagramOAuthStates.js";

const RETURN_DESTINATION_ROUTES: Record<InstagramOAuthReturnDestination, string> = {
  CHANNEL_SETTINGS: "/dashboard/channel-settings"
};

export function buildInstagramOAuthChannelSettingsRedirectUrl(input: {
  appBaseUrl: string;
  result: "connected" | "error";
  errorCode?: InstagramOAuthConnectErrorCode | null;
}): string {
  const base = input.appBaseUrl.replace(/\/$/, "");
  const url = new URL(`${base}${RETURN_DESTINATION_ROUTES.CHANNEL_SETTINGS}`);
  url.searchParams.set("channel", "instagram");
  url.searchParams.set("instagramOAuth", input.result === "connected" ? "connected" : "error");
  if (input.result === "error" && input.errorCode) {
    url.searchParams.set("errorCode", input.errorCode);
  }
  return url.toString();
}

export function assertInstagramOAuthRedirectUrlSafe(url: string): void {
  const parsed = new URL(url);
  const blocked = ["code", "state", "access_token", "tenantId", "channelConnectionId", "credentialId", "providerUserId"];
  for (const key of blocked) {
    if (parsed.searchParams.has(key)) {
      throw new Error("Unsafe OAuth redirect URL");
    }
  }
  if (/[?&](code|state|access_token)=/i.test(url)) {
    throw new Error("Unsafe OAuth redirect URL");
  }
}

export function assertInstagramOAuthStartResponseSafe(payload: unknown): void {
  const serialized = JSON.stringify(payload);
  const blockedPatterns = [
    /IGA[A-Za-z0-9]{10,}/,
    /EAA[A-Za-z0-9]{10,}/,
    /access_token/i,
    /client_secret/i,
    /authorization code/i,
    /"state"\s*:\s*"/,
    /pkce/i,
    /verifier/i
  ];
  for (const pattern of blockedPatterns) {
    if (pattern.test(serialized)) {
      throw new Error("OAuth start response contains blocked sensitive material");
    }
  }
}
