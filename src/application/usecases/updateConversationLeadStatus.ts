import { z } from "zod";
import type { AuthContext } from "../../interfaces/api/auth.js";
import type {
  ActivityLogRepository,
  ConversationEventRepository,
  ConversationRepository,
  LeadRepository
} from "../../domain/ports.js";
import type { LeadStatus, UUID } from "../../domain/entities.js";
import type { LeadManagementStatus } from "../../domain/leadManagementStatus.js";
import {
  assertValidLeadManagementStatusTransition,
  isTerminalLeadManagementStatus,
  leadStatusToManagementStatus,
  resolveLeadStatusForManagementUpdate
} from "../../domain/leadManagementStatus.js";
import { canUpdateConversationStatus } from "../authorization/conversationPermissions.js";
import type { PatchConversationLeadStatusSchema } from "../../interfaces/api/contracts.js";

function actorAuthUserUuidOrNull(authUserId: string): string | null {
  return z.string().uuid().safeParse(authUserId).success ? authUserId : null;
}

export type ParsedPatchConversationLeadStatus = z.infer<typeof PatchConversationLeadStatusSchema>;

export class UpdateConversationLeadStatusUseCase {
  constructor(
    private readonly deps: {
      conversationRepository: Pick<
        ConversationRepository,
        "findById" | "updateConversationFollowUp"
      >;
      leadRepository: Pick<LeadRepository, "findById"> & {
        patch(
          tenantId: UUID,
          leadId: UUID,
          patch: { status?: LeadStatus; tags?: string[] }
        ): Promise<void>;
      };
      conversationEventRepository: ConversationEventRepository;
      activityLogRepository: Pick<ActivityLogRepository, "create">;
    }
  ) {}

  async execute(input: {
    auth: AuthContext;
    conversationId: string;
    nextLeadStatus: LeadManagementStatus;
    note?: string | null;
  }): Promise<{
    id: string;
    leadId: string;
    leadStatus: LeadManagementStatus;
    lead_status: LeadStatus;
    followUpAt: string | null;
    followUpNote: string | null;
  }> {
    if (!this.deps.conversationRepository.findById) {
      throw new Error("Conversation repository missing findById");
    }
    const conv = await this.deps.conversationRepository.findById(
      input.auth.tenantId,
      input.conversationId
    );
    if (!conv) throw new Error("Conversation not found");

    if (
      !canUpdateConversationStatus(input.auth, {
        tenantId: conv.tenantId,
        assignedAgentId: conv.assignedAgentId ?? null
      })
    ) {
      throw new Error("Forbidden conversation lead status update");
    }

    const lead = await this.deps.leadRepository.findById(input.auth.tenantId, conv.leadId);
    if (!lead) throw new Error("Lead not found");

    const previousLeadStatus = lead.status;
    const previousManagement = leadStatusToManagementStatus(
      previousLeadStatus,
      conv.followUpAt ?? null
    );
    assertValidLeadManagementStatusTransition(previousManagement, input.nextLeadStatus);

    const nextDbStatus = resolveLeadStatusForManagementUpdate(previousLeadStatus, input.nextLeadStatus);
    const noteTrimmed =
      input.note === null || input.note === undefined
        ? null
        : input.note.trim().length > 0
          ? input.note.trim()
          : null;

    if (nextDbStatus !== previousLeadStatus) {
      await this.deps.leadRepository.patch(input.auth.tenantId, lead.id, {
        status: nextDbStatus
      });
    }

    let followUpAt = conv.followUpAt ?? null;
    let followUpNote = conv.followUpNote ?? null;

    if (isTerminalLeadManagementStatus(input.nextLeadStatus)) {
      if (!this.deps.conversationRepository.updateConversationFollowUp) {
        throw new Error("Conversation repository missing updateConversationFollowUp");
      }
      await this.deps.conversationRepository.updateConversationFollowUp({
        tenantId: input.auth.tenantId,
        conversationId: input.conversationId,
        patch: { followUpAt: null }
      });
      followUpAt = null;
    }

    const changedAt = new Date().toISOString();
    try {
      await this.deps.conversationEventRepository.create({
        tenantId: input.auth.tenantId,
        conversationId: input.conversationId,
        leadId: conv.leadId ?? null,
        actorSalesAgentId: input.auth.salesAgentId,
        actorAuthUserId: actorAuthUserUuidOrNull(input.auth.userId),
        eventType: "CONVERSATION_LEAD_STATUS_CHANGED",
        oldValue: {
          leadStatus: previousManagement,
          lead_status: previousLeadStatus
        },
        newValue: {
          leadStatus: input.nextLeadStatus,
          lead_status: nextDbStatus
        },
        metadataJson: {
          actor_agent_id: input.auth.salesAgentId,
          tenant_id: input.auth.tenantId,
          changed_at: changedAt
        },
        note: noteTrimmed
      });
    } catch (e) {
      throw new Error(`conversation_events insert failed after lead status update: ${String(e)}`);
    }

    if (nextDbStatus !== previousLeadStatus) {
      await this.deps.activityLogRepository.create({
        tenantId: input.auth.tenantId,
        leadId: lead.id,
        type: "STATUS_CHANGED",
        metadataJson: { from: previousLeadStatus, to: nextDbStatus }
      });
    }
    if (noteTrimmed) {
      await this.deps.activityLogRepository.create({
        tenantId: input.auth.tenantId,
        leadId: lead.id,
        type: "NOTE_ADDED",
        metadataJson: { note: noteTrimmed }
      });
    }

    const responseManagement = leadStatusToManagementStatus(nextDbStatus, followUpAt);

    return {
      id: conv.id,
      leadId: lead.id,
      leadStatus: responseManagement,
      lead_status: nextDbStatus,
      followUpAt:
        followUpAt instanceof Date && !Number.isNaN(followUpAt.getTime())
          ? followUpAt.toISOString()
          : null,
      followUpNote
    };
  }
}
