import { NextRequest } from "next/server";
import { apiBootstrap } from "../../../../../src/interfaces/api/bootstrap.js";
import { requireAuth } from "../../../../../src/interfaces/api/auth.js";
import {
  listEligibleFacebookActivationTargets,
  type FacebookActivationTargetDto
} from "../../../../../src/application/metaPageCredentialActivation/listFacebookActivationTargets.js";
import { forbidden, ok, serverError, unauthorized } from "../../../../../src/interfaces/api/http.js";

export type MetaActivationTargetsRouteDeps = {
  apiBootstrap: typeof apiBootstrap;
  requireAuth: typeof requireAuth;
};

function assertActivationTargetsResponseSafe(data: { targets: FacebookActivationTargetDto[] }): void {
  const json = JSON.stringify(data);
  const blocked = [
    "accessToken",
    "access_token",
    "encrypted",
    "ciphertext",
    "authorization",
    "Bearer"
  ];
  for (const key of blocked) {
    if (json.includes(key)) {
      throw new Error(`Activation targets response must not include ${key}`);
    }
  }
}

export function createMetaActivationTargetsHandler(
  deps: MetaActivationTargetsRouteDeps = { apiBootstrap, requireAuth }
) {
  return async function GET(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["ADMIN"]);
      const bootstrap = deps.apiBootstrap();
      const connections = await bootstrap.channelConnectionRepository.listByTenant(auth.tenantId);
      const targets = listEligibleFacebookActivationTargets(connections);
      const payload = {
        data: {
          tenantId: auth.tenantId,
          targets
        }
      };
      assertActivationTargetsResponseSafe(payload.data);
      return ok(payload);
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      return serverError(error);
    }
  };
}

export const GET = createMetaActivationTargetsHandler();
