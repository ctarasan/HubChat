import { sanitizeProviderErrorMessage } from "../../../lib/sanitizeProviderError.js";
import type { InstagramProfessionalIdentity } from "../../../domain/instagramIdentity.js";
import {
  InstagramIdentityValidationError,
  validateInstagramProfessionalIdentityRaw
} from "../../../lib/instagramIdentityValidation.js";

export const INSTAGRAM_GRAPH_HOST = "https://graph.instagram.com";

/** Fixed `/me` field allowlist for professional identity verification (IG-AUTH-2D). */
export const INSTAGRAM_PROFESSIONAL_IDENTITY_ME_FIELDS = [
  "user_id",
  "username",
  "account_type"
] as const;

export type InstagramProfessionalIdentityClientConfig = {
  graphVersion: string;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
};

export class InstagramProfessionalIdentityError extends Error {
  override readonly name = "InstagramProfessionalIdentityError";

  constructor(
    message: string,
    readonly code: string,
    readonly statusCode?: number
  ) {
    super(message);
  }
}

function graphBase(version: string): string {
  const trimmed = version.trim().startsWith("v") ? version.trim() : `v${version.trim()}`;
  return `${INSTAGRAM_GRAPH_HOST}/${trimmed}`;
}

async function fetchWithBounds(
  config: InstagramProfessionalIdentityClientConfig,
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
      throw new InstagramProfessionalIdentityError(
        "Provider response exceeded size limit.",
        "INSTAGRAM_OAUTH_IDENTITY_RESPONSE_INVALID"
      );
    }
    return response;
  } catch (error) {
    if (error instanceof InstagramProfessionalIdentityError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new InstagramProfessionalIdentityError(
        "Provider identity request timed out.",
        "INSTAGRAM_OAUTH_PROVIDER_UNAVAILABLE"
      );
    }
    throw new InstagramProfessionalIdentityError(
      "Provider identity request failed.",
      "INSTAGRAM_OAUTH_PROVIDER_UNAVAILABLE"
    );
  } finally {
    clearTimeout(timer);
  }
}

function mapProviderFailure(status: number, providerCode?: number): string {
  if (status === 429) return "INSTAGRAM_OAUTH_PROVIDER_RATE_LIMITED";
  if (status >= 500) return "INSTAGRAM_OAUTH_PROVIDER_UNAVAILABLE";
  if (providerCode === 190 || providerCode === 102) return "INSTAGRAM_OAUTH_REAUTH_REQUIRED";
  if (providerCode === 10 || providerCode === 200) return "INSTAGRAM_OAUTH_PERMISSION_MISSING";
  if (status === 401 || status === 403) return "INSTAGRAM_OAUTH_REAUTH_REQUIRED";
  return "INSTAGRAM_OAUTH_IDENTITY_RESPONSE_INVALID";
}

export async function fetchInstagramProfessionalIdentity(
  config: InstagramProfessionalIdentityClientConfig,
  accessToken: string
): Promise<InstagramProfessionalIdentity> {
  const url = new URL(`${graphBase(config.graphVersion)}/me`);
  url.searchParams.set("fields", INSTAGRAM_PROFESSIONAL_IDENTITY_ME_FIELDS.join(","));

  const response = await fetchWithBounds(config, url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }

  if (!response.ok) {
    const error = body.error as { message?: string; code?: number } | undefined;
    const code = mapProviderFailure(response.status, error?.code);
    throw new InstagramProfessionalIdentityError(
      sanitizeProviderErrorMessage(error?.message ?? "Instagram identity request failed"),
      code,
      response.status
    );
  }

  try {
    return validateInstagramProfessionalIdentityRaw({
      userId: typeof body.user_id === "string" ? body.user_id : String(body.user_id ?? ""),
      username: typeof body.username === "string" ? body.username : "",
      accountType: typeof body.account_type === "string" ? body.account_type : ""
    });
  } catch (error) {
    if (error instanceof InstagramIdentityValidationError) {
      throw new InstagramProfessionalIdentityError(error.message, error.code);
    }
    throw error;
  }
}

export interface InstagramProfessionalIdentityClient {
  getOwnProfessionalAccount(input: { accessToken: string }): Promise<InstagramProfessionalIdentity>;
}

export function createInstagramProfessionalIdentityClient(
  config: InstagramProfessionalIdentityClientConfig
): InstagramProfessionalIdentityClient {
  return {
    getOwnProfessionalAccount: (input) => fetchInstagramProfessionalIdentity(config, input.accessToken)
  };
}
