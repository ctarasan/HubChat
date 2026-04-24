import { NextRequest } from "next/server";
import { apiBootstrap } from "../../../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../../src/interfaces/api/auth.js";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, ["SALES", "MANAGER", "ADMIN"]);
    const { id: conversationId } = await params;
    if (!conversationId) return badRequest("Missing conversation id");
    const { conversationRepository } = apiBootstrap();
    await conversationRepository.markAsRead({
      tenantId: auth.tenantId,
      conversationId
    });
    return ok({ ok: true });
  } catch (error) {
    if (String(error).includes("Unauthorized")) return unauthorized();
    if (String(error).includes("Forbidden")) return forbidden();
    return serverError(error);
  }
}
