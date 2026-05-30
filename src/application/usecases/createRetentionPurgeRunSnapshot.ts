import type { AuthContext } from "../../interfaces/api/auth.js";
import { buildRetentionPurgeRunSnapshots } from "../../lib/retentionPurgeRunSnapshots.js";
import { retentionPurgeRunRecordToDto, type RetentionPurgeRunListItemDto } from "../../interfaces/api/retentionPurgeRunDtos.js";
import type { SupabaseRetentionPurgeRunRepository } from "../../infrastructure/adapters/repositories/supabaseRetentionPurgeRunRepository.js";
import { RunRetentionDryRunUseCase } from "./runRetentionDryRun.js";
import type { SupabaseRetentionDryRunRepository } from "../../infrastructure/adapters/repositories/supabaseRetentionDryRunRepository.js";

/**
 * Persists a retention purge run audit row from a freshly computed server-side dry-run report.
 * Never accepts client-supplied policy/summary/samples (see POST body contract).
 */
export class CreateRetentionPurgeRunSnapshotUseCase {
  constructor(
    private readonly deps: {
      retentionDryRunRepository: Pick<SupabaseRetentionDryRunRepository, "fetchDryRunInput">;
      retentionPurgeRunRepository: Pick<SupabaseRetentionPurgeRunRepository, "create">;
      now?: () => Date;
    }
  ) {}

  async execute(input: {
    auth: AuthContext;
    notes?: string | null;
  }): Promise<RetentionPurgeRunListItemDto> {
    const dryRun = await new RunRetentionDryRunUseCase({
      retentionDryRunRepository: this.deps.retentionDryRunRepository,
      now: this.deps.now
    }).execute({ auth: input.auth });

    const snapshots = buildRetentionPurgeRunSnapshots(dryRun);
    const notes =
      typeof input.notes === "string" && input.notes.trim() ? input.notes.trim().slice(0, 2000) : null;

    const created = await this.deps.retentionPurgeRunRepository.create({
      tenantId: input.auth.tenantId,
      requestedBy: input.auth.userId,
      policySnapshot: snapshots.policySnapshot,
      summarySnapshot: snapshots.summarySnapshot,
      samplesSnapshot: snapshots.samplesSnapshot,
      notes
    });

    return retentionPurgeRunRecordToDto(created);
  }
}
