import { NextRequest, NextResponse } from "next/server";
import { apiBootstrap } from "../../../../../src/interfaces/api/bootstrap.js";
import { forbidden, ok, serverError, unauthorized } from "../../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../../src/interfaces/api/auth.js";
import { parseLimit } from "../../../../../src/interfaces/api/pagination.js";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, ["SALES", "MANAGER", "ADMIN"]);
    const tenantId = auth.tenantId;
    const { id: conversationId } = await params;
    const { messageRepository } = apiBootstrap();

    const result = await messageRepository.listByConversation({
      tenantId,
      conversationId,
      cursor: req.nextUrl.searchParams.get("cursor") ?? undefined,
      limit: parseLimit(req.nextUrl.searchParams.get("limit") ?? undefined)
    });

    return ok({ data: result.items, pageInfo: { nextCursor: result.nextCursor } });
  } catch (error) {
    if (String(error).includes("Unauthorized")) return unauthorized();
    if (String(error).includes("Forbidden")) return forbidden();
    if (String(error).includes("PGRST")) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    return serverError(error);
  }
}
