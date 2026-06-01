import type { AuthContext } from "../../interfaces/api/auth.js";
import type { WorkflowSummaryDto } from "../../domain/workflow.js";
import { WORKFLOW_API_VERSION } from "../../domain/workflow.js";
import { resolveWorkflowScope } from "../../interfaces/api/workflowScope.js";
import type { WorkflowSummaryQuery } from "../../interfaces/api/workflowContracts.js";
import {
  createSupabaseWorkflowRepository,
  type SupabaseWorkflowRepository,
  workflowInboxClock,
  type WorkflowListClient
} from "../../infrastructure/adapters/repositories/supabaseWorkflowRepository.js";
import type { AnalyticsHeadCountClient } from "../../lib/analyticsHeadCount.js";

export type GetWorkflowSummaryInput = {
  auth: AuthContext;
  query: WorkflowSummaryQuery;
  now?: Date;
};

export class GetWorkflowSummaryUseCase {
  constructor(private readonly deps: { workflowRepository: SupabaseWorkflowRepository }) {}

  async execute(input: GetWorkflowSummaryInput): Promise<WorkflowSummaryDto> {
    const scopeResolved = resolveWorkflowScope(input.auth, input.query.scope);
    if (!scopeResolved.ok) {
      throw new Error(scopeResolved.forbidden ? "Forbidden" : scopeResolved.message);
    }

    const now = input.now ?? new Date();
    const clock = workflowInboxClock(now);
    const followUp = await this.deps.workflowRepository.fetchFollowUpCounts({
      tenantId: input.auth.tenantId,
      scopeFilter: { assignedAgentId: scopeResolved.assignedAgentId },
      clock
    });

    return {
      generatedAt: now.toISOString(),
      scope: scopeResolved.scope,
      followUp,
      meta: { version: WORKFLOW_API_VERSION }
    };
  }
}

export function createGetWorkflowSummaryUseCaseFromSupabase(
  client: AnalyticsHeadCountClient & WorkflowListClient
): GetWorkflowSummaryUseCase {
  return new GetWorkflowSummaryUseCase({
    workflowRepository: createSupabaseWorkflowRepository(client)
  });
}
