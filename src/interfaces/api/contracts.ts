import { z } from "zod";
import { buildChannelCapabilityContext, getOutboundSendUnsupportedReason } from "../../lib/channelCapabilities.js";
import { MEDIA_SEND_MAX_FILE_BYTES, validateChannelMediaFileSize } from "../../lib/mediaPolicy.js";

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
  status: z
    .enum([
      "NEW",
      "ASSIGNED",
      "CONTACTED",
      "QUALIFIED",
      "PROPOSAL_SENT",
      "NEGOTIATION",
      "WON",
      "LOST",
      "UNQUALIFIED"
    ])
    .optional(),
  channel: z.enum(["LINE", "FACEBOOK", "INSTAGRAM", "TIKTOK", "SHOPEE", "LAZADA"]).optional(),
  assignedSalesId: z.string().uuid().optional(),
  lastActivityFrom: z.string().datetime().optional(),
  lastActivityTo: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.string().optional()
});

export const PatchLeadSchema = z.object({
  status: z
    .enum([
      "NEW",
      "ASSIGNED",
      "CONTACTED",
      "QUALIFIED",
      "PROPOSAL_SENT",
      "NEGOTIATION",
      "WON",
      "LOST",
      "UNQUALIFIED"
    ])
    .optional(),
  tags: z.array(z.string()).optional(),
  note: z.string().min(1).optional()
});

export const AssignLeadSchema = z.object({
  salesAgentId: z.string().uuid(),
  mode: z.enum(["MANUAL", "AUTO_ROUND_ROBIN"]).default("MANUAL")
});

export const AssignConversationSchema = z.object({
  salesAgentId: z.string().uuid(),
  note: z.string().min(1).max(5000).optional()
});

export const UnassignConversationBodySchema = z
  .object({
    note: z.string().min(1).max(5000).optional()
  })
  .strict();

/** Dashboard / API: writable conversation lifecycle (excludes legacy CLOSED for new writes). */
export const PatchConversationStatusSchema = z.object({
  status: z.enum(["OPEN", "PENDING", "RESOLVED", "ARCHIVED"])
});

/** PATCH conversation-scoped lead management status (maps to `leads.status`). */
export const PatchConversationLeadStatusSchema = z
  .object({
    leadStatus: z.enum(["NEW", "IN_PROGRESS", "FOLLOW_UP", "QUALIFIED", "WON", "LOST", "CLOSED"]),
    note: z.union([z.string().max(5000), z.null()]).optional()
  })
  .strict();

/** PATCH follow-up reminder fields; omit a key to leave it unchanged, `null` clears. */
export const PatchConversationFollowUpSchema = z
  .object({
    followUpAt: z.union([z.string().datetime(), z.null()]).optional(),
    followUpNote: z.union([z.string().max(5000), z.null()]).optional()
  })
  .strict()
  .superRefine((val, ctx) => {
    const hasAt = Object.prototype.hasOwnProperty.call(val, "followUpAt");
    const hasNote = Object.prototype.hasOwnProperty.call(val, "followUpNote");
    if (!hasAt && !hasNote) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one of followUpAt or followUpNote is required."
      });
    }
  });

/** Query string for GET /api/sales-agents (team roster + assignment picker). */
export const TeamMemberQuerySchema = z.object({
  includeInactive: z
    .string()
    .optional()
    .transform((s) => s === "true"),
  role: z.enum(["SALES", "MANAGER", "ADMIN"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  assignmentMode: z.enum(["AUTO", "MANUAL_ONLY", "PAUSED"]).optional(),
  q: z.string().max(200).optional()
});

export const CreateTeamMemberSchema = z
  .object({
    name: z.string().min(1).max(500),
    email: z.string().email(),
    role: z.enum(["SALES", "MANAGER", "ADMIN"]),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    assignmentEnabled: z.boolean().optional(),
    assignmentMode: z.enum(["AUTO", "MANUAL_ONLY", "PAUSED"]).optional(),
    maxActiveConversations: z.number().int().min(0).nullable().optional(),
    maxActiveLeads: z.number().int().min(0).nullable().optional(),
    createAuthUser: z.boolean().optional(),
    password: z.string().optional(),
    confirmPassword: z.string().optional()
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.createAuthUser === true) {
      const p = val.password ?? "";
      const c = val.confirmPassword ?? "";
      if (p.length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["password"],
          message: "Password must be at least 8 characters."
        });
      }
      if (p !== c) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["confirmPassword"],
          message: "Passwords must match."
        });
      }
    } else if ((val.password && val.password.length > 0) || (val.confirmPassword && val.confirmPassword.length > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Password fields are only allowed when Create login account is enabled."
      });
    }
  });

export const PatchTeamMemberSchema = z
  .object({
    name: z.string().min(1).max(500).optional(),
    email: z.string().email().optional(),
    role: z.enum(["SALES", "MANAGER", "ADMIN"]).optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    assignmentEnabled: z.boolean().optional(),
    assignmentMode: z.enum(["AUTO", "MANUAL_ONLY", "PAUSED"]).optional(),
    maxActiveConversations: z.number().int().min(0).nullable().optional(),
    maxActiveLeads: z.number().int().min(0).nullable().optional(),
    newPassword: z.string().optional(),
    confirmNewPassword: z.string().optional()
  })
  .strict()
  .superRefine((val, ctx) => {
    const p = val.newPassword ?? "";
    const c = val.confirmNewPassword ?? "";
    const hasNew = p.length > 0;
    if (hasNew) {
      if (p.length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["newPassword"],
          message: "Password must be at least 8 characters."
        });
      }
      if (!c) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["confirmNewPassword"],
          message: "Confirm new password is required."
        });
      } else if (p !== c) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["confirmNewPassword"],
          message: "Passwords must match."
        });
      }
    } else if (c.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newPassword"],
        message: "New password is required when confirmation is provided."
      });
    }
  })
  .refine(
    (o) => {
      const { newPassword, confirmNewPassword, ...rest } = o;
      const hasPassword = (newPassword ?? "").length > 0;
      return Object.keys(rest).length > 0 || hasPassword;
    },
    { message: "At least one field is required" }
  );

export const SendMessageSchema = z.object({
  tenantId: z.string().uuid(),
  leadId: z.string().uuid(),
  conversationId: z.string().uuid(),
  conversationIds: z.array(z.string().uuid()).max(100).optional(),
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
  fileSizeBytes: z.number().int().positive().max(MEDIA_SEND_MAX_FILE_BYTES).optional(),
  width: z.number().int().positive().max(10000).optional(),
  height: z.number().int().positive().max(10000).optional()
}).superRefine((data, ctx) => {
  const capabilityContext = buildChannelCapabilityContext({
    channel: data.channel,
    providerThreadType:
      data.channel === "FACEBOOK" && data.facebookTargetType === "COMMENT"
        ? "FACEBOOK_COMMENT"
        : data.channel === "FACEBOOK" && data.facebookTargetType === "MESSENGER"
          ? "MESSENGER_DM"
          : data.channel === "INSTAGRAM"
            ? "INSTAGRAM_DM"
            : null,
    privateReplySentAt: null,
    facebookTargetType: data.facebookTargetType ?? null
  });
  const capabilityIssue = getOutboundSendUnsupportedReason(capabilityContext, data.type);
  if (capabilityIssue) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: data.type === "text" ? ["content"] : data.type === "image" ? ["mediaUrl"] : ["channel"],
      message: capabilityIssue
    });
    return;
  }

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
    const imageSizeIssue = validateChannelMediaFileSize({
      channel: data.channel,
      messageType: "image",
      fileSizeBytes: data.fileSizeBytes
    });
    if (imageSizeIssue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fileSizeBytes"],
        message: imageSizeIssue
      });
    }
    if (data.channel === "FACEBOOK" && !isHttpsUrl(data.mediaUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediaUrl"],
        message: "Facebook Messenger image outbound requires HTTPS mediaUrl"
      });
    }
    if (data.channel === "INSTAGRAM" && !isHttpsUrl(data.mediaUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediaUrl"],
        message: "Instagram DM image outbound requires HTTPS mediaUrl"
      });
    }
    if (data.channel === "INSTAGRAM" && data.previewUrl && !isHttpsUrl(data.previewUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["previewUrl"],
        message: "Instagram DM image outbound requires HTTPS previewUrl"
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
    const pdfSizeIssue = validateChannelMediaFileSize({
      channel: data.channel,
      messageType: "document_pdf",
      fileSizeBytes: data.fileSizeBytes
    });
    if (pdfSizeIssue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fileSizeBytes"],
        message: pdfSizeIssue
      });
    }
  }
});
