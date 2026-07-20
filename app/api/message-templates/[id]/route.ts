import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { requireAuth } from "../../../../src/interfaces/api/auth.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../src/interfaces/api/http.js";
import {
  formatMessageTemplateValidationError,
  validateMessageTemplateWrite
} from "../../../../src/domain/messageTemplates.js";
import type { MessageTemplateRepository } from "../../../../src/domain/messageTemplateRepository.js";

const COMPOSER_ROLES = ["SALES", "MANAGER", "ADMIN"] as const;

const PatchBodySchema = z.object({
  title: z.string(),
  body: z.string()
});

type RouteDeps = {
  requireAuth: typeof requireAuth;
  apiBootstrap: typeof apiBootstrap;
};

function handleAuthError(error: unknown): NextResponse | null {
  if (String(error).includes("Unauthorized")) return unauthorized();
  if (String(error).includes("Forbidden")) return forbidden();
  return null;
}

function notFoundTemplate(): NextResponse {
  return NextResponse.json({ error: "Template not found." }, { status: 404 });
}

function readId(params: { id?: string }): string {
  return String(params.id ?? "").trim();
}

export function createMessageTemplatePatchHandler(deps: RouteDeps) {
  return async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = await deps.requireAuth(req, [...COMPOSER_ROLES]);
      const id = readId(await ctx.params);
      if (!id) return badRequest("Template id is required.");

      const json = await req.json().catch(() => null);
      const parsed = PatchBodySchema.safeParse(json);
      if (!parsed.success) return badRequest("Invalid request body.");

      const validated = validateMessageTemplateWrite({
        title: parsed.data.title,
        body: parsed.data.body
      });
      if (!validated.ok) {
        return badRequest(formatMessageTemplateValidationError(validated.errors));
      }

      const { messageTemplateRepository } = deps.apiBootstrap() as {
        messageTemplateRepository: MessageTemplateRepository;
      };
      const updated = await messageTemplateRepository.update({
        tenantId: auth.tenantId,
        ownerUserId: auth.userId,
        id,
        title: validated.title,
        body: validated.body
      });
      if (!updated) return notFoundTemplate();
      return ok({ data: updated });
    } catch (error) {
      const authResp = handleAuthError(error);
      if (authResp) return authResp;
      return serverError(error);
    }
  };
}

export function createMessageTemplateDeleteHandler(deps: RouteDeps) {
  return async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = await deps.requireAuth(_req, [...COMPOSER_ROLES]);
      const id = readId(await ctx.params);
      if (!id) return badRequest("Template id is required.");

      const { messageTemplateRepository } = deps.apiBootstrap() as {
        messageTemplateRepository: MessageTemplateRepository;
      };
      const deleted = await messageTemplateRepository.delete({
        tenantId: auth.tenantId,
        ownerUserId: auth.userId,
        id
      });
      if (!deleted) return notFoundTemplate();
      return ok({ data: { id } });
    } catch (error) {
      const authResp = handleAuthError(error);
      if (authResp) return authResp;
      return serverError(error);
    }
  };
}

export const PATCH = createMessageTemplatePatchHandler({ requireAuth, apiBootstrap });
export const DELETE = createMessageTemplateDeleteHandler({ requireAuth, apiBootstrap });
