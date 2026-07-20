import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiBootstrap } from "../../../src/interfaces/api/bootstrap.js";
import { requireAuth } from "../../../src/interfaces/api/auth.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../src/interfaces/api/http.js";
import {
  MESSAGE_TEMPLATE_LIST_LIMIT,
  MESSAGE_TEMPLATE_SEARCH_MAX,
  formatMessageTemplateValidationError,
  validateMessageTemplateWrite
} from "../../../src/domain/messageTemplates.js";
import type { MessageTemplateRepository } from "../../../src/domain/messageTemplateRepository.js";

const COMPOSER_ROLES = ["SALES", "MANAGER", "ADMIN"] as const;

const CreateBodySchema = z.object({
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

export function createMessageTemplatesGetHandler(deps: RouteDeps) {
  return async function GET(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, [...COMPOSER_ROLES]);
      const qRaw = String(req.nextUrl.searchParams.get("q") ?? "")
        .trim()
        .slice(0, MESSAGE_TEMPLATE_SEARCH_MAX);
      const { messageTemplateRepository } = deps.apiBootstrap() as {
        messageTemplateRepository: MessageTemplateRepository;
      };
      const items = await messageTemplateRepository.listByOwner({
        tenantId: auth.tenantId,
        ownerUserId: auth.userId,
        limit: MESSAGE_TEMPLATE_LIST_LIMIT
      });
      const filtered = qRaw
        ? items.filter(
            (t) =>
              t.title.toLowerCase().includes(qRaw.toLowerCase()) ||
              t.body.toLowerCase().includes(qRaw.toLowerCase())
          )
        : items;
      return ok({ data: filtered });
    } catch (error) {
      const authResp = handleAuthError(error);
      if (authResp) return authResp;
      return serverError(error);
    }
  };
}

export function createMessageTemplatesPostHandler(deps: RouteDeps) {
  return async function POST(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, [...COMPOSER_ROLES]);
      const json = await req.json().catch(() => null);
      const parsed = CreateBodySchema.safeParse(json);
      if (!parsed.success) return badRequest("Invalid request body.");

      // Ignore any client-supplied tenant/owner fields by never reading them.
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
      const created = await messageTemplateRepository.create({
        tenantId: auth.tenantId,
        ownerUserId: auth.userId,
        title: validated.title,
        body: validated.body
      });
      return ok({ data: created }, 201);
    } catch (error) {
      const authResp = handleAuthError(error);
      if (authResp) return authResp;
      return serverError(error);
    }
  };
}

export const GET = createMessageTemplatesGetHandler({ requireAuth, apiBootstrap });
export const POST = createMessageTemplatesPostHandler({ requireAuth, apiBootstrap });
