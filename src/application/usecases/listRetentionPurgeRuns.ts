import type { AuthContext } from "../../interfaces/api/auth.js";
import {
  retentionPurgeRunRecordToDto,
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
    return rows.map((row) => retentionPurgeRunRecordToDto(row));
  }
}
