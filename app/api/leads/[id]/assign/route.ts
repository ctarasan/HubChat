import { NextRequest, NextResponse } from "next/server";
import { AssignLeadSchema } from "../../../../../src/interfaces/api/contracts.js";
import { apiBootstrap } from "../../../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../../src/interfaces/api/http.js";
import { AssignLeadUseCase } from "../../../../../src/application/usecases/assignLead.js";
import { requireAuth } from "../../../../../src/interfaces/api/auth.js";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, ["MANAGER", "ADMIN"]);
    const tenantId = auth.tenantId;
    const { id } = await params;
    const body = await req.json();
    const parsed = AssignLeadSchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.message);

    const { leadRepository, activityLogRepository } = apiBootstrap();
    const lead = await leadRepository.findById(tenantId, id);
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const useCase = new AssignLeadUseCase({ leadRepository, activityLogRepository });
    await useCase.execute({
      tenantId,
      leadId: id,
      fromStatus: lead.status,
      salesAgentId: parsed.data.salesAgentId
    });

    const updated = await leadRepository.findById(tenantId, id);
    return ok({ data: updated });
  } catch (error) {
    if (String(error).includes("Unauthorized")) return unauthorized();
    if (String(error).includes("Forbidden")) return forbidden();
    return serverError(error);
  }
}
