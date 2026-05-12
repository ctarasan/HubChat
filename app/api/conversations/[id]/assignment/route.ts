import { NextRequest, NextResponse } from "next/server";
import { AssignConversationSchema, UnassignConversationBodySchema } from "../../../../../src/interfaces/api/contracts.js";
import { apiBootstrap } from "../../../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../../src/interfaces/api/auth.js";
import { AssignConversationUseCase } from "../../../../../src/application/usecases/assignConversation.js";

type Params = { params: Promise<{ id: string }> };

function handleAuthError(error: unknown): NextResponse | null {
  if (String(error).includes("Unauthorized")) return unauthorized();
  if (String(error).includes("Forbidden")) return forbidden();
  return null;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, ["MANAGER", "ADMIN"]);
    const { id: conversationId } = await params;
    if (!conversationId) return badRequest("Missing conversation id");
    const body = await req.json();
    const parsed = AssignConversationSchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.message);

    const b = apiBootstrap();
    const useCase = new AssignConversationUseCase({
      conversationAssignmentStore: b.conversationRepository,
      leadRepository: b.leadRepository,
      conversationEventRepository: b.conversationEventRepository,
      salesAgentRepository: b.salesAgentRepository
    });

    const data = await useCase.assignOrReassign({
      tenantId: auth.tenantId,
      actorAuthUserId: auth.userId,
      actorSalesAgentId: auth.salesAgentId,
      actorRole: auth.role,
      conversationId,
      targetSalesAgentId: parsed.data.salesAgentId,
      note: parsed.data.note ?? null
    });

    return ok({ data });
  } catch (error) {
    const authResp = handleAuthError(error);
    if (authResp) return authResp;
    if (String(error).includes("Forbidden assign")) return forbidden();
    if (String(error).includes("Conversation not found")) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    if (String(error).includes("Invalid target sales agent")) return badRequest("Invalid target sales agent");
    return serverError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, ["MANAGER", "ADMIN"]);
    const { id: conversationId } = await params;
    if (!conversationId) return badRequest("Missing conversation id");

    let note: string | null = null;
    const raw = await req.text();
    if (raw.trim()) {
      let body: unknown;
      try {
        body = JSON.parse(raw) as unknown;
      } catch {
        return badRequest("Invalid JSON body");
      }
      const parsed = UnassignConversationBodySchema.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.message);
      note = parsed.data.note ?? null;
    }

    const b = apiBootstrap();
    const useCase = new AssignConversationUseCase({
      conversationAssignmentStore: b.conversationRepository,
      leadRepository: b.leadRepository,
      conversationEventRepository: b.conversationEventRepository,
      salesAgentRepository: b.salesAgentRepository
    });

    const data = await useCase.unassign({
      tenantId: auth.tenantId,
      actorAuthUserId: auth.userId,
      actorSalesAgentId: auth.salesAgentId,
      actorRole: auth.role,
      conversationId,
      note
    });

    return ok({ data });
  } catch (error) {
    const authResp = handleAuthError(error);
    if (authResp) return authResp;
    if (String(error).includes("Forbidden assign")) return forbidden();
    if (String(error).includes("Conversation not found")) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    return serverError(error);
  }
}
