import type { AuthContext } from "../../interfaces/api/auth.js";
import type { ConversationRepository } from "../../domain/ports.js";
import {
  buildLeadsListInboxFilters,
  type ParsedLeadsListQuery
} from "../../interfaces/api/leadsListQuery.js";
import {
  resolveLeadsListAssignmentFilter,
  toRepositoryAssignmentFilter
} from "../../interfaces/api/leadsListOwner.js";
import {
  assertLeadsListItemDtoLean,
  toLeadsListItemDto,
  type LeadsListItemDto
} from "../../interfaces/api/leadsListDtos.js";
import {
  loadInboxSlaListContextForTenant
} from "../sla/resolveInboxFilterClock.js";
import { buildListSlaPageInfoFields } from "../../interfaces/api/listSlaPageInfo.js";
import { applyConnectionScopeToListRows } from "../../interfaces/api/connectionScopeList.js";
import type { ConnectionScopeRepositories } from "../../interfaces/api/connectionScopeList.js";
import type { ConnectionScopeMode } from "../../domain/channelConnectionScope.js";

type LoadInboxSlaListContextForTenantFn = typeof loadInboxSlaListContextForTenant;

export class ListLeadsForMenuUseCase {
  constructor(
    private readonly deps: {
      conversationRepository: Pick<ConversationRepository, "listForLeadsMenu">;
      filterRows?: (rows: unknown[]) => unknown[];
      loadInboxSlaListContextForTenant?: LoadInboxSlaListContextForTenantFn;
      connectionScopeRepositories?: ConnectionScopeRepositories;
    }
  ) {}

  async execute(input: {
    auth: AuthContext;
    query: ParsedLeadsListQuery;
    limit: number;
    connectionScope?: ConnectionScopeMode;
  }): Promise<{
    data: LeadsListItemDto[];
    pageInfo: {
      nextCursor: string | null;
      slaWarningBeforeBreachMinutes: number;
      connectionScope: ConnectionScopeMode;
    };
  }> {
    const scope = resolveLeadsListAssignmentFilter(input.auth, input.query.owner);
    if (!scope.ok) {
      const err = new Error(scope.message);
      (err as Error & { httpStatus?: number }).httpStatus = scope.status;
      throw err;
    }

    if (!this.deps.conversationRepository.listForLeadsMenu) {
      throw new Error("Conversation repository missing listForLeadsMenu");
    }

    const loadContext = this.deps.loadInboxSlaListContextForTenant ?? loadInboxSlaListContextForTenant;
    const slaListContext = await loadContext(input.auth.tenantId);

    const result = await this.deps.conversationRepository.listForLeadsMenu({
      tenantId: input.auth.tenantId,
      channel: input.query.channel,
      leadStatus: input.query.status,
      assignmentFilter: toRepositoryAssignmentFilter(scope.filter),
      inboxFilters: buildLeadsListInboxFilters({
        followUp: input.query.followUp,
        sla: input.query.sla
      }),
      inboxFilterClock: slaListContext.inboxFilterClock,
      search: input.query.search,
      cursor: input.query.cursor,
      limit: input.limit
    });

    const preFiltered = this.deps.filterRows ? this.deps.filterRows(result.items) : result.items;
    const scoped = await applyConnectionScopeToListRows({
      tenantId: input.auth.tenantId,
      auth: input.auth,
      connectionScope: input.connectionScope ?? input.query.connectionScope,
      rows: preFiltered as Record<string, unknown>[],
      repositories: this.deps.connectionScopeRepositories ?? {}
    });
    const now = new Date();
    const data = scoped.rows.map((row) => {
      const dto = toLeadsListItemDto(row, now, { connectionScopeContext: scoped.scopeContext });
      assertLeadsListItemDtoLean(dto as unknown as Record<string, unknown>);
      return dto;
    });

    return {
      data,
      pageInfo: {
        nextCursor: result.nextCursor,
        connectionScope: scoped.mode,
        ...buildListSlaPageInfoFields(slaListContext.warningBeforeBreachMinutes)
      }
    };
  }
}
