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

export class ListLeadsForMenuUseCase {
  constructor(
    private readonly deps: {
      conversationRepository: Pick<ConversationRepository, "listForLeadsMenu">;
      filterRows?: (rows: unknown[]) => unknown[];
    }
  ) {}

  async execute(input: {
    auth: AuthContext;
    query: ParsedLeadsListQuery;
    limit: number;
  }): Promise<{ data: LeadsListItemDto[]; pageInfo: { nextCursor: string | null } }> {
    const scope = resolveLeadsListAssignmentFilter(input.auth, input.query.owner);
    if (!scope.ok) {
      const err = new Error(scope.message);
      (err as Error & { httpStatus?: number }).httpStatus = scope.status;
      throw err;
    }

    if (!this.deps.conversationRepository.listForLeadsMenu) {
      throw new Error("Conversation repository missing listForLeadsMenu");
    }
    const result = await this.deps.conversationRepository.listForLeadsMenu({
      tenantId: input.auth.tenantId,
      channel: input.query.channel,
      leadStatus: input.query.status,
      assignmentFilter: toRepositoryAssignmentFilter(scope.filter),
      inboxFilters: buildLeadsListInboxFilters({
        followUp: input.query.followUp,
        sla: input.query.sla
      }),
      search: input.query.search,
      cursor: input.query.cursor,
      limit: input.limit
    });

    const rows = this.deps.filterRows ? this.deps.filterRows(result.items) : result.items;
    const now = new Date();
    const data = rows.map((row) => {
      const dto = toLeadsListItemDto(row as Record<string, unknown>, now);
      assertLeadsListItemDtoLean(dto as unknown as Record<string, unknown>);
      return dto;
    });

    return {
      data,
      pageInfo: { nextCursor: result.nextCursor }
    };
  }
}
