import { NextRequest } from "next/server";
import { z } from "zod";
import { apiBootstrap } from "../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../src/interfaces/api/auth.js";
import { parseLimit } from "../../../src/interfaces/api/pagination.js";

const QuerySchema = z.object({
  status: z.enum(["OPEN", "PENDING", "CLOSED"]).optional(),
  channel: z.enum(["LINE", "FACEBOOK", "INSTAGRAM", "TIKTOK", "SHOPEE", "LAZADA"]).optional(),
  assignedSalesId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.string().optional()
});

function pickString(row: any, snake: string, camel: string): string {
  const v = row?.[snake] ?? row?.[camel];
  return typeof v === "string" ? v.trim() : "";
}

function filterOwnPlatformAccountConversations(rows: any[]): any[] {
  const ownInstagramIds = new Set(
    [
      process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
      process.env.INSTAGRAM_ACCOUNT_ID,
      process.env.INSTAGRAM_PAGE_ID
    ]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim())
  );
  const ownFacebookPageId = (process.env.FACEBOOK_PAGE_ID ?? "").trim();
  if (!ownFacebookPageId && ownInstagramIds.size === 0) return rows;

  return rows.filter((row) => {
    const channel = pickString(row, "channel_type", "channelType").toUpperCase();
    const providerExternalUserId = pickString(row, "provider_external_user_id", "providerExternalUserId");
    const externalUserId = pickString(row, "external_user_id", "externalUserId");
    const providerPageId = pickString(row, "provider_page_id", "providerPageId");
    const channelThreadId = pickString(row, "channel_thread_id", "channelThreadId");

    if (channel === "INSTAGRAM") {
      const ids = new Set([providerExternalUserId, externalUserId].filter(Boolean));
      for (const id of ids) {
        if (ownInstagramIds.has(id) || (ownFacebookPageId && id === ownFacebookPageId)) return false;
      }
      // Heuristic for self-account records when env ids are missing/outdated.
      if (providerPageId && ids.has(providerPageId)) return false;
      if (providerPageId && channelThreadId === `ig:user:${providerPageId}`) return false;
      return true;
    }

    if (channel === "FACEBOOK") {
      if (!ownFacebookPageId) return true;
      if (providerExternalUserId === ownFacebookPageId || externalUserId === ownFacebookPageId) return false;
      if (channelThreadId === `user:${ownFacebookPageId}` || channelThreadId === ownFacebookPageId) return false;
      if (providerPageId && providerExternalUserId && providerPageId === providerExternalUserId) return false;
      return true;
    }

    return true;
  });
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ["SALES", "MANAGER", "ADMIN"]);
    const tenantId = auth.tenantId;
    const qs = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = QuerySchema.safeParse(qs);
    if (!parsed.success) return badRequest(parsed.error.message);

    const { conversationRepository } = apiBootstrap();
    const result = await conversationRepository.list({
      tenantId,
      status: parsed.data.status,
      channel: parsed.data.channel,
      assignedSalesId: parsed.data.assignedSalesId,
      cursor: parsed.data.cursor,
      limit: parseLimit(parsed.data.limit)
    });

    const safeItems = filterOwnPlatformAccountConversations(result.items);
    return ok({ data: safeItems, pageInfo: { nextCursor: result.nextCursor } });
  } catch (error) {
    if (String(error).includes("Unauthorized")) return unauthorized();
    if (String(error).includes("Forbidden")) return forbidden();
    return serverError(error);
  }
}
