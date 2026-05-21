import { NextRequest } from "next/server";
import { TestChannelConnectionUseCase } from "../../../../../src/application/usecases/testChannelConnection.js";
import { isSupportedChannelSettingChannel } from "../../../../../src/domain/channelSettings.js";
import { apiBootstrap } from "../../../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../../src/interfaces/api/auth.js";
import { parseChannelParam } from "../../../../../src/lib/channelSettingSecrets.js";

export type ChannelTestConnectionRouteDeps = {
  apiBootstrap: typeof apiBootstrap;
  requireAuth: typeof requireAuth;
};

export function createChannelTestConnectionHandler(
  deps: ChannelTestConnectionRouteDeps = { apiBootstrap, requireAuth }
) {
  return async function POST(req: NextRequest, ctx: { params: Promise<{ channel: string }> }) {
    try {
      const auth = await deps.requireAuth(req, ["ADMIN"]);
      const { channel: channelParam } = await ctx.params;
      let channel: ReturnType<typeof parseChannelParam>;
      try {
        channel = parseChannelParam(channelParam);
      } catch {
        return badRequest("Unsupported channel");
      }
      if (!isSupportedChannelSettingChannel(channel)) {
        return badRequest("Unsupported channel");
      }

      const { channelSettingRepository } = deps.apiBootstrap();
      const useCase = new TestChannelConnectionUseCase(channelSettingRepository);
      const data = await useCase.execute({
        tenantId: auth.tenantId,
        channel
      });

      return ok(data);
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      const msg = String(error instanceof Error ? error.message : error);
      if (msg.includes("Unsupported channel")) return badRequest(msg);
      return serverError(error);
    }
  };
}

export const POST = createChannelTestConnectionHandler();
