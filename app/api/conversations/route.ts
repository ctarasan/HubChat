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

function filterOwnInstagramAccountConversations(rows: any[]): any[] {
  const ownIds = new Set(
    [
      process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
      process.env.INSTAGRAM_ACCOUNT_ID,
      process.env.INSTAGRAM_PAGE_ID,
      process.env.FACEBOOK_PAGE_ID
    ]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim())
  );
  if (ownIds.size === 0) return rows;
  return rows.filter((row) => {
    const channel = String(row?.channel_type ?? row?.channelType ?? "").toUpperCase();
    if (channel !== "INSTAGRAM") return true;
    const externalId = String(row?.provider_external_user_id ?? row?.providerExternalUserId ?? "").trim();
    return !externalId || !ownIds.has(externalId);
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

    const safeItems = filterOwnInstagramAccountConversations(result.items);
    return ok({ data: safeItems, pageInfo: { nextCursor: result.nextCursor } });
  } catch (error) {
    if (String(error).includes("Unauthorized")) return unauthorized();
    if (String(error).includes("Forbidden")) return forbidden();
    return serverError(error);
  }
}
