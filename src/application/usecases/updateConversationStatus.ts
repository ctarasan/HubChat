import { z } from "zod";
import type { AuthContext } from "../../interfaces/api/auth.js";
import type { ConversationEventRepository, ConversationRepository } from "../../domain/ports.js";
import type { ConversationStatus, ConversationWritableStatus } from "../../domain/entities.js";
import { canUpdateConversationStatus } from "../authorization/conversationPermissions.js";

function actorAuthUserUuidOrNull(authUserId: string): string | null {
  return z.string().uuid().safeParse(authUserId).success ? authUserId : null;
}

function computeNextResolvedAtIso(
  currentResolved: Date | null,
  nextStatus: ConversationWritableStatus
): string | null {
  if (nextStatus === "RESOLVED") {
    if (currentResolved) return currentResolved.toISOString();
    return new Date().toISOString();
  }
  if (nextStatus === "OPEN" || nextStatus === "PENDING") {
    return null;
  }
  if (currentResolved) return currentResolved.toISOString();
  return null;
}

export class UpdateConversationStatusUseCase {
  constructor(
    private readonly deps: {
      conversationRepository: Pick<ConversationRepository, "findById" | "updateConversationStatus">;
      conversationEventRepository: ConversationEventRepository;
    }
  ) {}

  async execute(input: {
    auth: AuthContext;
    conversationId: string;
    nextStatus: ConversationWritableStatus;
  }): Promise<{ id: string; status: ConversationStatus; resolvedAt: string | null }> {
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
      throw new Error("Forbidden conversation status update");
    }

    const previousStatus = conv.status;
    const previousResolved = conv.resolvedAt ?? null;
    const resolvedAtIso = computeNextResolvedAtIso(previousResolved, input.nextStatus);
    const nextStatusDb = input.nextStatus as ConversationStatus;
    if (!this.deps.conversationRepository.updateConversationStatus) {
      throw new Error("Conversation repository missing updateConversationStatus");
    }

    await this.deps.conversationRepository.updateConversationStatus({
      tenantId: input.auth.tenantId,
      conversationId: input.conversationId,
      status: nextStatusDb,
      resolvedAtIso
    });

    const changedAt = new Date().toISOString();
    try {
      await this.deps.conversationEventRepository.create({
        tenantId: input.auth.tenantId,
        conversationId: input.conversationId,
        leadId: conv.leadId ?? null,
        actorSalesAgentId: input.auth.salesAgentId,
        actorAuthUserId: actorAuthUserUuidOrNull(input.auth.userId),
        eventType: "CONVERSATION_STATUS_CHANGED",
        oldValue: { status: previousStatus },
        newValue: { status: nextStatusDb },
        metadataJson: {
          actor_agent_id: input.auth.salesAgentId,
          tenant_id: input.auth.tenantId,
          changed_at: changedAt
        },
        note: null
      });
    } catch (e) {
      throw new Error(`conversation_events insert failed after status update: ${String(e)}`);
    }

    return { id: conv.id, status: nextStatusDb, resolvedAt: resolvedAtIso };
  }
}
