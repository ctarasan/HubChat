import { NextRequest, NextResponse } from "next/server";
import { PatchConversationLeadStatusSchema } from "../../../../../src/interfaces/api/contracts.js";
import { apiBootstrap } from "../../../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../../src/interfaces/api/auth.js";
import { UpdateConversationLeadStatusUseCase } from "../../../../../src/application/usecases/updateConversationLeadStatus.js";
import { serializeError } from "../../../../../src/lib/serializeError.js";

type Params = { params: Promise<{ id: string }> };

export function mapConversationLeadStatusRouteError(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Unauthorized")) return unauthorized();
  if (message.includes("Forbidden")) return forbidden();
  if (message.includes("Forbidden conversation lead status update")) return forbidden();
  if (message.includes("Conversation not found") || message.includes("Lead not found")) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  if (message.includes("Invalid lead management status transition")) {
    return badRequest(message);
  }
  if (message.includes("conversation_events insert failed after lead status update")) {
    return NextResponse.json(
      { error: "Lead status updated but audit event failed", detail: message },
      { status: 503 }
    );
  }
  const serialized = serializeError(error);
  const code = serialized.code ?? "";
  const msgLower = message.toLowerCase();
  if (code === "22P02" || msgLower.includes("invalid input value for enum")) {
    return badRequest("Invalid lead status");
  }
  if (code.startsWith("PGRST") || message.includes("PGRST")) {
    return NextResponse.json({ error: "Database error", detail: message }, { status: 503 });
  }
  return serverError(error);
}

type LeadStatusRouteDeps = {
  requireAuth: typeof requireAuth;
  apiBootstrap: typeof apiBootstrap;
};

export function createConversationLeadStatusPatchHandler(deps: LeadStatusRouteDeps) {
  return async function PATCH(req: NextRequest, { params }: Params) {
    try {
      const auth = await deps.requireAuth(req, ["SALES", "MANAGER", "ADMIN"]);
      const { id: conversationId } = await params;
      if (!conversationId) return badRequest("Missing conversation id");
      const body = await req.json();
      const parsed = PatchConversationLeadStatusSchema.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.message);

      const b = deps.apiBootstrap();
      const useCase = new UpdateConversationLeadStatusUseCase({
        conversationRepository: b.conversationRepository,
        leadRepository: b.leadRepository,
        conversationEventRepository: b.conversationEventRepository,
        activityLogRepository: b.activityLogRepository
      });

      const data = await useCase.execute({
        auth,
        conversationId,
        nextLeadStatus: parsed.data.leadStatus,
        note: parsed.data.note
      });

      return ok({ data });
    } catch (error) {
      return mapConversationLeadStatusRouteError(error);
    }
  };
}

export const PATCH = createConversationLeadStatusPatchHandler({ requireAuth, apiBootstrap });
