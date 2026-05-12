import { NextRequest, NextResponse } from "next/server";
import { PatchConversationStatusSchema } from "../../../../../src/interfaces/api/contracts.js";
import { apiBootstrap } from "../../../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../../src/interfaces/api/auth.js";
import { UpdateConversationStatusUseCase } from "../../../../../src/application/usecases/updateConversationStatus.js";

type Params = { params: Promise<{ id: string }> };

function handleAuthError(error: unknown): NextResponse | null {
  if (String(error).includes("Unauthorized")) return unauthorized();
  if (String(error).includes("Forbidden")) return forbidden();
  return null;
}

type StatusRouteDeps = {
  requireAuth: typeof requireAuth;
  apiBootstrap: typeof apiBootstrap;
};

export function createConversationStatusPatchHandler(deps: StatusRouteDeps) {
  return async function PATCH(req: NextRequest, { params }: Params) {
    try {
      const auth = await deps.requireAuth(req, ["SALES", "MANAGER", "ADMIN"]);
      const { id: conversationId } = await params;
      if (!conversationId) return badRequest("Missing conversation id");
      const body = await req.json();
      const parsed = PatchConversationStatusSchema.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.message);

      const b = deps.apiBootstrap();
      const useCase = new UpdateConversationStatusUseCase({
        conversationRepository: b.conversationRepository,
        conversationEventRepository: b.conversationEventRepository
      });

      const data = await useCase.execute({
        auth,
        conversationId,
        nextStatus: parsed.data.status
      });

      return ok({ data });
    } catch (error) {
      const authResp = handleAuthError(error);
      if (authResp) return authResp;
      if (String(error).includes("Forbidden conversation status update")) return forbidden();
      if (String(error).includes("Conversation not found")) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      return serverError(error);
    }
  };
}

export const PATCH = createConversationStatusPatchHandler({ requireAuth, apiBootstrap });
