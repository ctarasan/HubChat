import { z } from "zod";

const unsafeUrlHostRegex =
  /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|.+\.local$)/i;

function isHttpsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function hasUnsafeHost(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return unsafeUrlHostRegex.test(new URL(value).hostname);
  } catch {
    return true;
  }
}

export const LeadQuerySchema = z.object({
  status: z.enum(["NEW", "ASSIGNED", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"]).optional(),
  channel: z.enum(["LINE", "FACEBOOK", "INSTAGRAM", "TIKTOK", "SHOPEE", "LAZADA"]).optional(),
  assignedSalesId: z.string().uuid().optional(),
  lastActivityFrom: z.string().datetime().optional(),
  lastActivityTo: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.string().optional()
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
  type: z.enum(["text", "image", "document_pdf"]).default("text"),
  channelThreadId: z.string().min(1).optional(),
  facebookTargetType: z.enum(["MESSENGER", "COMMENT"]).optional(),
  facebookTargetId: z.string().min(1).optional(),
  content: z.string().min(1).max(4000).optional(),
  mediaUrl: z.string().url().optional(),
  previewUrl: z.string().url().optional(),
  mediaMimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]).optional(),
  fileName: z.string().min(1).max(255).optional(),
  fileSizeBytes: z.number().int().positive().max(50 * 1024 * 1024).optional(),
  width: z.number().int().positive().max(10000).optional(),
  height: z.number().int().positive().max(10000).optional()
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

  if (data.type === "text") {
    if (!data.content || !data.content.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content"],
        message: "content is required for text messages"
      });
    }
  } else if (data.type === "image") {
    if (!data.mediaUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediaUrl"],
        message: "mediaUrl is required for image messages"
      });
    }
    if (!data.mediaMimeType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediaMimeType"],
        message: "mediaMimeType is required for image messages"
      });
    }
    if (hasUnsafeHost(data.mediaUrl) || hasUnsafeHost(data.previewUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediaUrl"],
        message: "mediaUrl/previewUrl must be externally reachable (no localhost/private network URLs)"
      });
    }
    if (data.channel === "LINE") {
      if (!isHttpsUrl(data.mediaUrl)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mediaUrl"],
          message: "LINE image outbound requires HTTPS mediaUrl"
        });
      }
      if (data.previewUrl && !isHttpsUrl(data.previewUrl)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["previewUrl"],
          message: "LINE image outbound requires HTTPS previewUrl"
        });
      }
    }
    if (data.channel === "FACEBOOK" && typeof data.fileSizeBytes === "number" && data.fileSizeBytes > 8 * 1024 * 1024) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fileSizeBytes"],
        message: "Facebook Messenger image outbound supports up to 8MB for URL-based attachment"
      });
    }
    if (data.channel === "FACEBOOK" && !isHttpsUrl(data.mediaUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediaUrl"],
        message: "Facebook Messenger image outbound requires HTTPS mediaUrl"
      });
    }
    if (data.channel === "FACEBOOK" && data.facebookTargetType === "COMMENT") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["facebookTargetType"],
        message: "facebook image outbound is supported for MESSENGER only in this phase"
      });
    }
  } else {
    if (!data.mediaUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediaUrl"],
        message: "mediaUrl is required for document_pdf messages"
      });
    }
    if (data.mediaMimeType !== "application/pdf") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediaMimeType"],
        message: "mediaMimeType must be application/pdf for document_pdf messages"
      });
    }
    if (!data.fileName || !data.fileName.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fileName"],
        message: "fileName is required for document_pdf messages"
      });
    }
    if (hasUnsafeHost(data.mediaUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediaUrl"],
        message: "mediaUrl must be externally reachable (no localhost/private network URLs)"
      });
    }
    if (!isHttpsUrl(data.mediaUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediaUrl"],
        message: "PDF outbound requires HTTPS mediaUrl"
      });
    }
  }
});
