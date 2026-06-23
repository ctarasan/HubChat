import { facebookOAuthScopes, getRequiredFacebookPageTasks } from "./facebookOAuthConfig.js";
import type { MetaPageBindingChannelType } from "../domain/metaPageCredentials.js";

/** Facebook messaging and Page discovery — required for Meta Page credential activation. */
export const FACEBOOK_REQUIRED_SCOPES: readonly string[] = facebookOAuthScopes();

/** Optional scopes that do not block activation when absent. */
export const FACEBOOK_OPTIONAL_SCOPES: readonly string[] = ["business_management", "pages_read_user_content"];

/** Required when Instagram binding is requested (Page-token path). */
export const INSTAGRAM_REQUIRED_SCOPES: readonly string[] = [
  "instagram_basic",
  "instagram_manage_messages",
  "pages_show_list",
  "pages_read_engagement"
];

export const INSTAGRAM_OPTIONAL_SCOPES: readonly string[] = [];

export const META_PAGE_REQUIRED_FACEBOOK_TASKS: readonly string[] = getRequiredFacebookPageTasks();

export type MetaPageScopeEvaluationResult =
  | { ok: true; normalizedGrantedScopes: string[] }
  | { ok: false; channel: MetaPageBindingChannelType; missingScopes: string[] };

export function normalizeMetaPageGrantedScopes(scopes: Iterable<string>): string[] {
  const seen = new Set<string>();
  for (const raw of scopes) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) continue;
    seen.add(trimmed);
  }
  return [...seen].sort();
}

function missingRequired(
  granted: readonly string[],
  required: readonly string[]
): string[] {
  const grantedSet = new Set(granted);
  return required.filter((scope) => !grantedSet.has(scope.toLowerCase())).sort();
}

export function evaluateMetaPageScopePolicy(input: {
  requestedChannels: readonly MetaPageBindingChannelType[];
  grantedScopes: readonly string[];
}): MetaPageScopeEvaluationResult {
  const normalized = normalizeMetaPageGrantedScopes(input.grantedScopes);
  const requested = new Set(input.requestedChannels);

  if (requested.has("FACEBOOK")) {
    const missingFacebook = missingRequired(normalized, FACEBOOK_REQUIRED_SCOPES);
    if (missingFacebook.length > 0) {
      return { ok: false, channel: "FACEBOOK", missingScopes: missingFacebook };
    }
  }

  if (requested.has("INSTAGRAM")) {
    const missingInstagram = missingRequired(normalized, INSTAGRAM_REQUIRED_SCOPES);
    if (missingInstagram.length > 0) {
      return { ok: false, channel: "INSTAGRAM", missingScopes: missingInstagram };
    }
  }

  return { ok: true, normalizedGrantedScopes: normalized };
}

export function pageTasksSatisfyRequired(tasks: readonly string[]): boolean {
  const taskSet = new Set(tasks.map((t) => t.trim().toUpperCase()).filter(Boolean));
  return META_PAGE_REQUIRED_FACEBOOK_TASKS.every((task) => taskSet.has(task.toUpperCase()));
}
