/**
 * Testable core for the Default Tenant Facebook subscribed_apps ops script.
 * Never prints or returns page access tokens.
 */
import {
  FACEBOOK_PAGE_REQUIRED_SUBSCRIBED_FIELDS,
  FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES,
  planFacebookPageWebhookSubscriptionUnion,
  subscribeAndVerifyFacebookPageWebhook
} from "../facebookPageWebhookSubscription.js";
import {
  FacebookGraphOAuthError,
  listFacebookPageSubscribedApps
} from "../../infrastructure/adapters/meta/facebookGraphOAuth.js";

export const DEFAULT_TENANT_SUBSCRIBE_TARGET = {
  tenantId: "6797c114-a4fe-4546-a655-8ce2287fedfe",
  pageId: "657955874072241",
  smartkorpTenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
  webhookEndpoint: "https://smartkorp-hub-chat.vercel.app/api/webhook/facebook"
} as const;

export type SubscribeOpsMode = "dry-run" | "apply";

export type SubscribeOpsCliArgs = {
  mode: SubscribeOpsMode;
  help: boolean;
};

export type SubscribeOpsConnection = {
  id: string;
  tenantId: string;
  status: string;
  providerPageId: string | null;
  providerAccountName: string | null;
};

export type SubscribeOpsSummary = {
  mode: "DRY RUN" | "APPLY";
  tenantId: string;
  pageId: string;
  pageName: string | null;
  connectionStatus: string;
  appId: string;
  existingFields: string[];
  requiredFields: string[];
  fieldsToAdd: string[];
  finalFields: string[];
  writePerformed: "YES" | "NO";
  verification: "PASS" | "NOT RUN" | "FAIL";
  alreadyComplete: boolean;
  action?: string;
  error?: string;
};

export function parseSubscribeOpsCliArgs(argv: readonly string[]): SubscribeOpsCliArgs {
  const tokens = argv.slice(2);
  return {
    help: tokens.includes("--help") || tokens.includes("-h"),
    mode: tokens.includes("--apply") ? "apply" : "dry-run"
  };
}

/** Strip tokens / secret-looking material from operator errors. */
export function redactSubscribeOpsText(text: string, secrets: readonly string[] = []): string {
  let out = String(text ?? "");
  for (const secret of secrets) {
    const value = String(secret ?? "").trim();
    if (value.length >= 8) {
      out = out.split(value).join("[REDACTED]");
    }
  }
  out = out.replace(/EAA[A-Za-z0-9]+/g, "[REDACTED_TOKEN]");
  out = out.replace(/access_token=[^&\s"']+/gi, "access_token=[REDACTED]");
  out = out.replace(/encrypted_secret_value/gi, "[REDACTED_SECRET_FIELD]");
  return out;
}

export function formatSubscribeOpsSummary(summary: SubscribeOpsSummary): string {
  const lines = [
    `Mode: ${summary.mode}`,
    `Tenant: ${summary.tenantId}`,
    `Page: ${summary.pageId}${summary.pageName ? ` (${summary.pageName})` : ""}`,
    `Connection status: ${summary.connectionStatus}`,
    `App: ${summary.appId}`,
    `Existing fields: ${summary.existingFields.join(", ") || "(none)"}`,
    `Required fields: ${summary.requiredFields.join(", ")}`,
    `Fields to add: ${summary.fieldsToAdd.join(", ") || "(none)"}`,
    `Final fields: ${summary.finalFields.join(", ")}`,
    `Write performed: ${summary.writePerformed}`,
    `Verification: ${summary.verification}`
  ];
  if (summary.action) lines.push(`Action: ${summary.action}`);
  if (summary.error) lines.push(`Error: ${summary.error}`);
  return lines.join("\n");
}

export function assertSubscribeOpsTargetGuards(input: {
  connection: SubscribeOpsConnection;
  expectedTenantId?: string;
  expectedPageId?: string;
  smartkorpTenantId?: string;
  appId: string;
}): void {
  const expectedTenantId = input.expectedTenantId ?? DEFAULT_TENANT_SUBSCRIBE_TARGET.tenantId;
  const expectedPageId = input.expectedPageId ?? DEFAULT_TENANT_SUBSCRIBE_TARGET.pageId;
  const smartkorpTenantId =
    input.smartkorpTenantId ?? DEFAULT_TENANT_SUBSCRIBE_TARGET.smartkorpTenantId;
  const appId = input.appId.trim();
  if (!appId) {
    throw new Error("missing_or_invalid_META_APP_ID");
  }
  if (input.connection.tenantId === smartkorpTenantId) {
    throw new Error("refusing_smartkorp_tenant");
  }
  if (input.connection.tenantId !== expectedTenantId) {
    throw new Error("unexpected_tenant_id");
  }
  if (input.connection.providerPageId !== expectedPageId) {
    throw new Error("unexpected_page_id");
  }
}

async function assertPageTokenMatchesExpectedPage(input: {
  graphVersion: string;
  expectedPageId: string;
  pageAccessToken: string;
  fetchImpl: typeof fetch;
}): Promise<{ id: string; name: string | null }> {
  const url = new URL(
    `https://graph.facebook.com/${input.graphVersion}/me`
  );
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("access_token", input.pageAccessToken);
  const response = await input.fetchImpl(url.toString(), { method: "GET" });
  const body = (await response.json().catch(() => ({}))) as {
    id?: unknown;
    name?: unknown;
    error?: { message?: string };
  };
  if (!response.ok || typeof body.id !== "string" || !body.id.trim()) {
    throw new Error("page_token_identity_lookup_failed");
  }
  const id = body.id.trim();
  if (id !== input.expectedPageId) {
    throw new Error("page_token_resolves_to_different_page");
  }
  return {
    id,
    name: typeof body.name === "string" ? body.name : null
  };
}

export type RunSubscribeDefaultTenantFacebookPageInput = {
  mode: SubscribeOpsMode;
  graphVersion: string;
  appId: string;
  pageAccessToken: string;
  connection: SubscribeOpsConnection;
  fetchImpl?: typeof fetch;
  /** Invoked only after successful apply + verification. */
  onApplySuccess?: (input: {
    connectionId: string;
    tenantId: string;
  }) => Promise<void>;
  secretsToRedact?: readonly string[];
};

export type RunSubscribeDefaultTenantFacebookPageResult = {
  ok: boolean;
  exitCode: number;
  summary: SubscribeOpsSummary;
  summaryText: string;
};

export async function runSubscribeDefaultTenantFacebookPage(
  input: RunSubscribeDefaultTenantFacebookPageInput
): Promise<RunSubscribeDefaultTenantFacebookPageResult> {
  const secrets = [
    input.pageAccessToken,
    ...(input.secretsToRedact ?? [])
  ].filter((s) => String(s || "").trim().length >= 8);
  const fetchImpl = input.fetchImpl ?? fetch;
  const expectedPageId = DEFAULT_TENANT_SUBSCRIBE_TARGET.pageId;
  const requiredFields = [...FACEBOOK_PAGE_REQUIRED_SUBSCRIBED_FIELDS];

  try {
    assertSubscribeOpsTargetGuards({
      connection: input.connection,
      appId: input.appId
    });
    if (!input.pageAccessToken?.trim()) {
      throw new Error("missing_page_access_token");
    }

    const pageIdentity = await assertPageTokenMatchesExpectedPage({
      graphVersion: input.graphVersion,
      expectedPageId,
      pageAccessToken: input.pageAccessToken,
      fetchImpl
    });

    let appsBefore;
    try {
      appsBefore = await listFacebookPageSubscribedApps({
        graphVersion: input.graphVersion,
        pageId: expectedPageId,
        pageAccessToken: input.pageAccessToken,
        fetchImpl
      });
    } catch (error) {
      const message =
        error instanceof FacebookGraphOAuthError
          ? FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES.listFailed
          : FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES.listFailed;
      throw new Error(message);
    }

    const matchedApp =
      appsBefore.find((app) => app.id.trim() === input.appId.trim()) ?? null;
    const existingFields = matchedApp?.subscribedFields ?? [];
    const plan = planFacebookPageWebhookSubscriptionUnion({
      existingFields,
      requiredFields
    });

    const pageName =
      pageIdentity.name || input.connection.providerAccountName || null;

    if (input.mode === "dry-run") {
      const summary: SubscribeOpsSummary = {
        mode: "DRY RUN",
        tenantId: input.connection.tenantId,
        pageId: expectedPageId,
        pageName,
        connectionStatus: input.connection.status,
        appId: input.appId.trim(),
        existingFields: plan.existingFields,
        requiredFields: plan.requiredFields,
        fieldsToAdd: plan.fieldsToAdd,
        finalFields: plan.finalFields,
        writePerformed: "NO",
        verification: "NOT RUN",
        alreadyComplete: plan.alreadyComplete,
        action: plan.alreadyComplete ? "NO WRITE (already complete)" : "NO WRITE"
      };
      return {
        ok: true,
        exitCode: 0,
        summary,
        summaryText: formatSubscribeOpsSummary(summary)
      };
    }

    // APPLY — helper does GET → (optional skip) POST union → GET verify.
    let posted = false;
    let finalFields = plan.finalFields;
    try {
      const result = await subscribeAndVerifyFacebookPageWebhook({
        graphVersion: input.graphVersion,
        pageId: expectedPageId,
        pageAccessToken: input.pageAccessToken,
        expectedAppId: input.appId,
        skipPostIfAlreadyComplete: true,
        fetchImpl
      });
      posted = result.posted;
      finalFields = result.subscribedFields;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES.subscribeFailed;
      const summary: SubscribeOpsSummary = {
        mode: "APPLY",
        tenantId: input.connection.tenantId,
        pageId: expectedPageId,
        pageName,
        connectionStatus: input.connection.status,
        appId: input.appId.trim(),
        existingFields: plan.existingFields,
        requiredFields: plan.requiredFields,
        fieldsToAdd: plan.fieldsToAdd,
        finalFields: plan.finalFields,
        writePerformed: "NO",
        verification: "FAIL",
        alreadyComplete: plan.alreadyComplete,
        error: redactSubscribeOpsText(message, secrets)
      };
      return {
        ok: false,
        exitCode: 1,
        summary,
        summaryText: formatSubscribeOpsSummary(summary)
      };
    }

    if (input.onApplySuccess) {
      await input.onApplySuccess({
        connectionId: input.connection.id,
        tenantId: input.connection.tenantId
      });
    }

    const summary: SubscribeOpsSummary = {
      mode: "APPLY",
      tenantId: input.connection.tenantId,
      pageId: expectedPageId,
      pageName,
      connectionStatus: input.connection.status,
      appId: input.appId.trim(),
      existingFields: plan.existingFields,
      requiredFields: plan.requiredFields,
      fieldsToAdd: plan.fieldsToAdd,
      finalFields,
      writePerformed: posted ? "YES" : "NO",
      verification: "PASS",
      alreadyComplete: plan.alreadyComplete,
      action: posted ? "POST union subscribed_fields" : "SKIP POST (already complete)"
    };
    return {
      ok: true,
      exitCode: 0,
      summary,
      summaryText: formatSubscribeOpsSummary(summary)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const summary: SubscribeOpsSummary = {
      mode: input.mode === "apply" ? "APPLY" : "DRY RUN",
      tenantId: input.connection?.tenantId ?? DEFAULT_TENANT_SUBSCRIBE_TARGET.tenantId,
      pageId: DEFAULT_TENANT_SUBSCRIBE_TARGET.pageId,
      pageName: input.connection?.providerAccountName ?? null,
      connectionStatus: input.connection?.status ?? "UNKNOWN",
      appId: input.appId?.trim() || "(missing)",
      existingFields: [],
      requiredFields,
      fieldsToAdd: [],
      finalFields: [],
      writePerformed: "NO",
      verification: input.mode === "apply" ? "FAIL" : "NOT RUN",
      alreadyComplete: false,
      action: "NO WRITE",
      error: redactSubscribeOpsText(message, secrets)
    };
    return {
      ok: false,
      exitCode: 1,
      summary,
      summaryText: formatSubscribeOpsSummary(summary)
    };
  }
}
