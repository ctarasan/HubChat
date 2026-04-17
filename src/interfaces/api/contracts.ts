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
  channelThreadId: z.string().min(1).optional(),
  facebookTargetType: z.enum(["MESSENGER", "COMMENT"]).optional(),
  facebookTargetId: z.string().min(1).optional(),
  content: z.string().min(1).max(4000)
}).superRefine((data, ctx) => {
  const hasFacebookTargetType = typeof data.facebookTargetType === "string";
  const hasFacebookTargetId = typeof data.facebookTargetId === "string";

  if (data.channel !== "FACEBOOK" && (hasFacebookTargetType || hasFacebookTargetId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["facebookTargetType"],
      message: "facebookTargetType/facebookTargetId are only allowed when channel is FACEBOOK"
    });
  }

  if (hasFacebookTargetType !== hasFacebookTargetId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["facebookTargetId"],
      message: "facebookTargetType and facebookTargetId must be provided together"
    });
  }

  const hasResolvedTarget = Boolean(data.channelThreadId) || (data.channel === "FACEBOOK" && hasFacebookTargetType && hasFacebookTargetId);
  if (!hasResolvedTarget) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["channelThreadId"],
      message: "channelThreadId is required (or use facebookTargetType + facebookTargetId for FACEBOOK)"
    });
  }
});
