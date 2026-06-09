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
import { applyConnectionScopeToListRows } from "../../interfaces/api/connectionScopeList.js";
import type { ConnectionScopeRepositories } from "../../interfaces/api/connectionScopeList.js";
import type { ConnectionScopeMode } from "../../domain/channelConnectionScope.js";

export type ListWorkflowItemsInput = {
  auth: AuthContext;
  query: WorkflowItemsQueryParsed;
  now?: Date;
};

export class ListWorkflowItemsUseCase {
  constructor(
    private readonly deps: {
      workflowRepository: SupabaseWorkflowRepository;
      connectionScopeRepositories?: ConnectionScopeRepositories;
    }
  ) {}

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

    const scoped = await applyConnectionScopeToListRows({
      tenantId: input.auth.tenantId,
      auth: input.auth,
      connectionScope: input.query.connectionScope,
      rows: listResult.rows as unknown as Record<string, unknown>[],
      repositories: this.deps.connectionScopeRepositories ?? {}
    });

    const items = scoped.rows
      .map((row) => mapWorkflowListRowToItem(row as Parameters<typeof mapWorkflowListRowToItem>[0], now))
      .filter((item): item is NonNullable<typeof item> => item != null);

    return {
      generatedAt: now.toISOString(),
      scope: scopeResolved.scope,
      kind: "follow_up",
      items,
      pageInfo: {
        nextCursor: listResult.nextCursor,
        hasNextPage: listResult.nextCursor != null,
        connectionScope: scoped.mode
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

export function createListWorkflowItemsUseCaseWithConnectionScope(
  client: AnalyticsHeadCountClient & WorkflowListClient,
  connectionScopeRepositories: ConnectionScopeRepositories
): ListWorkflowItemsUseCase {
  return new ListWorkflowItemsUseCase({
    workflowRepository: createSupabaseWorkflowRepository(client),
    connectionScopeRepositories
  });
}
