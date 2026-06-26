/**
 * META-CRED-1D-K-S1 — Secure Facebook activation operator UI model.
 * Token-free DTOs and request builders for ADMIN-only activation flow.
 */

export const META_PAGE_ACTIVATION_API = {
  activate: "/api/channel-connect/meta/verify-and-activate",
  targets: "/api/channel-connect/meta/activation-targets"
} as const;

export const META_ACTIVATION_FIXED_REQUESTED_CHANNELS = ["FACEBOOK"] as const;
export const META_ACTIVATION_FIXED_EXPECTED_VERSION = 0;

/** Probe connection id for disabled-gate checks when no target is selected. */
export const META_ACTIVATION_DISABLED_GATE_PROBE_CONNECTION_ID =
  "00000000-0000-0000-0000-000000000000";

export type MetaActivationFetchSession = {
  baseUrl: string;
  accessToken: string;
};

export type MetaActivationTarget = {
  connectionId: string;
  connectionStatus: string;
  providerPageId: string | null;
  providerPageName: string | null;
  publicConnectionKey: string;
};

export type MetaActivationTargetsData = {
  tenantId: string;
  targets: MetaActivationTarget[];
};

export type MetaActivationSuccessData = {
  state: string;
  activationStatus: string;
  credentialId: string;
  credentialVersion: number;
  bindings: Array<{
    channelType: string;
    channelConnectionId: string;
    bindingId: string;
    credentialVersion: number;
  }>;
  idempotencyReplay: boolean;
  requestedChannels: string[];
};

export type MetaActivationIntent = {
  idempotencyKey: string;
  facebookConnectionId: string;
  accessToken: string;
  target: MetaActivationTarget;
  tenantId: string;
};

export type MetaActivationDisabledGateResult =
  | { kind: "disabled_as_expected"; code: string }
  | { kind: "unexpected_enabled"; httpStatus: number; code: string | null }
  | { kind: "unexpected_status"; httpStatus: number; code: string | null }
  | { kind: "transport_uncertain" };

const FORBIDDEN_RENDER_SUBSTRINGS = [
  "accessToken",
  "access_token",
  "Authorization",
  "Bearer ",
  "EAA_FAKE_TEST_TOKEN_MARKER"
] as const;

export function generateActivationIdempotencyKey(randomUuid: () => string): string {
  const key = randomUuid().trim();
  if (!key || key.length > 128) {
    throw new Error("Idempotency key generation failed");
  }
  return key;
}

export function buildFacebookOnlyActivationBody(input: {
  accessToken: string;
  facebookConnectionId: string;
}): Record<string, unknown> {
  return {
    accessToken: input.accessToken,
    facebookConnectionId: input.facebookConnectionId,
    requestedChannels: [...META_ACTIVATION_FIXED_REQUESTED_CHANNELS],
    expectedCredentialVersion: META_ACTIVATION_FIXED_EXPECTED_VERSION
  };
}

export function buildDisabledGateProbeBody(
  facebookConnectionId: string = META_ACTIVATION_DISABLED_GATE_PROBE_CONNECTION_ID
): Record<string, unknown> {
  return {
    accessToken: "",
    facebookConnectionId,
    requestedChannels: [...META_ACTIVATION_FIXED_REQUESTED_CHANNELS],
    expectedCredentialVersion: META_ACTIVATION_FIXED_EXPECTED_VERSION
  };
}

export function sanitizeTenantDisplayLabel(tenantId: string): string {
  const trimmed = tenantId.trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

export function formatPageIdentity(target: MetaActivationTarget): string {
  const name = target.providerPageName?.trim();
  const pageId = target.providerPageId?.trim();
  if (name && pageId) return `${name} (${pageId})`;
  if (name) return name;
  if (pageId) return pageId;
  return "—";
}

export function formatConnectionIdentity(target: MetaActivationTarget): string {
  const key = target.publicConnectionKey?.trim();
  const suffix = target.connectionId.trim();
  const shortId = suffix.length > 12 ? `${suffix.slice(0, 4)}…${suffix.slice(-4)}` : suffix;
  return key ? `${key} · ${shortId}` : shortId;
}

export async function metaActivationFetch(
  session: MetaActivationFetchSession,
  tenantId: string,
  path: string,
  init?: RequestInit
): Promise<{ res: Response; body: unknown }> {
  const res = await fetch(`${session.baseUrl}${path}`, {
    ...init,
    credentials: init?.credentials ?? "include",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "x-tenant-id": tenantId,
      ...(init?.headers ?? {})
    }
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { res, body };
}

export function parseActivationTargetsResponse(
  body: unknown
): { ok: true; data: MetaActivationTargetsData } | { ok: false; error: string } {
  const data = (body as { data?: MetaActivationTargetsData })?.data;
  if (!data || typeof data.tenantId !== "string" || !Array.isArray(data.targets)) {
    return { ok: false, error: "Could not load activation targets." };
  }
  for (const target of data.targets) {
    if (
      !target ||
      typeof target.connectionId !== "string" ||
      typeof target.connectionStatus !== "string" ||
      typeof target.publicConnectionKey !== "string"
    ) {
      return { ok: false, error: "Invalid activation targets response." };
    }
  }
  return { ok: true, data };
}

export function parseActivationSuccessResponse(
  body: unknown
): { ok: true; data: MetaActivationSuccessData } | { ok: false; error: string } {
  const data = (body as { data?: MetaActivationSuccessData })?.data;
  if (!data || typeof data.state !== "string") {
    return { ok: false, error: "Activation response was invalid." };
  }
  assertActivationRenderSafe(JSON.stringify(data));
  return { ok: true, data };
}

export function parseDisabledGateResponse(
  httpStatus: number,
  body: unknown
): MetaActivationDisabledGateResult {
  const code = (body as { code?: string })?.code ?? null;
  if (httpStatus === 503 && code === "META_ACTIVATION_DISABLED") {
    return { kind: "disabled_as_expected", code };
  }
  if (httpStatus >= 200 && httpStatus < 300) {
    return { kind: "unexpected_enabled", httpStatus, code };
  }
  if (httpStatus === 400 && code === "META_ACTIVATION_INPUT_INVALID") {
    return { kind: "unexpected_enabled", httpStatus, code };
  }
  return { kind: "unexpected_status", httpStatus, code };
}

export function mapActivationFetchError(httpStatus: number, body: unknown): string {
  const code = (body as { code?: string; error?: string })?.code;
  const error = (body as { error?: string })?.error;
  if (httpStatus === 401) return "Session expired. Sign in again.";
  if (httpStatus === 403) return "Activation is available to Admins only.";
  if (httpStatus === 503 && code === "META_ACTIVATION_DISABLED") {
    return "Activation gate is disabled.";
  }
  if (code === "META_ACTIVATION_CONFLICT") return "Activation conflict. Stop and verify database state.";
  if (code === "META_ACTIVATION_INPUT_INVALID") return "Activation request was invalid.";
  if (typeof error === "string" && error.trim()) return error.trim();
  return "Activation failed. Contact engineering with the correlation reference if provided.";
}

export function mapDisabledGateResultMessage(result: MetaActivationDisabledGateResult): string {
  switch (result.kind) {
    case "disabled_as_expected":
      return "Activation gate is disabled as expected (META_ACTIVATION_DISABLED).";
    case "unexpected_enabled":
      return "Unexpected activation gate state. Stop — do not submit a real token until verified.";
    case "unexpected_status":
      return "Activation gate check returned an unexpected status. Stop and verify.";
    case "transport_uncertain":
      return "Could not confirm activation gate state due to a network error. Retry the gate check only.";
  }
}

export function assertActivationRenderSafe(rendered: string): void {
  for (const needle of FORBIDDEN_RENDER_SUBSTRINGS) {
    if (rendered.includes(needle)) {
      throw new Error(`Activation UI must not render forbidden value: ${needle}`);
    }
  }
}

export function buildActivationIntent(input: {
  randomUuid: () => string;
  accessToken: string;
  target: MetaActivationTarget;
  tenantId: string;
}): MetaActivationIntent {
  const token = input.accessToken.trim();
  if (!token) {
    throw new Error("Page access token is required");
  }
  return {
    idempotencyKey: generateActivationIdempotencyKey(input.randomUuid),
    facebookConnectionId: input.target.connectionId,
    accessToken: token,
    target: input.target,
    tenantId: input.tenantId
  };
}

export function activationIntentRequestBody(intent: MetaActivationIntent): Record<string, unknown> {
  return buildFacebookOnlyActivationBody({
    accessToken: intent.accessToken,
    facebookConnectionId: intent.facebookConnectionId
  });
}
