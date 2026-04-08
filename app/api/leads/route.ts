import { NextRequest } from "next/server";
import { LeadQuerySchema } from "../../../src/interfaces/api/contracts.js";
import { apiBootstrap } from "../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../src/interfaces/api/auth.js";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ["SALES", "MANAGER", "ADMIN"]);
    const tenantId = auth.tenantId;
    const qs = Object.fromEntries(req.nextUrl.searchParams.entries());
    const query = LeadQuerySchema.safeParse(qs);
    if (!query.success) return badRequest(query.error.message);

    const { leadRepository } = apiBootstrap();
    const leads = await leadRepository.list({ tenantId, ...query.data });
    return ok({ data: leads });
  } catch (error) {
    if (String(error).includes("Unauthorized")) return unauthorized();
    if (String(error).includes("Forbidden")) return forbidden();
    return serverError(error);
  }
}
