import type { AuthContext } from "../../interfaces/api/auth.js";
import {
  mapWorkflowListRowToItem,
  WORKFLOW_API_VERSION,
  type WorkflowItemsPageDto
} from "../../domain/workflow.js";
import { resolveWorkflowScope } from "../../interfaces/api/workflowScope.js";
import type { WorkflowItemsQueryParsed } from "../../interfaces/api/workflowContracts.js";
import {
  createSupabaseWorkflowRepository,
  type SupabaseWorkflowRepository,
  workflowInboxClock,
  type WorkflowListClient
} from "../../infrastructure/adapters/repositories/supabaseWorkflowRepository.js";
import type { AnalyticsHeadCountClient } from "../../lib/analyticsHeadCount.js";

export type ListWorkflowItemsInput = {
  auth: AuthContext;
  query: WorkflowItemsQueryParsed;
  now?: Date;
};

export class ListWorkflowItemsUseCase {
  constructor(private readonly deps: { workflowRepository: SupabaseWorkflowRepository }) {}

  async execute(input: ListWorkflowItemsInput): Promise<WorkflowItemsPageDto> {
    if (input.query.kind !== "follow_up") {
      throw new Error("Unsupported workflow kind");
    }

    const scopeResolved = resolveWorkflowScope(
      input.auth,
      input.query.scope,
      input.query.assignedAgentId
    );
    if (!scopeResolved.ok) {
      throw new Error(scopeResolved.forbidden ? "Forbidden" : scopeResolved.message);
    }

    const now = input.now ?? new Date();
    const clock = workflowInboxClock(now);

    const [counts, listResult] = await Promise.all([
      this.deps.workflowRepository.fetchFollowUpCounts({
        tenantId: input.auth.tenantId,
        scopeFilter: { assignedAgentId: scopeResolved.assignedAgentId },
        clock
      }),
      this.deps.workflowRepository.listFollowUpItems({
        tenantId: input.auth.tenantId,
        scopeFilter: { assignedAgentId: scopeResolved.assignedAgentId },
        clock,
        status: input.query.status,
        channel: input.query.channel,
        limit: input.query.limit,
        cursor: input.query.cursor
      })
    ]);

    const items = listResult.rows
      .map((row) => mapWorkflowListRowToItem(row, now))
      .filter((item): item is NonNullable<typeof item> => item != null);

    return {
      generatedAt: now.toISOString(),
      scope: scopeResolved.scope,
      kind: "follow_up",
      items,
      pageInfo: {
        nextCursor: listResult.nextCursor,
        hasNextPage: listResult.nextCursor != null
      },
      sections: { followUp: counts },
      meta: { version: WORKFLOW_API_VERSION }
    };
  }
}

export function createListWorkflowItemsUseCaseFromSupabase(
  client: AnalyticsHeadCountClient & WorkflowListClient
): ListWorkflowItemsUseCase {
  return new ListWorkflowItemsUseCase({
    workflowRepository: createSupabaseWorkflowRepository(client)
  });
}
