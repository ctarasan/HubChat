import { NextRequest } from "next/server";
import { z } from "zod";
import { apiBootstrap } from "../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../src/interfaces/api/auth.js";

const QuerySchema = z.object({
  status: z.enum(["OPEN", "PENDING", "CLOSED"]).optional(),
  channel: z.enum(["LINE", "FACEBOOK", "INSTAGRAM", "TIKTOK", "SHOPEE", "LAZADA"]).optional(),
  assignedSalesId: z.string().uuid().optional()
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ["SALES", "MANAGER", "ADMIN"]);
    const tenantId = auth.tenantId;
    const qs = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = QuerySchema.safeParse(qs);
    if (!parsed.success) return badRequest(parsed.error.message);

    const { conversationRepository } = apiBootstrap();
    const conversations = await conversationRepository.list({
      tenantId,
      status: parsed.data.status,
      channel: parsed.data.channel,
      assignedSalesId: parsed.data.assignedSalesId
    });

    return ok({ data: conversations });
  } catch (error) {
    if (String(error).includes("Unauthorized")) return unauthorized();
    if (String(error).includes("Forbidden")) return forbidden();
    return serverError(error);
  }
}
