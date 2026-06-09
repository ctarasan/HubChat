import { NextRequest } from "next/server";
import { getChannelSetupStatus } from "../../../../src/application/channelSetup/getChannelSetupStatus.js";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { forbidden, ok, serverError, unauthorized } from "../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../src/interfaces/api/auth.js";

export type ChannelSetupStatusRouteDeps = {
  apiBootstrap: typeof apiBootstrap;
  requireAuth: typeof requireAuth;
};

export function createChannelSetupStatusGetHandler(
  deps: ChannelSetupStatusRouteDeps = { apiBootstrap, requireAuth }
) {
  return async function GET(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["MANAGER", "ADMIN"]);
      const { channelSettingRepository, channelConnectionRepository } = deps.apiBootstrap();
      const data = await getChannelSetupStatus({
        tenantId: auth.tenantId,
        channelSettingRepository,
        channelConnectionRepository
      });
      return ok(data);
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      return serverError(error);
    }
  };
}

export const GET = createChannelSetupStatusGetHandler();
