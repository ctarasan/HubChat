import type { AuthContext } from "../../interfaces/api/auth.js";
import type { ConversationRepository } from "../../domain/ports.js";
import type { z } from "zod";
import { PatchConversationFollowUpSchema } from "../../interfaces/api/contracts.js";
import { canUpdateConversationStatus } from "../authorization/conversationPermissions.js";

export type ParsedPatchConversationFollowUp = z.infer<typeof PatchConversationFollowUpSchema>;

export class UpdateConversationFollowUpUseCase {
  constructor(
    private readonly deps: {
      conversationRepository: Pick<ConversationRepository, "findById" | "updateConversationFollowUp">;
    }
  ) {}

  async execute(input: {
    auth: AuthContext;
    conversationId: string;
    patch: ParsedPatchConversationFollowUp;
  }): Promise<{ id: string; followUpAt: string | null; followUpNote: string | null }> {
    const findById = this.deps.conversationRepository.findById;
    if (!findById) throw new Error("Conversation repository missing findById");
    const conv = await findById(input.auth.tenantId, input.conversationId);
    if (!conv) throw new Error("Conversation not found");

    if (
      !canUpdateConversationStatus(input.auth, {
        tenantId: conv.tenantId,
        assignedAgentId: conv.assignedAgentId ?? null
      })
    ) {
      throw new Error("Forbidden conversation follow-up update");
    }

    const repoPatch: { followUpAt?: Date | null; followUpNote?: string | null } = {};
    if ("followUpAt" in input.patch) {
      const v = input.patch.followUpAt;
      if (v === null) repoPatch.followUpAt = null;
      else if (typeof v === "string") repoPatch.followUpAt = new Date(v);
    }
    if ("followUpNote" in input.patch) {
      const v = input.patch.followUpNote;
      if (v === null) repoPatch.followUpNote = null;
      else if (typeof v === "string") {
        const t = v.trim();
        repoPatch.followUpNote = t.length === 0 ? null : t;
      }
    }

    const update = this.deps.conversationRepository.updateConversationFollowUp;
    if (!update) throw new Error("Conversation repository missing updateConversationFollowUp");

    await update({
      tenantId: input.auth.tenantId,
      conversationId: input.conversationId,
      patch: repoPatch
    });

    let followUpAt = conv.followUpAt ?? null;
    if (Object.prototype.hasOwnProperty.call(repoPatch, "followUpAt")) {
      followUpAt = repoPatch.followUpAt ?? null;
    }
    let followUpNote = conv.followUpNote ?? null;
    if (Object.prototype.hasOwnProperty.call(repoPatch, "followUpNote")) {
      followUpNote = repoPatch.followUpNote ?? null;
    }

    return {
      id: conv.id,
      followUpAt: followUpAt instanceof Date && !Number.isNaN(followUpAt.getTime()) ? followUpAt.toISOString() : null,
      followUpNote
    };
  }
}
