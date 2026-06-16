import type { FacebookOAuthPageCandidate, OAuthTransactionRecord } from "../../domain/oauthTransactions.js";

export type ResolvedOAuthPageSelectionTasks =
  | { ok: true; tasks: string[] }
  | { ok: false; reason: "missing_transaction" | "missing_candidate" };

export function resolveOAuthPageSelectionTasks(input: {
  transaction: OAuthTransactionRecord | null;
  providerPageId: string;
}): ResolvedOAuthPageSelectionTasks {
  const pageId = input.providerPageId.trim();
  if (!pageId) {
    return { ok: false, reason: "missing_candidate" };
  }

  const transaction = input.transaction;
  if (!transaction?.pageCandidatesJson?.length) {
    return { ok: false, reason: "missing_transaction" };
  }

  const candidate = transaction.pageCandidatesJson.find((page) => page.pageId === pageId);

  if (!candidate) {
    return { ok: false, reason: "missing_candidate" };
  }

  const tasks = candidate.tasks.filter((task): task is string => typeof task === "string" && task.length > 0);
  return { ok: true, tasks };
}

export function pageCandidateHasRequiredTasks(
  candidate: FacebookOAuthPageCandidate,
  requiredTasks: readonly string[]
): boolean {
  return requiredTasks.every((task) => candidate.tasks.includes(task));
}
