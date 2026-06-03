import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_SIGNATURE_UNAUTHORIZED = "Unauthorized webhook request";
export const WEBHOOK_SIGNATURE_MISCONFIGURED = "Webhook signature verification is not configured";

export type WebhookSignatureVerifyResult =
  | { ok: true }
  | { ok: false; status: 401; error: string };

export const INSTAGRAM_WEBHOOK_SIGNATURE_ROUTE = "/api/webhook/instagram" as const;

export type MetaWebhookSignatureAlgorithm = "sha256" | "sha1" | "none";

export type MetaWebhookSignatureFailureReason =
  | "missing_signature"
  | "missing_secret"
  | "invalid_signature"
  | "unsupported_signature_format";

export type InstagramWebhookSignatureDiagnostics = {
  route: typeof INSTAGRAM_WEBHOOK_SIGNATURE_ROUTE;
  hasSha256Signature: boolean;
  hasSha1Signature: boolean;
  selectedAlgorithm: MetaWebhookSignatureAlgorithm;
  rawBodyByteLength: number;
  secretConfigured: boolean;
  failureReason?: MetaWebhookSignatureFailureReason;
  isFacebookExternalUa: boolean;
};

export function isFacebookExternalUserAgent(userAgent: string | null | undefined): boolean {
  const normalized = typeof userAgent === "string" ? userAgent.trim().toLowerCase() : "";
  return normalized.includes("facebookexternalua");
}

export function resolveMetaAppSecret(
  env: Record<string, string | undefined> = process.env
): string | undefined {
  const candidates = [
    env.FACEBOOK_APP_SECRET,
    env.META_APP_SECRET,
    env.INSTAGRAM_APP_SECRET
  ];
  for (const value of candidates) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) return trimmed;
  }
  return undefined;
}

export function computeLineWebhookSignature(channelSecret: string, rawBody: string): string {
  return createHmac("sha256", channelSecret).update(rawBody, "utf8").digest("base64");
}

export function verifyLineWebhookSignature(input: {
  channelSecret: string | undefined;
  signatureHeader: string | null;
  rawBody: string;
}): WebhookSignatureVerifyResult {
  const channelSecret = input.channelSecret?.trim();
  if (!channelSecret) {
    return { ok: false, status: 401, error: WEBHOOK_SIGNATURE_MISCONFIGURED };
  }
  const signature = input.signatureHeader?.trim();
  if (!signature) {
    return { ok: false, status: 401, error: WEBHOOK_SIGNATURE_UNAUTHORIZED };
  }
  const expected = computeLineWebhookSignature(channelSecret, input.rawBody);
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return { ok: false, status: 401, error: WEBHOOK_SIGNATURE_UNAUTHORIZED };
  }
  return { ok: true };
}

export function parseMetaHubSignature256(signatureHeader: string): Buffer | null {
  const trimmed = signatureHeader.trim();
  const match = /^sha256=(.+)$/i.exec(trimmed);
  if (!match) return null;
  const hex = match[1]?.trim() ?? "";
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  return Buffer.from(hex, "hex");
}

export function computeMetaHubSignature256(appSecret: string, rawBody: string): Buffer {
  return createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
}

export function parseMetaHubSignatureSha1(signatureHeader: string): Buffer | null {
  const trimmed = signatureHeader.trim();
  const match = /^sha1=(.+)$/i.exec(trimmed);
  if (!match) return null;
  const hex = match[1]?.trim() ?? "";
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  return Buffer.from(hex, "hex");
}

export function computeMetaHubSignatureSha1(appSecret: string, rawBody: string): Buffer {
  return createHmac("sha1", appSecret).update(rawBody, "utf8").digest();
}

export function buildInstagramWebhookSignatureDiagnostics(input: {
  signature256Header: string | null;
  signatureHeader: string | null;
  rawBody: string;
  appSecret: string | undefined;
  userAgent?: string | null;
  failureReason?: MetaWebhookSignatureFailureReason;
  selectedAlgorithm?: MetaWebhookSignatureAlgorithm;
}): InstagramWebhookSignatureDiagnostics {
  const hasSha256Signature = Boolean(input.signature256Header?.trim());
  const hasSha1Signature = Boolean(input.signatureHeader?.trim());
  const selectedAlgorithm =
    input.selectedAlgorithm ??
    (hasSha256Signature ? "sha256" : hasSha1Signature ? "sha1" : "none");
  return {
    route: INSTAGRAM_WEBHOOK_SIGNATURE_ROUTE,
    hasSha256Signature,
    hasSha1Signature,
    selectedAlgorithm,
    rawBodyByteLength: Buffer.byteLength(input.rawBody, "utf8"),
    secretConfigured: Boolean(input.appSecret?.trim()),
    ...(input.failureReason ? { failureReason: input.failureReason } : {}),
    isFacebookExternalUa: isFacebookExternalUserAgent(input.userAgent ?? null)
  };
}

/** Prefer X-Hub-Signature-256; fall back to legacy X-Hub-Signature (sha1) when 256 is absent. */
export function evaluateMetaHubWebhookSignature(input: {
  appSecret: string | undefined;
  signature256Header: string | null;
  signatureHeader: string | null;
  rawBody: string;
  userAgent?: string | null;
}): { result: WebhookSignatureVerifyResult; diagnostics: InstagramWebhookSignatureDiagnostics } {
  const signature256Header = input.signature256Header?.trim() ?? "";
  const legacySignatureHeader = input.signatureHeader?.trim() ?? "";
  const hasSha256Signature = Boolean(signature256Header);
  const hasSha1Signature = Boolean(legacySignatureHeader);
  const appSecret = input.appSecret?.trim();

  if (!appSecret) {
    return {
      result: { ok: false, status: 401, error: WEBHOOK_SIGNATURE_MISCONFIGURED },
      diagnostics: buildInstagramWebhookSignatureDiagnostics({
        ...input,
        appSecret: undefined,
        failureReason: "missing_secret",
        selectedAlgorithm: hasSha256Signature ? "sha256" : hasSha1Signature ? "sha1" : "none"
      })
    };
  }

  if (hasSha256Signature) {
    const actual = parseMetaHubSignature256(signature256Header);
    if (!actual) {
      return {
        result: { ok: false, status: 401, error: WEBHOOK_SIGNATURE_UNAUTHORIZED },
        diagnostics: buildInstagramWebhookSignatureDiagnostics({
          ...input,
          appSecret,
          failureReason: "unsupported_signature_format",
          selectedAlgorithm: "sha256"
        })
      };
    }
    const expected = computeMetaHubSignature256(appSecret, input.rawBody);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return {
        result: { ok: false, status: 401, error: WEBHOOK_SIGNATURE_UNAUTHORIZED },
        diagnostics: buildInstagramWebhookSignatureDiagnostics({
          ...input,
          appSecret,
          failureReason: "invalid_signature",
          selectedAlgorithm: "sha256"
        })
      };
    }
    return {
      result: { ok: true },
      diagnostics: buildInstagramWebhookSignatureDiagnostics({
        ...input,
        appSecret,
        selectedAlgorithm: "sha256"
      })
    };
  }

  if (!hasSha1Signature) {
    return {
      result: { ok: false, status: 401, error: WEBHOOK_SIGNATURE_UNAUTHORIZED },
      diagnostics: buildInstagramWebhookSignatureDiagnostics({
        ...input,
        appSecret,
        failureReason: "missing_signature",
        selectedAlgorithm: "none"
      })
    };
  }

  const actualSha1 = parseMetaHubSignatureSha1(legacySignatureHeader);
  if (!actualSha1) {
    return {
      result: { ok: false, status: 401, error: WEBHOOK_SIGNATURE_UNAUTHORIZED },
      diagnostics: buildInstagramWebhookSignatureDiagnostics({
        ...input,
        appSecret,
        failureReason: "unsupported_signature_format",
        selectedAlgorithm: "sha1"
      })
    };
  }
  const expectedSha1 = computeMetaHubSignatureSha1(appSecret, input.rawBody);
  if (expectedSha1.length !== actualSha1.length || !timingSafeEqual(expectedSha1, actualSha1)) {
    return {
      result: { ok: false, status: 401, error: WEBHOOK_SIGNATURE_UNAUTHORIZED },
      diagnostics: buildInstagramWebhookSignatureDiagnostics({
        ...input,
        appSecret,
        failureReason: "invalid_signature",
        selectedAlgorithm: "sha1"
      })
    };
  }

  return {
    result: { ok: true },
    diagnostics: buildInstagramWebhookSignatureDiagnostics({
      ...input,
      appSecret,
      selectedAlgorithm: "sha1"
    })
  };
}

export function verifyMetaHubWebhookSignature(input: {
  appSecret: string | undefined;
  signature256Header: string | null;
  signatureHeader: string | null;
  rawBody: string;
}): WebhookSignatureVerifyResult {
  return evaluateMetaHubWebhookSignature(input).result;
}

export function verifyMetaHubSignature256(input: {
  appSecret: string | undefined;
  signatureHeader: string | null;
  rawBody: string;
}): WebhookSignatureVerifyResult {
  return verifyMetaHubWebhookSignature({
    appSecret: input.appSecret,
    signature256Header: input.signatureHeader,
    signatureHeader: null,
    rawBody: input.rawBody
  });
}
