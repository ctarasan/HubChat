import { sanitizeProviderErrorMessage } from "../../../lib/sanitizeProviderError.js";
import { INSTAGRAM_GRAPH_HOST } from "./instagramProfessionalIdentity.js";

export type InstagramOAuthMessagingClientConfig = {
  graphVersion: string;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
};

export type InstagramOAuthTextMessageRequest = {
  professionalAccountId: string;
  accessToken: string;
  recipientMessagingScopedUserId: string;
  messageText: string;
};

export type InstagramOAuthTextMessageResult = {
  externalMessageId: string;
  recipientId?: string;
};

export type InstagramOAuthMessagingErrorCode =
  | "REAUTH_REQUIRED"
  | "TOKEN_REVOKED"
  | "PERMISSION_MISSING"
  | "RECIPIENT_UNAVAILABLE"
  | "MESSAGE_WINDOW_CLOSED"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_CONTRACT_ERROR"
  | "DELIVERY_FAILED_RETRYABLE"
  | "DELIVERY_FAILED_TERMINAL";

export class InstagramOAuthMessagingError extends Error {
  override readonly name = "InstagramOAuthMessagingError";

  constructor(
    message: string,
    readonly code: InstagramOAuthMessagingErrorCode,
    readonly statusCode?: number
  ) {
    super(message);
  }
}

function graphBase(version: string): string {
  const trimmed = version.trim().startsWith("v") ? version.trim() : `v${version.trim()}`;
  return `${INSTAGRAM_GRAPH_HOST}/${trimmed}`;
}

export function buildInstagramOAuthTextMessagePayload(input: {
  recipientMessagingScopedUserId: string;
  messageText: string;
}): { recipient: { id: string }; message: { text: string } } {
  return {
    recipient: { id: input.recipientMessagingScopedUserId },
    message: { text: input.messageText }
  };
}

/** Official Instagram Login messaging endpoint: POST /{IG_ID}/messages (not /me/messages). */
export function buildInstagramOAuthMessagesEndpoint(input: {
  graphVersion: string;
  professionalAccountId: string;
}): string {
  const accountId = input.professionalAccountId.trim();
  if (!accountId) {
    throw new InstagramOAuthMessagingError(
      "Instagram OAuth sender account ID is required.",
      "PROVIDER_CONTRACT_ERROR"
    );
  }
  return `${graphBase(input.graphVersion)}/${encodeURIComponent(accountId)}/messages`;
}

export function buildInstagramOAuthMessagesPathForLog(input: {
  graphVersion: string;
  professionalAccountId: string;
}): string {
  const version = input.graphVersion.trim().startsWith("v")
    ? input.graphVersion.trim()
    : `v${input.graphVersion.trim()}`;
  return `/${version}/{professionalAccountId}/messages`;
}

async function fetchWithBounds(
  config: InstagramOAuthMessagingClientConfig,
  url: string,
  init: RequestInit
): Promise<Response> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.requestTimeoutMs ?? 15_000;
  const maxBytes = config.maxResponseBytes ?? 64_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal, redirect: "manual" });
    const clone = response.clone();
    const buffer = await clone.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
      throw new InstagramOAuthMessagingError(
        "Provider response exceeded size limit.",
        "PROVIDER_CONTRACT_ERROR"
      );
    }
    return response;
  } catch (error) {
    if (error instanceof InstagramOAuthMessagingError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new InstagramOAuthMessagingError(
        "Provider messaging request timed out.",
        "PROVIDER_UNAVAILABLE"
      );
    }
    throw new InstagramOAuthMessagingError(
      "Provider messaging request failed.",
      "PROVIDER_UNAVAILABLE"
    );
  } finally {
    clearTimeout(timer);
  }
}

function mapProviderFailure(
  status: number,
  providerCode?: number,
  providerSubcode?: number
): InstagramOAuthMessagingErrorCode {
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "PROVIDER_UNAVAILABLE";
  if (providerCode === 190) return "REAUTH_REQUIRED";
  if (providerCode === 102) return "TOKEN_REVOKED";
  if (providerCode === 10 && (providerSubcode === 2534022 || providerSubcode === 2018278)) {
    return "MESSAGE_WINDOW_CLOSED";
  }
  if (providerCode === 10 || providerCode === 200) return "PERMISSION_MISSING";
  if (status === 401 || status === 403) return "REAUTH_REQUIRED";
  if (status === 404) return "RECIPIENT_UNAVAILABLE";
  if (status >= 400 && status < 500) return "DELIVERY_FAILED_TERMINAL";
  return "DELIVERY_FAILED_RETRYABLE";
}

function parseSuccessResponse(body: Record<string, unknown>): InstagramOAuthTextMessageResult {
  const messageId =
    typeof body.message_id === "string"
      ? body.message_id
      : typeof body.message_id === "number"
        ? String(body.message_id)
        : "";
  if (!messageId.trim()) {
    throw new InstagramOAuthMessagingError(
      "Provider messaging response missing message_id.",
      "PROVIDER_CONTRACT_ERROR"
    );
  }
  const recipientId =
    typeof body.recipient_id === "string"
      ? body.recipient_id
      : typeof body.recipient_id === "number"
        ? String(body.recipient_id)
        : undefined;
  return {
    externalMessageId: messageId.trim(),
    recipientId: recipientId?.trim() || undefined
  };
}

export async function sendInstagramOAuthTextMessage(
  config: InstagramOAuthMessagingClientConfig,
  request: InstagramOAuthTextMessageRequest
): Promise<InstagramOAuthTextMessageResult> {
  const url = buildInstagramOAuthMessagesEndpoint({
    graphVersion: config.graphVersion,
    professionalAccountId: request.professionalAccountId
  });
  if (url.includes("access_token=")) {
    throw new InstagramOAuthMessagingError(
      "Token must not be sent in URL.",
      "PROVIDER_CONTRACT_ERROR"
    );
  }

  const response = await fetchWithBounds(config, url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${request.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(
      buildInstagramOAuthTextMessagePayload({
        recipientMessagingScopedUserId: request.recipientMessagingScopedUserId,
        messageText: request.messageText
      })
    )
  });

  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }

  if (!response.ok) {
    const error = body.error as { message?: string; code?: number; error_subcode?: number } | undefined;
    const code = mapProviderFailure(response.status, error?.code, error?.error_subcode);
    throw new InstagramOAuthMessagingError(
      sanitizeProviderErrorMessage(error?.message ?? "Instagram OAuth messaging request failed."),
      code,
      response.status
    );
  }

  return parseSuccessResponse(body);
}

export interface InstagramOAuthMessagingClient {
  sendTextMessage(request: InstagramOAuthTextMessageRequest): Promise<InstagramOAuthTextMessageResult>;
}

export function createInstagramOAuthMessagingClient(
  config: InstagramOAuthMessagingClientConfig
): InstagramOAuthMessagingClient {
  return {
    sendTextMessage: (request) => sendInstagramOAuthTextMessage(config, request)
  };
}
