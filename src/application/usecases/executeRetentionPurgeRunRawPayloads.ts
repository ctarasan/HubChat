import type { AuthContext } from "../../interfaces/api/auth.js";
import { DEFAULT_RETENTION_POLICY, subtractRetentionDays } from "../../lib/retentionPolicy.js";
import {
  assertRetentionPurgeExecuteResultLean,
  buildRetentionPurgeExecuteResult,
  isRetentionPurgeExecuteEnabled,
  RETENTION_PURGE_EXECUTE_TARGET_RAW_PAYLOADS,
  sanitizeRetentionPurgeExecutionError
} from "../../lib/retentionPurgeExecute.js";
import { retentionPurgeRunRecordToDto, type RetentionPurgeRunListItemDto } from "../../interfaces/api/retentionPurgeRunDtos.js";
import type { SupabaseRetentionPurgeRunRepository } from "../../infrastructure/adapters/repositories/supabaseRetentionPurgeRunRepository.js";
import type { SupabaseRetentionDryRunRepository } from "../../infrastructure/adapters/repositories/supabaseRetentionDryRunRepository.js";
import type { SupabaseRetentionRawPayloadPurgeRepository } from "../../infrastructure/adapters/repositories/supabaseRetentionRawPayloadPurgeRepository.js";
import { isArchivedStatus } from "../../lib/retentionDryRun.js";
import { RunRetentionDryRunUseCase } from "./runRetentionDryRun.js";

export class RetentionPurgeExecuteDisabledError extends Error {
  constructor() {
    super("Retention purge execute is disabled");
    this.name = "RetentionPurgeExecuteDisabledError";
  }
}

export class ExecuteRetentionPurgeRunRawPayloadsUseCase {
  constructor(
    private readonly deps: {
      retentionPurgeRunRepository: Pick<
        SupabaseRetentionPurgeRunRepository,
        "findById" | "claimForExecute" | "markExecuteCompleted" | "markExecuteFailed"
      >;
      retentionDryRunRepository: Pick<SupabaseRetentionDryRunRepository, "fetchDryRunInput">;
      rawPayloadPurgeRepository: Pick<
        SupabaseRetentionRawPayloadPurgeRepository,
        "redactWebhookPayloads" | "redactMessageRawPayloads"
      >;
      isExecuteEnabled?: () => boolean;
      now?: () => Date;
    }
  ) {}

  async execute(input: {
    auth: AuthContext;
    runId: string;
    batchLimit: number;
  }): Promise<RetentionPurgeRunListItemDto> {
    const enabled = this.deps.isExecuteEnabled?.() ?? isRetentionPurgeExecuteEnabled();
    if (!enabled) {
      throw new RetentionPurgeExecuteDisabledError();
    }

    const existing = await this.deps.retentionPurgeRunRepository.findById(
      input.auth.tenantId,
      input.runId
    );
    if (!existing) throw new Error("Retention purge run not found");
    if (existing.status !== "DRY_RUN_SNAPSHOT") {
      throw new Error("Retention purge run is not eligible for execute");
    }

    const now = this.deps.now?.() ?? new Date();
    const startedAtIso = now.toISOString();

    const claimed = await this.deps.retentionPurgeRunRepository.claimForExecute({
      tenantId: input.auth.tenantId,
      id: input.runId,
      executedBy: input.auth.userId,
      executionTarget: RETENTION_PURGE_EXECUTE_TARGET_RAW_PAYLOADS,
      startedAtIso
    });
    if (!claimed) {
      throw new Error("Retention purge run is not eligible for execute");
    }

    try {
      await new RunRetentionDryRunUseCase({
        retentionDryRunRepository: this.deps.retentionDryRunRepository,
        now: () => now
      }).execute({ auth: input.auth });

      const rawPayloadCutoff = subtractRetentionDays(
        now,
        DEFAULT_RETENTION_POLICY.rawPayloadRetentionDays
      ).toISOString();

      const archivedConversationIds = (
        await this.deps.retentionDryRunRepository.fetchDryRunInput(
          input.auth.tenantId,
          DEFAULT_RETENTION_POLICY,
          now
        )
      ).archivedConversations.filter((c) => isArchivedStatus(c.status)).map((c) => c.id);

      let remaining = input.batchLimit;
      const affectedWebhookEvents =
        remaining > 0
          ? await this.deps.rawPayloadPurgeRepository.redactWebhookPayloads({
              tenantId: input.auth.tenantId,
              receivedBeforeIso: rawPayloadCutoff,
              limit: remaining
            })
          : 0;
      remaining = Math.max(0, remaining - affectedWebhookEvents);

      const affectedMessageRawPayloads =
        remaining > 0
          ? await this.deps.rawPayloadPurgeRepository.redactMessageRawPayloads({
              tenantId: input.auth.tenantId,
              archivedConversationIds,
              createdBeforeIso: rawPayloadCutoff,
              limit: remaining
            })
          : 0;

      const executionResult = buildRetentionPurgeExecuteResult({
        batchLimit: input.batchLimit,
        affectedWebhookEvents,
        affectedMessageRawPayloads,
        generatedAt: now.toISOString()
      });
      assertRetentionPurgeExecuteResultLean(executionResult);

      const completed = await this.deps.retentionPurgeRunRepository.markExecuteCompleted({
        tenantId: input.auth.tenantId,
        id: input.runId,
        finishedAtIso: now.toISOString(),
        executionResult
      });

      return retentionPurgeRunRecordToDto(completed);
    } catch (error) {
      const safeError = sanitizeRetentionPurgeExecutionError(error);
      try {
        const failed = await this.deps.retentionPurgeRunRepository.markExecuteFailed({
          tenantId: input.auth.tenantId,
          id: input.runId,
          finishedAtIso: (this.deps.now?.() ?? new Date()).toISOString(),
          executionError: safeError
        });
        return retentionPurgeRunRecordToDto(failed);
      } catch {
        throw error;
      }
    }
  }
}
