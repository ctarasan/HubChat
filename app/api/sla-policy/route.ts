import { NextRequest } from "next/server";
import { GetTenantSlaPolicyUseCase } from "../../../src/application/usecases/getTenantSlaPolicy.js";
import { UpdateTenantSlaPolicyUseCase } from "../../../src/application/usecases/updateTenantSlaPolicy.js";
import { isSlaPolicyVersionConflict } from "../../../src/domain/slaPolicyApi.js";
import { rejectDeferredSlaPolicyFields, validateTenantSlaPolicy } from "../../../src/domain/tenantSlaPolicy.js";
import { apiBootstrap } from "../../../src/interfaces/api/bootstrap.js";
import {
  badRequest,
  conflict,
  forbidden,
  ok,
  serverError,
  unauthorized
} from "../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../src/interfaces/api/auth.js";
import {
  PatchSlaPolicyBodySchema,
  rejectDeferredPatchFields
} from "../../../src/interfaces/api/slaPolicyContracts.js";

export type SlaPolicyRouteDeps = {
  apiBootstrap: typeof apiBootstrap;
  requireAuth: typeof requireAuth;
};

function mapDomainValidationError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createSlaPolicyGetHandler(
  deps: SlaPolicyRouteDeps = { apiBootstrap, requireAuth }
) {
  return async function GET(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["MANAGER", "ADMIN"]);
      const { slaPolicyRepository } = deps.apiBootstrap();
      const useCase = new GetTenantSlaPolicyUseCase({ slaPolicyRepository });
      const data = await useCase.execute({ tenantId: auth.tenantId });
      return ok({ data });
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      return serverError(error);
    }
  };
}

export function createSlaPolicyPatchHandler(
  deps: SlaPolicyRouteDeps = { apiBootstrap, requireAuth }
) {
  return async function PATCH(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["ADMIN"]);
      const body = (await req.json()) as Record<string, unknown>;

      const deferredError = rejectDeferredPatchFields(body);
      if (deferredError) return badRequest(deferredError);

      rejectDeferredSlaPolicyFields(body);

      const parsed = PatchSlaPolicyBodySchema.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.message);

      let validated;
      try {
        validated = validateTenantSlaPolicy(parsed.data);
      } catch (error) {
        return badRequest(mapDomainValidationError(error));
      }

      const { slaPolicyRepository } = deps.apiBootstrap();
      const useCase = new UpdateTenantSlaPolicyUseCase({ slaPolicyRepository });

      try {
        await useCase.assertPatchVersion({
          tenantId: auth.tenantId,
          patchVersion: validated.version
        });
      } catch (error) {
        if (isSlaPolicyVersionConflict(error)) {
          return conflict({ error: "Conflict", currentVersion: error.currentVersion });
        }
        throw error;
      }

      const data = await useCase.execute({
        tenantId: auth.tenantId,
        updatedByAuthUserId: auth.userId,
        patch: validated
      });
      return ok({ data });
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      if (isSlaPolicyVersionConflict(error)) {
        return conflict({ error: "Conflict", currentVersion: error.currentVersion });
      }
      return serverError(error);
    }
  };
}

export const GET = createSlaPolicyGetHandler();
export const PATCH = createSlaPolicyPatchHandler();
