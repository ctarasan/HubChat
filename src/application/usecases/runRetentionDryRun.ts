import type { AuthContext } from "../../interfaces/api/auth.js";
import {
  assertRetentionDryRunReportLean,
  buildRetentionDryRunReport,
  type RetentionDryRunReportDto
} from "../../lib/retentionDryRun.js";
import { DEFAULT_RETENTION_POLICY } from "../../lib/retentionPolicy.js";
import type { SupabaseRetentionDryRunRepository } from "../../infrastructure/adapters/repositories/supabaseRetentionDryRunRepository.js";

export class RunRetentionDryRunUseCase {
  constructor(
    private readonly deps: {
      retentionDryRunRepository: Pick<SupabaseRetentionDryRunRepository, "fetchDryRunInput">;
      now?: () => Date;
    }
  ) {}

  async execute(input: { auth: AuthContext }): Promise<RetentionDryRunReportDto> {
    const now = this.deps.now?.() ?? new Date();
    const fetched = await this.deps.retentionDryRunRepository.fetchDryRunInput(
      input.auth.tenantId,
      DEFAULT_RETENTION_POLICY,
      now
    );
    const report = buildRetentionDryRunReport({
      tenantId: input.auth.tenantId,
      now,
      policy: DEFAULT_RETENTION_POLICY,
      archivedConversations: fetched.archivedConversations,
      messages: fetched.messages,
      webhookRawPayloadEligibleCount: fetched.webhookRawPayloadEligibleCount
    });
    assertRetentionDryRunReportLean(report);
    return report;
  }
}
