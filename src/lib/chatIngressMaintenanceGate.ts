import { NextResponse } from "next/server";
import pino from "pino";
import { isChatIngressMaintenanceEnabled } from "./chatIngressMaintenanceFlags.js";

export const CHAT_INGRESS_MAINTENANCE_ERROR_CODE = "CHAT_INGRESS_MAINTENANCE" as const;

/** Conservative retry hint for provider and client backoff (seconds). */
export const CHAT_INGRESS_MAINTENANCE_RETRY_AFTER_SECONDS = 60;

const logger = pino({ name: "chat-ingress-maintenance" });

export type ChatIngressMaintenanceRouteCategory = "webhook" | "messages-send";
export type ChatIngressMaintenanceChannel = "FACEBOOK" | "INSTAGRAM" | "LINE" | "MESSAGES";

export type ChatIngressMaintenanceContext = {
  routeCategory: ChatIngressMaintenanceRouteCategory;
  channel: ChatIngressMaintenanceChannel;
  httpMethod: "POST";
  requestId?: string | null;
};

export function buildChatIngressMaintenanceResponseBody(): {
  code: typeof CHAT_INGRESS_MAINTENANCE_ERROR_CODE;
  error: string;
} {
  return {
    code: CHAT_INGRESS_MAINTENANCE_ERROR_CODE,
    error: "Chat ingress is temporarily unavailable."
  };
}

export function createChatIngressMaintenanceBlockedResponse(
  context: ChatIngressMaintenanceContext
): NextResponse {
  logger.info(
    {
      maintenanceGateEnabled: true,
      routeCategory: context.routeCategory,
      httpMethod: context.httpMethod,
      channel: context.channel,
      responseStatus: 503,
      ...(context.requestId ? { requestId: context.requestId } : {})
    },
    "chat ingress maintenance gate blocked write request"
  );

  return NextResponse.json(buildChatIngressMaintenanceResponseBody(), {
    status: 503,
    headers: {
      "Retry-After": String(CHAT_INGRESS_MAINTENANCE_RETRY_AFTER_SECONDS)
    }
  });
}

export function maybeBlockChatIngressWrite(
  context: ChatIngressMaintenanceContext,
  env: Record<string, string | undefined> = process.env
): NextResponse | null {
  if (!isChatIngressMaintenanceEnabled(env)) {
    return null;
  }
  return createChatIngressMaintenanceBlockedResponse(context);
}
