import { assertValidLeadStatusTransition } from "../../domain/entities.js";
import type { ActivityLogRepository, LeadRepository } from "../../domain/ports.js";

interface Dependencies {
  leadRepository: LeadRepository;
  activityLogRepository: ActivityLogRepository;
}

export class AssignLeadUseCase {
  constructor(private readonly deps: Dependencies) {}

  async execute(input: {
    tenantId: string;
    leadId: string;
    fromStatus: "NEW" | "ASSIGNED" | "CONTACTED" | "QUALIFIED" | "PROPOSAL_SENT" | "NEGOTIATION" | "WON" | "LOST";
    salesAgentId: string;
  }): Promise<void> {
    assertValidLeadStatusTransition(input.fromStatus, "ASSIGNED");
    await this.deps.leadRepository.assign(input.leadId, input.salesAgentId);
    await this.deps.leadRepository.updateStatus(input.leadId, "ASSIGNED");
    await this.deps.activityLogRepository.create({
      tenantId: input.tenantId,
      leadId: input.leadId,
      type: "ASSIGNED",
      metadataJson: { salesAgentId: input.salesAgentId }
    });
  }
}
