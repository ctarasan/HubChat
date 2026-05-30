import type { AuthContext } from "../../interfaces/api/auth.js";
import {
  assertRetentionPurgeRunListItemDtoLean,
  toRetentionPurgeRunListItemDto,
  type RetentionPurgeRunListItemDto
} from "../../interfaces/api/retentionPurgeRunDtos.js";
import type { SupabaseRetentionPurgeRunRepository } from "../../infrastructure/adapters/repositories/supabaseRetentionPurgeRunRepository.js";

export class ListRetentionPurgeRunsUseCase {
  constructor(
    private readonly deps: {
      retentionPurgeRunRepository: Pick<SupabaseRetentionPurgeRunRepository, "listRecent">;
    }
  ) {}

  async execute(input: {
    auth: AuthContext;
    limit: number;
  }): Promise<RetentionPurgeRunListItemDto[]> {
    const rows = await this.deps.retentionPurgeRunRepository.listRecent({
      tenantId: input.auth.tenantId,
      limit: input.limit
    });
    return rows.map((row) => {
      const dto = toRetentionPurgeRunListItemDto({
        id: row.id,
        status: row.status,
        created_at: row.createdAt,
        requested_by: row.requestedBy,
        policy_snapshot: row.policySnapshot,
        summary_snapshot: row.summarySnapshot,
        samples_snapshot: row.samplesSnapshot,
        notes: row.notes,
        cancelled_at: row.cancelledAt,
        cancelled_by: row.cancelledBy
      });
      assertRetentionPurgeRunListItemDtoLean(dto);
      return dto;
    });
  }
}
