import { z } from "zod";

export const LeadQuerySchema = z.object({
  status: z.enum(["NEW", "ASSIGNED", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"]).optional(),
  channel: z.enum(["LINE", "FACEBOOK", "INSTAGRAM", "TIKTOK", "SHOPEE", "LAZADA"]).optional(),
  assignedSalesId: z.string().uuid().optional(),
  lastActivityFrom: z.string().datetime().optional(),
  lastActivityTo: z.string().datetime().optional()
});

export const PatchLeadSchema = z.object({
  status: z.enum(["NEW", "ASSIGNED", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"]).optional(),
  tags: z.array(z.string()).optional(),
  note: z.string().min(1).optional()
});

export const AssignLeadSchema = z.object({
  salesAgentId: z.string().uuid(),
  mode: z.enum(["MANUAL", "AUTO_ROUND_ROBIN"]).default("MANUAL")
});

export const SendMessageSchema = z.object({
  tenantId: z.string().uuid(),
  leadId: z.string().uuid(),
  conversationId: z.string().uuid(),
  channel: z.enum(["LINE", "FACEBOOK", "INSTAGRAM", "TIKTOK", "SHOPEE", "LAZADA"]),
  channelThreadId: z.string().min(1),
  content: z.string().min(1).max(4000)
});
