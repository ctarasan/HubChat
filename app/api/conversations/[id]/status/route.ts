import { NextRequest, NextResponse } from "next/server";
import { PatchConversationStatusSchema } from "../../../../../src/interfaces/api/contracts.js";
import { apiBootstrap } from "../../../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../../src/interfaces/api/auth.js";
import { UpdateConversationStatusUseCase } from "../../../../../src/application/usecases/updateConversationStatus.js";
import { serializeError } from "../../../../../src/lib/serializeError.js";

type Params = { params: Promise<{ id: string }> };

export function mapConversationStatusRouteError(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Unauthorized")) return unauthorized();
  if (message.includes("Forbidden")) return forbidden();
  if (message.includes("Forbidden conversation status update")) return forbidden();
  if (message.includes("Conversation not found")) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  if (message.includes("conversation_events insert failed after status update")) {
    return NextResponse.json(
      { error: "Conversation status updated but audit event failed", detail: message },
      { status: 503 }
    );
  }
  const serialized = serializeError(error);
  const code = serialized.code ?? "";
  const msgLower = message.toLowerCase();
  if (code === "22P02" || msgLower.includes("invalid input value for enum")) {
    return badRequest("Invalid conversation status");
  }
  if (
    code === "42703" ||
    code === "PGRST204" ||
    msgLower.includes("resolved_at") ||
    (msgLower.includes("does not exist") && msgLower.includes("column"))
  ) {
    return NextResponse.json(
      {
        error: "Conversation status update unavailable (database schema)",
        detail: message
      },
      { status: 503 }
    );
  }
  if (code.startsWith("PGRST") || message.includes("PGRST")) {
    return NextResponse.json({ error: "Database error", detail: message }, { status: 503 });
  }
  return serverError(error);
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
      return mapConversationStatusRouteError(error);
    }
  };
}

export const PATCH = createConversationStatusPatchHandler({ requireAuth, apiBootstrap });
