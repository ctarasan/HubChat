import type { AuthContext } from "../../interfaces/api/auth.js";
import {
  assertRetentionPurgeRunListItemDtoLean,
  toRetentionPurgeRunListItemDto,
  type RetentionPurgeRunListItemDto
} from "../../interfaces/api/retentionPurgeRunDtos.js";
import type { SupabaseRetentionPurgeRunRepository } from "../../infrastructure/adapters/repositories/supabaseRetentionPurgeRunRepository.js";

export class CancelRetentionPurgeRunUseCase {
  constructor(
    private readonly deps: {
      retentionPurgeRunRepository: Pick<
        SupabaseRetentionPurgeRunRepository,
        "findById" | "cancel"
      >;
      now?: () => Date;
    }
  ) {}

  async execute(input: {
    auth: AuthContext;
    runId: string;
  }): Promise<RetentionPurgeRunListItemDto> {
    const existing = await this.deps.retentionPurgeRunRepository.findById(
      input.auth.tenantId,
      input.runId
    );
    if (!existing) throw new Error("Retention purge run not found");
    if (existing.status !== "DRY_RUN_SNAPSHOT") {
      throw new Error("Retention purge run cannot be cancelled");
    }

    const cancelled = await this.deps.retentionPurgeRunRepository.cancel({
      tenantId: input.auth.tenantId,
      id: input.runId,
      cancelledBy: input.auth.userId,
      cancelledAtIso: (this.deps.now?.() ?? new Date()).toISOString()
    });

    const dto = toRetentionPurgeRunListItemDto({
      id: cancelled.id,
      status: cancelled.status,
      created_at: cancelled.createdAt,
      requested_by: cancelled.requestedBy,
      policy_snapshot: cancelled.policySnapshot,
      summary_snapshot: cancelled.summarySnapshot,
      samples_snapshot: cancelled.samplesSnapshot,
      notes: cancelled.notes,
      cancelled_at: cancelled.cancelledAt,
      cancelled_by: cancelled.cancelledBy
    });
    assertRetentionPurgeRunListItemDtoLean(dto);
    return dto;
  }
}
