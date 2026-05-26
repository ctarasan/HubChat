import { z } from "zod";
import type { AuthContext } from "../../interfaces/api/auth.js";
import type { ConversationRepository, LeadRepository, MarketingEventRepository } from "../../domain/ports.js";
import { MarketingEventTypeSchema } from "../../domain/marketingEvents.js";
import {
  canUpdateConversationStatus,
  type ConversationStatusUpdateScoped
} from "../authorization/conversationPermissions.js";

export const MarketingEventsListQuerySchema = z.object({
  leadId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  eventType: MarketingEventTypeSchema.optional(),
  cursor: z.string().optional(),
  limit: z.string().optional()
});

export type MarketingEventsListQuery = z.infer<typeof MarketingEventsListQuerySchema>;

function canViewConversationEvents(
  auth: AuthContext,
  conversation: ConversationStatusUpdateScoped
): boolean {
  return canUpdateConversationStatus(auth, conversation);
}

export class ListMarketingEventsUseCase {
  constructor(
    private readonly deps: {
      marketingEventRepository: MarketingEventRepository;
      conversationRepository: Pick<ConversationRepository, "findById">;
      leadRepository: Pick<LeadRepository, "findById">;
    }
  ) {}

  async execute(input: { auth: AuthContext; query: MarketingEventsListQuery }) {
    const { auth } = input;
    const leadId = input.query.leadId;
    const conversationId = input.query.conversationId;

    if (auth.role === "SALES") {
      if (!leadId && !conversationId) {
        throw new Error("Forbidden");
      }
      if (!auth.salesAgentId) {
        throw new Error("Forbidden");
      }
    }

    if (conversationId) {
      if (!this.deps.conversationRepository.findById) {
        throw new Error("Conversation repository missing findById");
      }
      const conv = await this.deps.conversationRepository.findById(auth.tenantId, conversationId);
      if (!conv) throw new Error("Conversation not found");
      if (
        !canViewConversationEvents(auth, {
          tenantId: conv.tenantId,
          assignedAgentId: conv.assignedAgentId ?? null
        })
      ) {
        throw new Error("Forbidden");
      }
    }

    if (leadId) {
      const lead = await this.deps.leadRepository.findById(auth.tenantId, leadId);
      if (!lead) throw new Error("Lead not found");
      if (auth.role === "SALES") {
        const assigned = lead.assignedSalesId ?? null;
        if (!assigned || assigned !== auth.salesAgentId) {
          if (!conversationId) {
            throw new Error("Forbidden");
          }
        }
      }
    }

    const limitRaw = input.query.limit;
    const limit = limitRaw ? Number(limitRaw) : 25;

    const result = await this.deps.marketingEventRepository.list({
      tenantId: auth.tenantId,
      leadId,
      conversationId,
      eventType: input.query.eventType,
      cursor: input.query.cursor,
      limit: Number.isFinite(limit) ? limit : 25
    });

    return {
      items: result.items,
      pageInfo: {
        nextCursor: result.nextCursor,
        hasNextPage: result.nextCursor != null
      }
    };
  }
}
