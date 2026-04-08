import { NextRequest, NextResponse } from "next/server";
import { PatchLeadSchema } from "../../../../src/interfaces/api/contracts.js";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../src/interfaces/api/http.js";
import { assertValidLeadStatusTransition } from "../../../../src/domain/entities.js";
import { requireAuth } from "../../../../src/interfaces/api/auth.js";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, ["SALES", "MANAGER", "ADMIN"]);
    const tenantId = auth.tenantId;
    const { id } = await params;
    const { leadRepository } = apiBootstrap();
    const lead = await leadRepository.findById(tenantId, id);
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    return ok({ data: lead });
  } catch (error) {
    if (String(error).includes("Unauthorized")) return unauthorized();
    if (String(error).includes("Forbidden")) return forbidden();
    return serverError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, ["SALES", "MANAGER", "ADMIN"]);
    const tenantId = auth.tenantId;
    const { id } = await params;
    const body = await req.json();
    const parsed = PatchLeadSchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.message);

    const { leadRepository, activityLogRepository } = apiBootstrap();
    const lead = await leadRepository.findById(tenantId, id);
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    if (parsed.data.status) {
      assertValidLeadStatusTransition(lead.status, parsed.data.status);
    }

    await leadRepository.patch(tenantId, id, {
      status: parsed.data.status,
      tags: parsed.data.tags
    });

    if (parsed.data.status) {
      await activityLogRepository.create({
        tenantId,
        leadId: id,
        type: "STATUS_CHANGED",
        metadataJson: { from: lead.status, to: parsed.data.status }
      });
    }
    if (parsed.data.note) {
      await activityLogRepository.create({
        tenantId,
        leadId: id,
        type: "NOTE_ADDED",
        metadataJson: { note: parsed.data.note }
      });
    }

    const updated = await leadRepository.findById(tenantId, id);
    return ok({ data: updated });
  } catch (error) {
    if (String(error).includes("Unauthorized")) return unauthorized();
    if (String(error).includes("Forbidden")) return forbidden();
    return serverError(error);
  }
}
