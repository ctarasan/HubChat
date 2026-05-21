import { NextRequest } from "next/server";
import { z } from "zod";
import { UpsertChannelSettingUseCase } from "../../../../src/application/usecases/upsertChannelSetting.js";
import { isSupportedChannelSettingChannel } from "../../../../src/domain/channelSettings.js";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../src/interfaces/api/auth.js";
import { parseChannelParam } from "../../../../src/lib/channelSettingSecrets.js";

const ApiSecretFieldSchema = z.enum(["accessToken", "channelSecret", "verifyToken", "appSecret"]);

const PatchBodySchema = z
  .object({
    enabled: z.boolean().optional(),
    displayName: z.string().nullable().optional(),
    configJson: z.record(z.unknown()).optional(),
    providerPageId: z.string().nullable().optional(),
    providerAccountName: z.string().nullable().optional(),
    secrets: z.record(z.string()).optional(),
    clearSecrets: z.array(ApiSecretFieldSchema).optional(),
    clearSecretKeys: z.array(z.string()).optional()
  })
  .strict();

export type ChannelSettingPatchRouteDeps = {
  apiBootstrap: typeof apiBootstrap;
  requireAuth: typeof requireAuth;
};

export function createChannelSettingPatchHandler(
  deps: ChannelSettingPatchRouteDeps = { apiBootstrap, requireAuth }
) {
  return async function PATCH(req: NextRequest, ctx: { params: Promise<{ channel: string }> }) {
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

      const body = await req.json();
      const parsed = PatchBodySchema.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.message);

      const { channelSettingRepository } = deps.apiBootstrap();
      const useCase = new UpsertChannelSettingUseCase(channelSettingRepository);
      const data = await useCase.execute({
        tenantId: auth.tenantId,
        channel,
        enabled: parsed.data.enabled,
        displayName: parsed.data.displayName,
        configJson: parsed.data.configJson,
        providerPageId: parsed.data.providerPageId,
        providerAccountName: parsed.data.providerAccountName,
        secretsPatch: parsed.data.secrets,
        clearSecrets: parsed.data.clearSecrets,
        legacyClearSecretKeys: parsed.data.clearSecretKeys
      });

      return ok({ data });
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      const msg = String(error instanceof Error ? error.message : error);
      if (
        msg.includes("must be") ||
        msg.includes("Unknown secret") ||
        msg.includes("not allowed") ||
        msg.includes("Unsupported channel")
      ) {
        return badRequest(msg);
      }
      return serverError(error);
    }
  };
}

export const PATCH = createChannelSettingPatchHandler();
