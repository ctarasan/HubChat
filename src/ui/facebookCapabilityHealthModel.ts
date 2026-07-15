/**
 * Facebook Capability Health — pure UI model for Channel Settings.
 * Derives operator-facing capability rows from existing OAuth status + health DTOs.
 */

import {
  allReadinessChecksPass,
  READINESS_CHECK_CODES,
  sanitizeFacebookConnectMessage,
  type FacebookConnectDisplayState,
  type FacebookConnectHealthResult,
  type FacebookConnectStatus,
  type HealthCheck
} from "./facebookConnectModel.js";

export type CapabilityOverallState = "HEALTHY" | "NEEDS_ATTENTION" | "CHECKING" | "UNKNOWN";

export type CapabilityItemStatus = "PASS" | "FAIL" | "WARN" | "UNKNOWN";

export const MESSENGER_CAPABILITY_FIELDS = [
  "messages",
  "messaging_postbacks",
  "message_deliveries",
  "message_reads",
  "message_echoes"
] as const;

export const COMMENT_CAPABILITY_FIELDS = ["feed"] as const;

export type CapabilityItem = {
  key: string;
  label: string;
  status: CapabilityItemStatus;
  hint?: string;
};

export type CapabilitySection = {
  id: string;
  title: string;
  status: CapabilityItemStatus;
  items: CapabilityItem[];
};

export type BuildFacebookCapabilityHealthInput = {
  status: FacebookConnectStatus;
  presentationState: FacebookConnectDisplayState;
  healthChecks: HealthCheck[];
  healthResult: FacebookConnectHealthResult | null;
  healthChecking: boolean;
};

export function lookupHealthCheck(
  checks: readonly HealthCheck[],
  code: string
): HealthCheck | null {
  return checks.find((check) => check.code === code) ?? null;
}

export function mapHealthCheckToCapabilityStatus(
  check: HealthCheck | null
): CapabilityItemStatus {
  if (!check) return "UNKNOWN";
  if (check.status === "PASS") return "PASS";
  if (check.status === "WARN") return "WARN";
  return "FAIL";
}

export function aggregateCapabilitySectionStatus(
  items: readonly CapabilityItem[]
): CapabilityItemStatus {
  if (items.length === 0) return "UNKNOWN";
  if (items.some((item) => item.status === "FAIL")) return "FAIL";
  if (items.some((item) => item.status === "WARN")) return "WARN";
  if (items.every((item) => item.status === "PASS")) return "PASS";
  return "UNKNOWN";
}

export function subscriptionGroupedCapabilityStatus(
  checks: readonly HealthCheck[]
): CapabilityItemStatus {
  return mapHealthCheckToCapabilityStatus(lookupHealthCheck(checks, "PAGE_WEBHOOK_SUBSCRIPTION"));
}

export function formatFacebookCapabilityPageLabel(input: {
  providerPageName: string | null;
  providerPageId: string | null;
}): string {
  const pageId = input.providerPageId?.trim() ?? "";
  const pageName = input.providerPageName?.trim() ?? "";
  if (pageName && pageId) return `${pageName} (${pageId})`;
  if (pageName) return pageName;
  if (pageId) return `Page ID ${pageId}`;
  return "No Page linked";
}

export function facebookCapabilityOverallLabel(state: CapabilityOverallState): string {
  switch (state) {
    case "HEALTHY":
      return "Healthy";
    case "NEEDS_ATTENTION":
      return "Needs attention";
    case "CHECKING":
      return "Checking…";
    default:
      return "Unknown";
  }
}

export function facebookCapabilityOverallCssClass(state: CapabilityOverallState): string {
  return `channel-settings-facebook-capability-overall-${state.toLowerCase().replace(/_/g, "-")}`;
}

export function facebookCapabilityItemStatusLabel(status: CapabilityItemStatus): string {
  switch (status) {
    case "PASS":
      return "Pass";
    case "FAIL":
      return "Fail";
    case "WARN":
      return "Warn";
    default:
      return "Unknown";
  }
}

export function facebookCapabilityItemStatusCssClass(status: CapabilityItemStatus): string {
  return `channel-settings-facebook-capability-item-${status.toLowerCase()}`;
}

function isAuthorizingLifecycle(input: BuildFacebookCapabilityHealthInput): boolean {
  return (
    input.presentationState === "CONNECTING" ||
    input.presentationState === "AWAITING_PAGE_SELECTION" ||
    input.status.connectionStatus === "AUTHORIZING"
  );
}

function hasFacebookConnection(status: FacebookConnectStatus): boolean {
  return Boolean(status.connectionId?.trim() || status.providerPageId?.trim());
}

export function deriveFacebookCapabilityOverallState(
  input: BuildFacebookCapabilityHealthInput
): CapabilityOverallState {
  if (input.healthChecking || isAuthorizingLifecycle(input)) {
    return "CHECKING";
  }

  if (
    input.presentationState === "NOT_CONNECTED" ||
    (!hasFacebookConnection(input.status) &&
      (input.presentationState === "MANUAL_CONFIGURED" || !input.status.oauthAvailable))
  ) {
    return "UNKNOWN";
  }

  if (
    input.status.reconnectRequired ||
    input.presentationState === "NEEDS_RECONNECT" ||
    input.presentationState === "ERROR" ||
    input.status.connectionStatus === "RECONNECT_REQUIRED" ||
    input.status.connectionStatus === "REVOKED" ||
    input.status.connectionStatus === "ERROR" ||
    input.status.healthStatus === "RECONNECT_REQUIRED" ||
    input.status.healthStatus === "ERROR"
  ) {
    return "NEEDS_ATTENTION";
  }

  const knownChecks = input.healthChecks.filter((check) =>
    (READINESS_CHECK_CODES as readonly string[]).includes(check.code)
  );
  const unknownOnly =
    input.healthChecks.length > 0 &&
    knownChecks.length === 0;

  if (knownChecks.length === 0 || unknownOnly) {
    if (input.status.connectionStatus === "READY" && input.status.healthStatus === "OK") {
      return "UNKNOWN";
    }
    if (input.status.message || input.healthResult?.message) {
      return "NEEDS_ATTENTION";
    }
    return "UNKNOWN";
  }

  if (!allReadinessChecksPass(knownChecks)) {
    return "NEEDS_ATTENTION";
  }

  if (
    input.presentationState === "CONNECTED" &&
    (input.healthResult?.healthStatus === "OK" || input.status.healthStatus === "OK")
  ) {
    return "HEALTHY";
  }

  return "UNKNOWN";
}

function buildAuthorizationItems(
  status: FacebookConnectStatus,
  checks: readonly HealthCheck[]
): CapabilityItem[] {
  const credentialCheck = lookupHealthCheck(checks, "CREDENTIAL_RESOLUTION");
  const pageAccessCheck = lookupHealthCheck(checks, "PAGE_ACCESS");
  const tasksCheck = lookupHealthCheck(checks, "REQUIRED_TASKS");

  let credentialStatus = mapHealthCheckToCapabilityStatus(credentialCheck);
  if (!credentialCheck) {
    if (status.credentialState.pageAccessToken === "SET") credentialStatus = "UNKNOWN";
    else if (
      status.credentialState.pageAccessToken === "EXPIRED" ||
      status.credentialState.pageAccessToken === "REVOKED"
    ) {
      credentialStatus = "FAIL";
    }
  }

  return [
    {
      key: "credential",
      label: "Stored credential resolved",
      status: credentialStatus,
      hint: credentialCheck?.message
    },
    {
      key: "page-access",
      label: "Page access verified",
      status: mapHealthCheckToCapabilityStatus(pageAccessCheck),
      hint: pageAccessCheck?.message
    },
    {
      key: "required-tasks",
      label: "Required Page permissions present",
      status: mapHealthCheckToCapabilityStatus(tasksCheck),
      hint: tasksCheck?.message
    }
  ];
}

function buildSubscriptionGroupedItems(
  fields: readonly string[],
  checks: readonly HealthCheck[],
  verifiedHint: string
): CapabilityItem[] {
  const groupedStatus = subscriptionGroupedCapabilityStatus(checks);
  const subscriptionCheck = lookupHealthCheck(checks, "PAGE_WEBHOOK_SUBSCRIPTION");
  const hint =
    groupedStatus === "PASS"
      ? verifiedHint
      : sanitizeFacebookConnectMessage(subscriptionCheck?.message) ?? undefined;

  return fields.map((field) => ({
    key: field,
    label: field,
    status: groupedStatus,
    hint: groupedStatus === "PASS" ? verifiedHint : hint
  }));
}

export function buildFacebookCapabilityHealthSections(
  input: BuildFacebookCapabilityHealthInput
): CapabilitySection[] {
  const { status, presentationState, healthChecks, healthResult } = input;
  const subscriptionStatus = subscriptionGroupedCapabilityStatus(healthChecks);

  const connectionItems: CapabilityItem[] = [
    {
      key: "lifecycle",
      label: "Lifecycle status",
      status: status.connectionStatus ? "PASS" : "UNKNOWN",
      hint: status.connectionStatus ?? "Not connected"
    },
    {
      key: "display",
      label: "Display state",
      status:
        presentationState === "CONNECTED"
          ? "PASS"
          : presentationState === "DEGRADED" ||
              presentationState === "NEEDS_RECONNECT" ||
              presentationState === "ERROR"
            ? "FAIL"
            : "UNKNOWN",
      hint: presentationState
    },
    {
      key: "page",
      label: "Linked Page",
      status: status.providerPageId ? "PASS" : "UNKNOWN",
      hint: formatFacebookCapabilityPageLabel(status)
    }
  ];

  const authorizationItems = buildAuthorizationItems(status, healthChecks);

  const messengerItems = buildSubscriptionGroupedItems(
    MESSENGER_CAPABILITY_FIELDS,
    healthChecks,
    "Verified via Page webhook subscription"
  );

  const commentItems = buildSubscriptionGroupedItems(
    COMMENT_CAPABILITY_FIELDS,
    healthChecks,
    "Verified via Page webhook subscription"
  );

  const graphCheck = lookupHealthCheck(healthChecks, "GRAPH_API");
  const runtimeCheck = lookupHealthCheck(healthChecks, "RUNTIME_TEST_CONNECTION");
  const graphRuntimeItems: CapabilityItem[] = [
    {
      key: "graph-api",
      label: "Graph API reachable",
      status: mapHealthCheckToCapabilityStatus(graphCheck),
      hint: graphCheck?.message
    },
    {
      key: "runtime-test",
      label: "Runtime test connection",
      status: mapHealthCheckToCapabilityStatus(runtimeCheck),
      hint: runtimeCheck?.message
    }
  ];

  const lastVerified =
    healthResult?.lastCheckedAt?.trim() ||
    status.lastCheckedAt?.trim() ||
    null;
  const safeMessage =
    sanitizeFacebookConnectMessage(healthResult?.message) ??
    sanitizeFacebookConnectMessage(status.message);

  const verificationItems: CapabilityItem[] = [
    {
      key: "last-checked",
      label: "Last health check",
      status: lastVerified ? "PASS" : "UNKNOWN",
      hint: lastVerified ?? "Not verified yet"
    },
    {
      key: "safe-message",
      label: "Status message",
      status: safeMessage ? "WARN" : "PASS",
      hint: safeMessage ?? "No issues reported"
    }
  ];

  return [
    {
      id: "connection",
      title: "Connection",
      status: aggregateCapabilitySectionStatus(connectionItems),
      items: connectionItems
    },
    {
      id: "authorization",
      title: "Authorization",
      status: aggregateCapabilitySectionStatus(authorizationItems),
      items: authorizationItems
    },
    {
      id: "messenger",
      title: "Messenger",
      status: subscriptionStatus,
      items: messengerItems
    },
    {
      id: "comments",
      title: "Facebook Comments",
      status: subscriptionStatus,
      items: commentItems
    },
    {
      id: "graph-runtime",
      title: "Graph / Runtime",
      status: aggregateCapabilitySectionStatus(graphRuntimeItems),
      items: graphRuntimeItems
    },
    {
      id: "verification",
      title: "Verification",
      status: aggregateCapabilitySectionStatus(verificationItems),
      items: verificationItems
    }
  ];
}

export function shouldShowFacebookCapabilityRunHealth(input: {
  healthActionEnabled: boolean;
  oauthAvailable: boolean;
  disabled: boolean;
  statusLoaded: boolean;
  hasConnection: boolean;
}): boolean {
  return (
    input.healthActionEnabled &&
    input.oauthAvailable &&
    input.statusLoaded &&
    input.hasConnection &&
    !input.disabled
  );
}

export function shouldShowFacebookCapabilityReauthorize(input: {
  oauthAvailable: boolean;
  healthActionEnabled: boolean;
  presentationState: FacebookConnectDisplayState;
  reconnectRequired: boolean;
}): boolean {
  if (!input.oauthAvailable || !input.healthActionEnabled) return false;
  return (
    input.reconnectRequired ||
    input.presentationState === "NEEDS_RECONNECT" ||
    input.presentationState === "ERROR"
  );
}

/** Ignore unknown health check codes without crashing presentation builders. */
export function filterKnownReadinessChecks(checks: readonly HealthCheck[]): HealthCheck[] {
  return checks.filter((check) => (READINESS_CHECK_CODES as readonly string[]).includes(check.code));
}
