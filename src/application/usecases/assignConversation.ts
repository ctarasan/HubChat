import { z } from "zod";
import type { AppRole } from "../../interfaces/api/auth.js";
import { canAssignConversation } from "../authorization/conversationPermissions.js";
import type {
  ConversationAssignmentStore,
  ConversationEventRepository,
  ConversationEventType,
  ConversationForAssignment,
  LeadRepository,
  SalesAgentRepository
} from "../../domain/ports.js";

function actorAuthUserUuidOrNull(authUserId: string): string | null {
  return z.string().uuid().safeParse(authUserId).success ? authUserId : null;
}

function permissionCtx(input: {
  tenantId: string;
  actorAuthUserId: string;
  actorSalesAgentId: string | null;
  actorRole: AppRole;
}) {
  return {
    tenantId: input.tenantId,
    userId: input.actorAuthUserId,
    email: "",
    role: input.actorRole,
    salesAgentId: input.actorSalesAgentId
  };
}

export class AssignConversationUseCase {
  constructor(
    private readonly deps: {
      conversationAssignmentStore: ConversationAssignmentStore;
      leadRepository: LeadRepository;
      conversationEventRepository: ConversationEventRepository;
      salesAgentRepository: SalesAgentRepository;
    }
  ) {}

  async assignOrReassign(input: {
    tenantId: string;
    actorAuthUserId: string;
    actorSalesAgentId: string | null;
    actorRole: AppRole;
    conversationId: string;
    targetSalesAgentId: string;
    note?: string | null;
  }): Promise<ConversationForAssignment> {
    const conv = await this.deps.conversationAssignmentStore.findByIdForAssignment(input.tenantId, input.conversationId);
    if (!conv) throw new Error("Conversation not found");

    const ctx = permissionCtx(input);
    if (!canAssignConversation(ctx, conv)) throw new Error("Forbidden assign");

    const exists = await this.deps.salesAgentRepository.findActiveByIdInTenant(input.tenantId, input.targetSalesAgentId);
    if (!exists) throw new Error("Invalid target sales agent");

    if (conv.assignedAgentId === input.targetSalesAgentId) {
      return conv;
    }

    const assignmentStatus = conv.assignedAgentId == null ? "ASSIGNED" : "REASSIGNED";
    const eventType: ConversationEventType =
      conv.assignedAgentId == null ? "CONVERSATION_ASSIGNED" : "CONVERSATION_REASSIGNED";

    await this.deps.conversationAssignmentStore.updateAssignment({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      assignedAgentId: input.targetSalesAgentId,
      assignmentStatus
    });

    if (conv.leadId) {
      await this.deps.leadRepository.assign(conv.leadId, input.targetSalesAgentId);
    }

    const noteTrim = typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;
    try {
      await this.deps.conversationEventRepository.create({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        leadId: conv.leadId,
        actorSalesAgentId: input.actorSalesAgentId,
        actorAuthUserId: actorAuthUserUuidOrNull(input.actorAuthUserId),
        eventType,
        oldValue: { assignedAgentId: conv.assignedAgentId },
        newValue: { assignedAgentId: input.targetSalesAgentId },
        metadataJson: noteTrim ? { note: noteTrim } : {},
        note: noteTrim
      });
    } catch (e) {
      throw new Error(`conversation_events insert failed after assignment update: ${String(e)}`);
    }

    const updated = await this.deps.conversationAssignmentStore.findByIdForAssignment(input.tenantId, input.conversationId);
    if (!updated) throw new Error("Conversation not found");
    return updated;
  }

  async unassign(input: {
    tenantId: string;
    actorAuthUserId: string;
    actorSalesAgentId: string | null;
    actorRole: AppRole;
    conversationId: string;
    note?: string | null;
  }): Promise<ConversationForAssignment> {
    const conv = await this.deps.conversationAssignmentStore.findByIdForAssignment(input.tenantId, input.conversationId);
    if (!conv) throw new Error("Conversation not found");

    const ctx = permissionCtx(input);
    if (!canAssignConversation(ctx, conv)) throw new Error("Forbidden assign");

    if (conv.assignedAgentId == null) {
      return conv;
    }

    await this.deps.conversationAssignmentStore.updateAssignment({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      assignedAgentId: null,
      assignmentStatus: "UNASSIGNED_AGAIN"
    });

    const noteTrim = typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;
    try {
      await this.deps.conversationEventRepository.create({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        leadId: conv.leadId,
        actorSalesAgentId: input.actorSalesAgentId,
        actorAuthUserId: actorAuthUserUuidOrNull(input.actorAuthUserId),
        eventType: "CONVERSATION_UNASSIGNED",
        oldValue: { assignedAgentId: conv.assignedAgentId },
        newValue: { assignedAgentId: null },
        metadataJson: noteTrim ? { note: noteTrim } : {},
        note: noteTrim
      });
    } catch (e) {
      throw new Error(`conversation_events insert failed after unassign update: ${String(e)}`);
    }

    const updated = await this.deps.conversationAssignmentStore.findByIdForAssignment(input.tenantId, input.conversationId);
    if (!updated) throw new Error("Conversation not found");
    return updated;
  }
}
