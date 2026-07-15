import {
  FACEBOOK_COMMENT_SUBSCRIBED_FIELDS,
  FACEBOOK_PAGE_REQUIRED_SUBSCRIBED_FIELDS,
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
    "Page webhook subscription is incomplete. Missing required Messenger and/or feed subscribed_fields.",
  appMissing: "Facebook Page is not subscribed to the HubChat Meta app.",
  verifyFailed: "Could not verify Page webhook subscription.",
  subscribeFailed: "Facebook Page webhook subscription failed.",
  listFailed:
    "Could not read existing Page webhook subscription; refusing a destructive Messenger-only overwrite."
} as const;

export {
  FACEBOOK_COMMENT_SUBSCRIBED_FIELDS,
  FACEBOOK_PAGE_REQUIRED_SUBSCRIBED_FIELDS,
  FACEBOOK_PAGE_SUBSCRIBED_FIELDS
};

/**
 * Build a non-destructive subscribed_fields list:
 * existing (first-seen order, trimmed, deduped) ∪ required (Messenger + feed).
 * Unknown extras are preserved. `comments` is never treated as a substitute for `feed`.
 */
export function buildUnionPreservingSubscribedFields(input: {
  existingFields?: readonly string[] | null;
  requiredFields?: readonly string[];
}): string[] {
  const required = [...(input.requiredFields ?? FACEBOOK_PAGE_REQUIRED_SUBSCRIBED_FIELDS)];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of input.existingFields ?? []) {
    const field = String(raw ?? "").trim();
    if (!field || seen.has(field)) continue;
    seen.add(field);
    out.push(field);
  }

  for (const raw of required) {
    const field = String(raw ?? "").trim();
    if (!field || seen.has(field)) continue;
    seen.add(field);
    out.push(field);
  }

  return out;
}

/**
 * Verify HubChat App is listed and subscribed_fields ⊇ required Messenger + feed fields.
 * Extra Meta fields are allowed. Field order does not matter.
 */
export function evaluateFacebookPageWebhookSubscription(input: {
  apps: readonly FacebookPageSubscribedAppSnapshot[];
  expectedAppId: string;
  requiredFields?: readonly string[];
}): FacebookPageSubscriptionEvaluation {
  const required = [...(input.requiredFields ?? FACEBOOK_PAGE_REQUIRED_SUBSCRIBED_FIELDS)];
  const expectedAppId = input.expectedAppId.trim();
  const match = input.apps.find((app) => app.id.trim() === expectedAppId) ?? null;

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
 * Safe subscription repair:
 * GET existing → union with required Messenger + feed → POST union → GET verify.
 * Never POSTs Messenger-only when existing fields cannot be read safely.
 */
export async function subscribeAndVerifyFacebookPageWebhook(input: {
  graphVersion: string;
  pageId: string;
  pageAccessToken: string;
  expectedAppId: string;
  /** @deprecated Prefer required Messenger + feed; unused overrides must still include feed. */
  subscribedFields?: readonly string[];
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; subscribedFields: string[] }> {
  const required = input.subscribedFields
    ? buildUnionPreservingSubscribedFields({
        existingFields: input.subscribedFields,
        requiredFields: FACEBOOK_PAGE_REQUIRED_SUBSCRIBED_FIELDS
      })
    : [...FACEBOOK_PAGE_REQUIRED_SUBSCRIBED_FIELDS];

  let appsBefore: Awaited<ReturnType<typeof listFacebookPageSubscribedApps>>;
  try {
    appsBefore = await listFacebookPageSubscribedApps({
      graphVersion: input.graphVersion,
      pageId: input.pageId,
      pageAccessToken: input.pageAccessToken,
      fetchImpl: input.fetchImpl
    });
  } catch (error) {
    if (error instanceof FacebookGraphOAuthError) {
      throw new FacebookGraphOAuthError(
        FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES.listFailed,
        error.category,
        error.statusCode
      );
    }
    throw new FacebookGraphOAuthError(
      FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES.listFailed,
      "TOKEN_EXCHANGE_FAILED"
    );
  }

  const expectedAppId = input.expectedAppId.trim();
  const existingApp =
    appsBefore.find((app) => app.id.trim() === expectedAppId) ?? null;
  // App missing → new subscription with required set (includes feed). App present → preserve extras.
  const existingFields = existingApp?.subscribedFields ?? [];
  const unionFields = buildUnionPreservingSubscribedFields({
    existingFields,
    requiredFields: required
  });

  try {
    await subscribeFacebookPageToApp({
      graphVersion: input.graphVersion,
      pageId: input.pageId,
      pageAccessToken: input.pageAccessToken,
      subscribedFields: unionFields,
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

  let appsAfter: Awaited<ReturnType<typeof listFacebookPageSubscribedApps>>;
  try {
    appsAfter = await listFacebookPageSubscribedApps({
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
    apps: appsAfter,
    expectedAppId: input.expectedAppId,
    requiredFields: FACEBOOK_PAGE_REQUIRED_SUBSCRIBED_FIELDS
  });
  if (!evaluation.ok) {
    throw new FacebookGraphOAuthError(
      facebookWebhookSubscriptionOperatorMessage(evaluation),
      "TOKEN_EXCHANGE_FAILED"
    );
  }
  return { ok: true, subscribedFields: evaluation.subscribedFields };
}
