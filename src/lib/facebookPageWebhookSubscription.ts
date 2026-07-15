import {
  FACEBOOK_PAGE_SUBSCRIBED_FIELDS,
  FacebookGraphOAuthError,
  listFacebookPageSubscribedApps,
  subscribeFacebookPageToApp
} from "../infrastructure/adapters/meta/facebookGraphOAuth.js";

export type FacebookPageSubscribedAppSnapshot = {
  id: string;
  subscribedFields: string[];
};

export type FacebookPageSubscriptionEvaluation =
  | { ok: true; matchedAppId: string; subscribedFields: string[] }
  | {
      ok: false;
      reason: "app_missing" | "fields_incomplete";
      matchedAppId: string | null;
      subscribedFields: string[];
      missingFields: string[];
    };

/** Safe operator-facing copy (no tokens / Graph payloads). */
export const FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES = {
  incomplete:
    "Messenger webhook subscription is incomplete. Missing required subscribed_fields.",
  appMissing: "Facebook Page is not subscribed to the HubChat Meta app.",
  verifyFailed: "Could not verify Messenger webhook subscription.",
  subscribeFailed: "Facebook Page webhook subscription failed."
} as const;

/**
 * Verify HubChat App is listed and subscribed_fields ⊇ required Messenger fields.
 * Extra Meta fields (e.g. feed) are allowed. Field order does not matter.
 */
export function evaluateFacebookPageWebhookSubscription(input: {
  apps: readonly FacebookPageSubscribedAppSnapshot[];
  expectedAppId: string;
  requiredFields?: readonly string[];
}): FacebookPageSubscriptionEvaluation {
  const required = [...(input.requiredFields ?? FACEBOOK_PAGE_SUBSCRIBED_FIELDS)];
  const expectedAppId = input.expectedAppId.trim();
  const match =
    input.apps.find((app) => app.id.trim() === expectedAppId) ??
    null;

  if (!match) {
    return {
      ok: false,
      reason: "app_missing",
      matchedAppId: null,
      subscribedFields: [],
      missingFields: required
    };
  }

  const present = new Set(
    match.subscribedFields
      .map((f) => f.trim())
      .filter(Boolean)
  );
  const missingFields = required.filter((field) => !present.has(field));
  if (missingFields.length > 0) {
    return {
      ok: false,
      reason: "fields_incomplete",
      matchedAppId: match.id,
      subscribedFields: [...present].sort(),
      missingFields
    };
  }

  return {
    ok: true,
    matchedAppId: match.id,
    subscribedFields: [...present].sort()
  };
}

export function facebookWebhookSubscriptionOperatorMessage(
  evaluation: Extract<FacebookPageSubscriptionEvaluation, { ok: false }>
): string {
  if (evaluation.reason === "app_missing") {
    return FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES.appMissing;
  }
  return FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES.incomplete;
}

/**
 * POST /{page-id}/subscribed_apps then GET-verify required Messenger fields for HubChat App.
 */
export async function subscribeAndVerifyFacebookPageWebhook(input: {
  graphVersion: string;
  pageId: string;
  pageAccessToken: string;
  expectedAppId: string;
  subscribedFields?: readonly string[];
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; subscribedFields: string[] }> {
  const required = input.subscribedFields ?? FACEBOOK_PAGE_SUBSCRIBED_FIELDS;
  try {
    await subscribeFacebookPageToApp({
      graphVersion: input.graphVersion,
      pageId: input.pageId,
      pageAccessToken: input.pageAccessToken,
      subscribedFields: required,
      fetchImpl: input.fetchImpl
    });
  } catch (error) {
    if (error instanceof FacebookGraphOAuthError) {
      throw new FacebookGraphOAuthError(
        FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES.subscribeFailed,
        error.category,
        error.statusCode
      );
    }
    throw new FacebookGraphOAuthError(
      FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES.subscribeFailed,
      "TOKEN_EXCHANGE_FAILED"
    );
  }

  let apps: Awaited<ReturnType<typeof listFacebookPageSubscribedApps>>;
  try {
    apps = await listFacebookPageSubscribedApps({
      graphVersion: input.graphVersion,
      pageId: input.pageId,
      pageAccessToken: input.pageAccessToken,
      fetchImpl: input.fetchImpl
    });
  } catch (error) {
    if (error instanceof FacebookGraphOAuthError) {
      throw new FacebookGraphOAuthError(
        FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES.verifyFailed,
        error.category,
        error.statusCode
      );
    }
    throw new FacebookGraphOAuthError(
      FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES.verifyFailed,
      "TOKEN_EXCHANGE_FAILED"
    );
  }

  const evaluation = evaluateFacebookPageWebhookSubscription({
    apps,
    expectedAppId: input.expectedAppId,
    requiredFields: required
  });
  if (!evaluation.ok) {
    throw new FacebookGraphOAuthError(
      facebookWebhookSubscriptionOperatorMessage(evaluation),
      "TOKEN_EXCHANGE_FAILED"
    );
  }
  return { ok: true, subscribedFields: evaluation.subscribedFields };
}
