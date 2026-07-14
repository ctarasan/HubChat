import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";
import type {
  FacebookOAuthHealthCheckDto,
  FacebookOAuthHealthDto,
  FacebookOAuthHealthStatus
} from "../../domain/facebookOAuth.js";
import type { OAuthErrorCategory } from "../../domain/oauthTransactions.js";
import type {
  ChannelConnectionRepository,
  ChannelSettingRepository,
  OAuthTransactionRepository
} from "../../domain/ports.js";
import {
  verifyFacebookChannelHealth,
  type FetchFn
} from "../../infrastructure/adapters/channels/channelHealthCheck.js";
import { FacebookGraphOAuthError } from "../../infrastructure/adapters/meta/facebookGraphOAuth.js";
import { listFacebookPageSubscribedApps } from "../../infrastructure/adapters/meta/facebookGraphOAuth.js";
import { deriveFacebookOAuthDisplayState } from "../../lib/facebookOAuthDisplayState.js";
import { getRequiredFacebookPageTasks, readFacebookOAuthServerConfig } from "../../lib/facebookOAuthConfig.js";
import { isChannelConnectResolverEnabled } from "../../lib/channelConnectRuntimeMode.js";
import { sanitizeProviderErrorMessage } from "../../lib/sanitizeProviderError.js";
import {
  FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES,
  evaluateFacebookPageWebhookSubscription,
  subscribeAndVerifyFacebookPageWebhook
} from "../../lib/facebookPageWebhookSubscription.js";
import {
  isOAuthManagedFacebookConnection,
  resolveFacebookRuntimeCredentialForTest,
  resolveOAuthManagedFacebookCredential
} from "./facebookOAuthRuntimeCredential.js";
import { resolveOAuthPageSelectionTasks } from "./resolveOAuthPageSelectionTasks.js";

export type FacebookOperationalHealthCheckCode =
  | "CREDENTIAL_RESOLUTION"
  | "PAGE_ACCESS"
  | "REQUIRED_TASKS"
  | "GRAPH_API"
  | "PAGE_WEBHOOK_SUBSCRIPTION"
  | "RUNTIME_TEST_CONNECTION";

const CHECK_CODES: FacebookOperationalHealthCheckCode[] = [
  "CREDENTIAL_RESOLUTION",
  "PAGE_ACCESS",
  "REQUIRED_TASKS",
  "GRAPH_API",
  "PAGE_WEBHOOK_SUBSCRIPTION",
  "RUNTIME_TEST_CONNECTION"
];

type HealthCheckStatus = FacebookOAuthHealthCheckDto["status"];

type ResolvedCredential = {
  accessToken: string;
  providerPageId: string;
  providerAccountName: string | null;
  oauthManaged: boolean;
};

function normalizeGraphVersion(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "v25.0";
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

async function readGraphFailure(response: Response): Promise<{ message: string; reconnectProven: boolean; category: OAuthErrorCategory }> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string; code?: number; type?: string };
    };
    const code = body.error?.code;
    const reconnectProven = code === 190 || code === 102;
    const category: OAuthErrorCategory = reconnectProven
      ? "RECONNECT_REQUIRED"
      : response.status >= 500
        ? "PROVIDER_TEMPORARY"
        : "UNKNOWN";
    const message = sanitizeProviderErrorMessage(
      body.error?.message ?? `Graph API request failed (HTTP ${response.status})`
    );
    return { message, reconnectProven, category };
  } catch {
    const category: OAuthErrorCategory = response.status >= 500 ? "PROVIDER_TEMPORARY" : "UNKNOWN";
    return {
      message: sanitizeProviderErrorMessage(`Graph API request failed (HTTP ${response.status})`),
      reconnectProven: false,
      category
    };
  }
}

async function fetchFacebookPageProfile(input: {
  pageId: string;
  accessToken: string;
  graphVersion: string;
  fetchFn: FetchFn;
}): Promise<
  | { ok: true; id: string; name: string }
  | { ok: false; message: string; reconnectProven: boolean; category: OAuthErrorCategory }
> {
  const version = normalizeGraphVersion(input.graphVersion);
  const url =
    `https://graph.facebook.com/${version}/${encodeURIComponent(input.pageId)}` +
    `?fields=id,name&access_token=${encodeURIComponent(input.accessToken)}`;

  try {
    const response = await input.fetchFn(url, { method: "GET" });
    if (!response.ok) {
      const failure = await readGraphFailure(response);
      return { ok: false, ...failure };
    }
    const body = (await response.json()) as { id?: string; name?: string };
    const id = typeof body.id === "string" ? body.id : "";
    const name = typeof body.name === "string" ? body.name : "";
    if (!id) {
      return {
        ok: false,
        message: "Facebook Page profile response was incomplete.",
        reconnectProven: false,
        category: "UNKNOWN"
      };
    }
    return { ok: true, id, name };
  } catch (error) {
    const message = sanitizeProviderErrorMessage(error);
    const reconnectProven = error instanceof FacebookGraphOAuthError && error.category === "RECONNECT_REQUIRED";
    const category: OAuthErrorCategory =
      error instanceof FacebookGraphOAuthError
        ? error.category
        : message.toLowerCase().includes("network")
          ? "PROVIDER_TEMPORARY"
          : "UNKNOWN";
    return { ok: false, message, reconnectProven, category };
  }
}

async function probeGraphApiReachable(input: {
  accessToken: string;
  graphVersion: string;
  fetchFn: FetchFn;
}): Promise<
  | { ok: true }
  | { ok: false; message: string; reconnectProven: boolean; category: OAuthErrorCategory }
> {
  const version = normalizeGraphVersion(input.graphVersion);
  const url =
    `https://graph.facebook.com/${version}/me?fields=id&access_token=${encodeURIComponent(input.accessToken)}`;

  try {
    const response = await input.fetchFn(url, { method: "GET" });
    if (!response.ok) {
      const failure = await readGraphFailure(response);
      return { ok: false, ...failure };
    }
    return { ok: true };
  } catch (error) {
    const message = sanitizeProviderErrorMessage(error);
    const reconnectProven = error instanceof FacebookGraphOAuthError && error.category === "RECONNECT_REQUIRED";
    const category: OAuthErrorCategory =
      error instanceof FacebookGraphOAuthError ? error.category : "PROVIDER_TEMPORARY";
    return { ok: false, message, reconnectProven, category };
  }
}

function blockedCheck(
  code: FacebookOperationalHealthCheckCode,
  message: string
): FacebookOAuthHealthCheckDto {
  return { code, status: "FAIL", message };
}

function credentialResolutionMessage(reason: string): string {
  switch (reason) {
    case "encryption_key_missing":
      return "Credential encryption is not configured.";
    case "credential_missing":
      return "Stored OAuth credential was not found.";
    case "credential_invalid":
      return "Stored OAuth credential is not active.";
    case "decrypt_failed":
      return "Stored credential could not be decrypted.";
    case "tenant_mismatch":
      return "Connection does not belong to this tenant.";
    default:
      return "Stored credential could not be resolved.";
  }
}

function isReconnectProvenCategory(category: OAuthErrorCategory | null): boolean {
  return (
    category === "RECONNECT_REQUIRED" ||
    category === "SESSION_EXPIRED" ||
    category === "MISSING_PAGE_TASKS"
  );
}

function aggregateHealthResult(input: {
  checks: FacebookOAuthHealthCheckDto[];
  connection: ChannelConnectionRecord;
  wasReady: boolean;
  reconnectProven: boolean;
  errorCategory: OAuthErrorCategory | null;
  message: string | null;
  lastCheckedAt: string;
}): FacebookOAuthHealthDto {
  const allPass = input.checks.every((check) => check.status === "PASS");
  const anyBlocking = input.checks.some((check) => check.status === "WARN" || check.status === "FAIL");

  let healthStatus: FacebookOAuthHealthStatus;
  let connectionStatus = input.connection.status;
  let reconnectRequired = false;
  let displayState = deriveFacebookOAuthDisplayState({
    connectionStatus: input.connection.status,
    healthStatus: "UNKNOWN",
    reconnectRequired: false,
    hasConnection: true
  });

  if (input.reconnectProven) {
    healthStatus = "RECONNECT_REQUIRED";
    reconnectRequired = true;
    connectionStatus =
      input.connection.status === "REVOKED" ? "REVOKED" : "RECONNECT_REQUIRED";
    displayState = "NEEDS_RECONNECT";
  } else if (allPass) {
    healthStatus = "OK";
    connectionStatus = "READY";
    reconnectRequired = false;
    displayState = "CONNECTED";
  } else if (
    input.checks.some(
      (check) => check.code === "PAGE_WEBHOOK_SUBSCRIPTION" && check.status === "FAIL"
    )
  ) {
    // Incomplete Meta Page webhook subscription must never remain READY.
    healthStatus = "ERROR";
    reconnectRequired = false;
    connectionStatus = input.wasReady ? "ERROR" : "AUTHORIZING";
    displayState = input.wasReady ? "ERROR" : "CONNECTING";
  } else if (anyBlocking && !input.wasReady) {
    healthStatus = input.errorCategory === "PROVIDER_TEMPORARY" ? "ERROR" : "DEGRADED";
    if (input.errorCategory === "PROVIDER_TEMPORARY") {
      healthStatus = "ERROR";
    }
    connectionStatus = "AUTHORIZING";
    reconnectRequired = false;
    displayState = "CONNECTING";
  } else if (input.wasReady && anyBlocking) {
    healthStatus = "DEGRADED";
    connectionStatus = "READY";
    reconnectRequired = false;
    displayState = "DEGRADED";
  } else {
    healthStatus = "ERROR";
    connectionStatus = input.connection.status;
    reconnectRequired = false;
    displayState = deriveFacebookOAuthDisplayState({
      connectionStatus: input.connection.status,
      healthStatus: "ERROR",
      reconnectRequired: false,
      hasConnection: true
    });
  }

  return {
    healthStatus,
    reconnectRequired,
    connectionStatus,
    displayState,
    lastCheckedAt: input.lastCheckedAt,
    errorCategory: input.errorCategory,
    message: input.message,
    checks: input.checks
  };
}

function pushUniqueCheck(
  checks: FacebookOAuthHealthCheckDto[],
  check: FacebookOAuthHealthCheckDto
): void {
  if (checks.some((existing) => existing.code === check.code)) {
    throw new Error(`Duplicate health check code: ${check.code}`);
  }
  checks.push(check);
}

function blockedChecksAfterCredentialFailure(): FacebookOAuthHealthCheckDto[] {
  return CHECK_CODES.slice(1).map((code) => blockedCheck(code, "Blocked by credential resolution failure."));
}

export type RunFacebookOperationalHealthInput = {
  tenantId: string;
  connection: ChannelConnectionRecord;
  channelConnectionRepository: ChannelConnectionRepository;
  channelSettingRepository: ChannelSettingRepository;
  oauthTransactionRepository: OAuthTransactionRepository;
  graphVersion: string;
  fetchFn?: FetchFn;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
};

export async function runFacebookOperationalHealth(
  input: RunFacebookOperationalHealthInput
): Promise<{
  result: FacebookOAuthHealthDto;
  persistStatus: ChannelConnectionRecord["status"];
  credentialRevoked?: boolean;
}> {
  const fetchFn = input.fetchFn ?? fetch;
  const now = input.now ?? (() => new Date());
  const lastCheckedAt = now().toISOString();
  const wasReady = input.connection.status === "READY";

  const credentialMetadata = await input.channelConnectionRepository.listCredentialMetadataByConnection(
    input.tenantId,
    input.connection.id
  );
  const oauthManaged = isOAuthManagedFacebookConnection(input.connection, credentialMetadata);

  const checks: FacebookOAuthHealthCheckDto[] = [];
  let resolved: ResolvedCredential | null = null;
  let reconnectProven = false;
  let errorCategory: OAuthErrorCategory | null = null;
  let operatorMessage: string | null = null;

  const credentialResult = await resolveOAuthManagedFacebookCredential({
    channelConnectionRepository: input.channelConnectionRepository,
    tenantId: input.tenantId,
    connection: input.connection
  });

  if (credentialResult.ok) {
    pushUniqueCheck(checks, {
      code: "CREDENTIAL_RESOLUTION",
      status: "PASS",
      message: "Stored credential resolved successfully"
    });
    const pageId = credentialResult.providerPageId?.trim();
    if (!pageId) {
      for (const code of CHECK_CODES.slice(1)) {
        pushUniqueCheck(checks, blockedCheck(code, "Selected Facebook Page is not configured."));
      }
      errorCategory = errorCategory ?? "UNKNOWN";
      operatorMessage = operatorMessage ?? "Selected Facebook Page is not configured.";
    } else {
      resolved = {
        accessToken: credentialResult.accessToken,
        providerPageId: pageId,
        providerAccountName: credentialResult.providerAccountName,
        oauthManaged
      };
    }
  } else {
    const message = credentialResolutionMessage(credentialResult.reason);
    pushUniqueCheck(checks, { code: "CREDENTIAL_RESOLUTION", status: "FAIL", message });
    if (
      credentialResult.reason === "credential_invalid" ||
      credentialResult.reason === "decrypt_failed"
    ) {
      reconnectProven = true;
      errorCategory = "RECONNECT_REQUIRED";
      operatorMessage = message;
    } else {
      errorCategory = "UNKNOWN";
      operatorMessage = message;
    }
    for (const blocked of blockedChecksAfterCredentialFailure()) {
      pushUniqueCheck(checks, blocked);
    }
  }

  if (resolved) {
    const pageProfile = await fetchFacebookPageProfile({
      pageId: resolved.providerPageId,
      accessToken: resolved.accessToken,
      graphVersion: input.graphVersion,
      fetchFn
    });

    if (pageProfile.ok && pageProfile.id === resolved.providerPageId) {
      pushUniqueCheck(checks, {
        code: "PAGE_ACCESS",
        status: "PASS",
        message: "Facebook Page access verified for the selected Page."
      });
    } else if (pageProfile.ok) {
      pushUniqueCheck(checks, {
        code: "PAGE_ACCESS",
        status: "FAIL",
        message: "Selected Facebook Page does not match the stored Page."
      });
      errorCategory = errorCategory ?? "UNKNOWN";
      operatorMessage = operatorMessage ?? "Selected Facebook Page does not match the stored Page.";
    } else {
      pushUniqueCheck(checks, {
        code: "PAGE_ACCESS",
        status: "FAIL",
        message: pageProfile.message
      });
      if (pageProfile.reconnectProven) {
        reconnectProven = true;
        errorCategory = pageProfile.category;
        operatorMessage = pageProfile.message;
      } else {
        errorCategory = errorCategory ?? pageProfile.category;
        operatorMessage = operatorMessage ?? pageProfile.message;
      }
    }

    const completedTransaction =
      await input.oauthTransactionRepository.findLatestCompletedForConnection(
        input.tenantId,
        input.connection.id
      );
    const persistedTasks = resolveOAuthPageSelectionTasks({
      transaction: completedTransaction,
      providerPageId: resolved.providerPageId
    });
    const requiredTasks = getRequiredFacebookPageTasks();
    if (!persistedTasks.ok) {
      pushUniqueCheck(checks, {
        code: "REQUIRED_TASKS",
        status: "FAIL",
        message: "Page permission snapshot from OAuth selection is unavailable."
      });
      reconnectProven = true;
      errorCategory = "MISSING_PAGE_TASKS";
      operatorMessage = "Page permission snapshot from OAuth selection is unavailable.";
    } else {
      const missingTasks = requiredTasks.filter((task) => !persistedTasks.tasks.includes(task));
      if (missingTasks.length === 0) {
        pushUniqueCheck(checks, {
          code: "REQUIRED_TASKS",
          status: "PASS",
          message: "Required Page permissions are present."
        });
      } else {
        pushUniqueCheck(checks, {
          code: "REQUIRED_TASKS",
          status: "FAIL",
          message: "Selected Page is missing required permissions."
        });
        reconnectProven = true;
        errorCategory = "MISSING_PAGE_TASKS";
        operatorMessage = "Selected Page is missing required permissions.";
      }
    }

    const graphProbe = await probeGraphApiReachable({
      accessToken: resolved.accessToken,
      graphVersion: input.graphVersion,
      fetchFn
    });
    if (graphProbe.ok) {
      pushUniqueCheck(checks, {
        code: "GRAPH_API",
        status: "PASS",
        message: "Facebook Graph API is reachable."
      });
    } else {
      pushUniqueCheck(checks, {
        code: "GRAPH_API",
        status: "FAIL",
        message: graphProbe.message
      });
      if (graphProbe.reconnectProven) {
        reconnectProven = true;
        errorCategory = graphProbe.category;
        operatorMessage = graphProbe.message;
      } else {
        errorCategory = errorCategory ?? graphProbe.category;
        operatorMessage = operatorMessage ?? graphProbe.message;
      }
    }

    const env = input.env ?? process.env;
    const oauthConfig = readFacebookOAuthServerConfig(env);
    const expectedAppId = oauthConfig.appId?.trim() ?? "";
    if (!expectedAppId) {
      pushUniqueCheck(checks, {
        code: "PAGE_WEBHOOK_SUBSCRIPTION",
        status: "FAIL",
        message: FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES.verifyFailed
      });
      errorCategory = errorCategory ?? "UNKNOWN";
      operatorMessage = operatorMessage ?? FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES.verifyFailed;
    } else if (!graphProbe.ok && graphProbe.reconnectProven) {
      pushUniqueCheck(
        checks,
        blockedCheck("PAGE_WEBHOOK_SUBSCRIPTION", "Blocked by Graph API failure.")
      );
    } else {
      try {
        const apps = await listFacebookPageSubscribedApps({
          graphVersion: input.graphVersion,
          pageId: resolved.providerPageId,
          pageAccessToken: resolved.accessToken,
          fetchImpl: fetchFn
        });
        const evaluation = evaluateFacebookPageWebhookSubscription({
          apps,
          expectedAppId
        });
        if (evaluation.ok) {
          pushUniqueCheck(checks, {
            code: "PAGE_WEBHOOK_SUBSCRIPTION",
            status: "PASS",
            message: "Messenger webhook subscription verified for required fields."
          });
        } else {
          await subscribeAndVerifyFacebookPageWebhook({
            graphVersion: input.graphVersion,
            pageId: resolved.providerPageId,
            pageAccessToken: resolved.accessToken,
            expectedAppId,
            fetchImpl: fetchFn
          });
          pushUniqueCheck(checks, {
            code: "PAGE_WEBHOOK_SUBSCRIPTION",
            status: "PASS",
            message: "Messenger webhook subscription verified for required fields."
          });
        }
      } catch (error) {
        const message =
          error instanceof FacebookGraphOAuthError
            ? sanitizeProviderErrorMessage(error.message)
            : FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES.verifyFailed;
        pushUniqueCheck(checks, {
          code: "PAGE_WEBHOOK_SUBSCRIPTION",
          status: "FAIL",
          message
        });
        errorCategory =
          errorCategory ??
          (error instanceof FacebookGraphOAuthError ? error.category : "TOKEN_EXCHANGE_FAILED");
        operatorMessage = operatorMessage ?? message;
      }
    }

    if (oauthManaged && !isChannelConnectResolverEnabled(env)) {
      pushUniqueCheck(checks, {
        code: "RUNTIME_TEST_CONNECTION",
        status: "FAIL",
        message: "Runtime credential resolver is not enabled for OAuth operational validation."
      });
      errorCategory = errorCategory ?? "UNKNOWN";
      operatorMessage =
        operatorMessage ?? "Runtime credential resolver is not enabled for OAuth operational validation.";
    } else {
      const runtimeResolved = await resolveFacebookRuntimeCredentialForTest({
        tenantId: input.tenantId,
        channelConnectionRepository: input.channelConnectionRepository,
        channelSettingRepository: input.channelSettingRepository,
        env
      });

      if (!runtimeResolved.ok) {
        pushUniqueCheck(checks, {
          code: "RUNTIME_TEST_CONNECTION",
          status: "FAIL",
          message: runtimeResolved.message
        });
        errorCategory = errorCategory ?? "UNKNOWN";
        operatorMessage = operatorMessage ?? runtimeResolved.message;
      } else if (oauthManaged && runtimeResolved.resolved.source !== "oauth_channel_credentials") {
        pushUniqueCheck(checks, {
          code: "RUNTIME_TEST_CONNECTION",
          status: "FAIL",
          message: "Runtime path did not use the OAuth-managed credential."
        });
        errorCategory = errorCategory ?? "UNKNOWN";
        operatorMessage = operatorMessage ?? "Runtime path did not use the OAuth-managed credential.";
      } else {
        const runtimeOutcome = await verifyFacebookChannelHealth(
          runtimeResolved.resolved.runtime,
          fetchFn,
          input.graphVersion
        );
        if (runtimeOutcome.ok) {
          pushUniqueCheck(checks, {
            code: "RUNTIME_TEST_CONNECTION",
            status: "PASS",
            message: "Facebook runtime Test Connection path succeeded with the stored credential."
          });
        } else {
          const message = sanitizeProviderErrorMessage(runtimeOutcome.message);
          pushUniqueCheck(checks, {
            code: "RUNTIME_TEST_CONNECTION",
            status: "FAIL",
            message
          });
          if (message.toLowerCase().includes("expired") || message.toLowerCase().includes("revoked")) {
            reconnectProven = true;
            errorCategory = "RECONNECT_REQUIRED";
          } else {
            errorCategory = errorCategory ?? "UNKNOWN";
          }
          operatorMessage = operatorMessage ?? message;
        }
      }
    }
  }

  if (errorCategory && isReconnectProvenCategory(errorCategory)) {
    reconnectProven = true;
  }

  const result = aggregateHealthResult({
    checks,
    connection: input.connection,
    wasReady,
    reconnectProven,
    errorCategory,
    message: operatorMessage,
    lastCheckedAt
  });

  return {
    result,
    persistStatus: result.connectionStatus,
    credentialRevoked: reconnectProven && result.reconnectRequired
  };
}
