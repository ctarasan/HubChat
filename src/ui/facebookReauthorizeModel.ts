/**
 * META-FB-POSTAPP-1C — Re-authorize confirmation copy + CTA helpers.
 * Distinct from reconnect/error recovery.
 */

import type { FacebookConnectDisplayState, FacebookConnectStatus } from "./facebookConnectModel.js";

export const FACEBOOK_REAUTHORIZE_CTA_LABEL = "Re-authorize Facebook";

export const FACEBOOK_REAUTHORIZE_CONFIRM_COPY = {
  title: "Re-authorize Facebook?",
  intro:
    "This opens Meta OAuth to refresh Facebook Page permissions after App Review. It is not an inbound or outbound smoke test.",
  mustSelectSamePage: "You must select the same linked Page. Do not choose a different Page or Business.",
  credentialUntilSuccess:
    "Current credentials stay in use until the new authorization completes successfully. After success, the Page access token may be replaced.",
  cancel: "Cancel",
  confirm: "Continue to Meta",
  pending: "Starting Meta authorization…"
} as const;

export function formatFacebookReauthorizeLinkedPageLine(input: {
  providerPageName: string | null;
  providerPageId: string | null;
}): string {
  const pageId = input.providerPageId?.trim() ?? "";
  const pageName = input.providerPageName?.trim() ?? "";
  if (pageName && pageId) return `${pageName} (${pageId})`;
  if (pageId) return `Page ID ${pageId}`;
  if (pageName) return pageName;
  return "Linked Page unavailable";
}

/**
 * Show assisted-connection Re-authorize CTA for healthy CONNECTED/READY OAuth-managed links.
 * Does not use capability UNKNOWN. Does not replace Connect or NEEDS_RECONNECT flows.
 */
export function shouldShowFacebookConnectedReauthorize(input: {
  oauthAvailable: boolean;
  presentationState: FacebookConnectDisplayState;
  connectionStatus: FacebookConnectStatus["connectionStatus"];
  providerPageId: string | null;
  disabled?: boolean;
}): boolean {
  if (input.disabled) return false;
  if (!input.oauthAvailable) return false;
  if (input.presentationState !== "CONNECTED") return false;
  if (input.connectionStatus !== "READY" && input.connectionStatus !== "CONNECTED") return false;
  if (!input.providerPageId?.trim()) return false;
  return true;
}

export function canDismissFacebookReauthorizeConfirm(phase: "idle" | "pending" | "error"): boolean {
  return phase !== "pending";
}
