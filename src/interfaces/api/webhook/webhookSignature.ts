import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_SIGNATURE_UNAUTHORIZED = "Unauthorized webhook request";
export const WEBHOOK_SIGNATURE_MISCONFIGURED = "Webhook signature verification is not configured";

export type WebhookSignatureVerifyResult =
  | { ok: true }
  | { ok: false; status: 401; error: string };

export const FACEBOOK_WEBHOOK_SIGNATURE_ROUTE = "/api/webhook/facebook" as const;
export const INSTAGRAM_WEBHOOK_SIGNATURE_ROUTE = "/api/webhook/instagram" as const;

export type MetaWebhookSignatureRoute =
  | typeof FACEBOOK_WEBHOOK_SIGNATURE_ROUTE
  | typeof INSTAGRAM_WEBHOOK_SIGNATURE_ROUTE;

export type MetaWebhookSignatureAlgorithm = "sha256" | "sha1" | "none";

export type MetaWebhookSignatureFailureReason =
  | "missing_signature"
  | "missing_secret"
  | "invalid_signature"
  | "unsupported_signature_format";

export type MetaWebhookSignatureDiagnostics = {
  route: MetaWebhookSignatureRoute;
  hasSha256Signature: boolean;
  hasSha1Signature: boolean;
  selectedAlgorithm: MetaWebhookSignatureAlgorithm;
  rawBodyByteLength: number;
  secretConfigured: boolean;
  sha256SignatureMatches: boolean | null;
  sha1SignatureMatches: boolean | null;
  verifiedAlgorithm?: "sha256" | "sha1";
  failureReason?: MetaWebhookSignatureFailureReason;
  isFacebookExternalUa: boolean;
};

/** @deprecated Use MetaWebhookSignatureDiagnostics */
export type InstagramWebhookSignatureDiagnostics = MetaWebhookSignatureDiagnostics;

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

export function computeMetaHubSignatureMatches(input: {
  appSecret: string | undefined;
  signature256Header: string | null;
  signatureHeader: string | null;
  rawBody: string;
}): { sha256SignatureMatches: boolean | null; sha1SignatureMatches: boolean | null } {
  const appSecret = input.appSecret?.trim();
  if (!appSecret) {
    return { sha256SignatureMatches: null, sha1SignatureMatches: null };
  }

  const signature256Header = input.signature256Header?.trim() ?? "";
  let sha256SignatureMatches: boolean | null = null;
  if (signature256Header) {
    const actual = parseMetaHubSignature256(signature256Header);
    if (!actual) {
      sha256SignatureMatches = null;
    } else {
      const expected = computeMetaHubSignature256(appSecret, input.rawBody);
      sha256SignatureMatches =
        expected.length === actual.length && timingSafeEqual(expected, actual);
    }
  }

  const legacySignatureHeader = input.signatureHeader?.trim() ?? "";
  let sha1SignatureMatches: boolean | null = null;
  if (legacySignatureHeader) {
    const actual = parseMetaHubSignatureSha1(legacySignatureHeader);
    if (!actual) {
      sha1SignatureMatches = null;
    } else {
      const expected = computeMetaHubSignatureSha1(appSecret, input.rawBody);
      sha1SignatureMatches =
        expected.length === actual.length && timingSafeEqual(expected, actual);
    }
  }

  return { sha256SignatureMatches, sha1SignatureMatches };
}

export function buildMetaWebhookSignatureDiagnostics(input: {
  route: MetaWebhookSignatureRoute;
  signature256Header: string | null;
  signatureHeader: string | null;
  rawBody: string;
  appSecret: string | undefined;
  userAgent?: string | null;
  failureReason?: MetaWebhookSignatureFailureReason;
  selectedAlgorithm?: MetaWebhookSignatureAlgorithm;
  verifiedAlgorithm?: "sha256" | "sha1";
  sha256SignatureMatches?: boolean | null;
  sha1SignatureMatches?: boolean | null;
}): MetaWebhookSignatureDiagnostics {
  const hasSha256Signature = Boolean(input.signature256Header?.trim());
  const hasSha1Signature = Boolean(input.signatureHeader?.trim());
  const selectedAlgorithm =
    input.selectedAlgorithm ??
    (hasSha256Signature ? "sha256" : hasSha1Signature ? "sha1" : "none");
  const signatureMatches =
    input.sha256SignatureMatches === undefined || input.sha1SignatureMatches === undefined
      ? computeMetaHubSignatureMatches(input)
      : {
          sha256SignatureMatches: input.sha256SignatureMatches,
          sha1SignatureMatches: input.sha1SignatureMatches
        };

  return {
    route: input.route,
    hasSha256Signature,
    hasSha1Signature,
    selectedAlgorithm,
    rawBodyByteLength: Buffer.byteLength(input.rawBody, "utf8"),
    secretConfigured: Boolean(input.appSecret?.trim()),
    sha256SignatureMatches: signatureMatches.sha256SignatureMatches,
    sha1SignatureMatches: signatureMatches.sha1SignatureMatches,
    ...(input.verifiedAlgorithm ? { verifiedAlgorithm: input.verifiedAlgorithm } : {}),
    ...(input.failureReason ? { failureReason: input.failureReason } : {}),
    isFacebookExternalUa: isFacebookExternalUserAgent(input.userAgent ?? null)
  };
}

/** @deprecated Use buildMetaWebhookSignatureDiagnostics */
export function buildInstagramWebhookSignatureDiagnostics(
  input: Omit<Parameters<typeof buildMetaWebhookSignatureDiagnostics>[0], "route"> & {
    route?: MetaWebhookSignatureRoute;
  }
): MetaWebhookSignatureDiagnostics {
  return buildMetaWebhookSignatureDiagnostics({
    ...input,
    route: input.route ?? INSTAGRAM_WEBHOOK_SIGNATURE_ROUTE
  });
}

/** Prefer X-Hub-Signature-256; fall back to legacy X-Hub-Signature (sha1) when 256 is absent. */
export function evaluateMetaHubWebhookSignature(input: {
  route: MetaWebhookSignatureRoute;
  appSecret: string | undefined;
  signature256Header: string | null;
  signatureHeader: string | null;
  rawBody: string;
  userAgent?: string | null;
}): { result: WebhookSignatureVerifyResult; diagnostics: MetaWebhookSignatureDiagnostics } {
  const signature256Header = input.signature256Header?.trim() ?? "";
  const legacySignatureHeader = input.signatureHeader?.trim() ?? "";
  const hasSha256Signature = Boolean(signature256Header);
  const hasSha1Signature = Boolean(legacySignatureHeader);
  const appSecret = input.appSecret?.trim();
  const signatureMatches = computeMetaHubSignatureMatches(input);

  if (!appSecret) {
    return {
      result: { ok: false, status: 401, error: WEBHOOK_SIGNATURE_MISCONFIGURED },
      diagnostics: buildMetaWebhookSignatureDiagnostics({
        ...input,
        appSecret: undefined,
        failureReason: "missing_secret",
        selectedAlgorithm: hasSha256Signature ? "sha256" : hasSha1Signature ? "sha1" : "none",
        sha256SignatureMatches: signatureMatches.sha256SignatureMatches,
        sha1SignatureMatches: signatureMatches.sha1SignatureMatches
      })
    };
  }

  if (hasSha256Signature) {
    const actual = parseMetaHubSignature256(signature256Header);
    if (!actual) {
      return {
        result: { ok: false, status: 401, error: WEBHOOK_SIGNATURE_UNAUTHORIZED },
        diagnostics: buildMetaWebhookSignatureDiagnostics({
          ...input,
          appSecret,
          failureReason: "unsupported_signature_format",
          selectedAlgorithm: "sha256",
          sha256SignatureMatches: signatureMatches.sha256SignatureMatches,
          sha1SignatureMatches: signatureMatches.sha1SignatureMatches
        })
      };
    }
    const expected = computeMetaHubSignature256(appSecret, input.rawBody);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return {
        result: { ok: false, status: 401, error: WEBHOOK_SIGNATURE_UNAUTHORIZED },
        diagnostics: buildMetaWebhookSignatureDiagnostics({
          ...input,
          appSecret,
          failureReason: "invalid_signature",
          selectedAlgorithm: "sha256",
          sha256SignatureMatches: signatureMatches.sha256SignatureMatches,
          sha1SignatureMatches: signatureMatches.sha1SignatureMatches
        })
      };
    }
    return {
      result: { ok: true },
      diagnostics: buildMetaWebhookSignatureDiagnostics({
        ...input,
        appSecret,
        selectedAlgorithm: "sha256",
        verifiedAlgorithm: "sha256",
        sha256SignatureMatches: signatureMatches.sha256SignatureMatches,
        sha1SignatureMatches: signatureMatches.sha1SignatureMatches
      })
    };
  }

  if (!hasSha1Signature) {
    return {
      result: { ok: false, status: 401, error: WEBHOOK_SIGNATURE_UNAUTHORIZED },
      diagnostics: buildMetaWebhookSignatureDiagnostics({
        ...input,
        appSecret,
        failureReason: "missing_signature",
        selectedAlgorithm: "none",
        sha256SignatureMatches: signatureMatches.sha256SignatureMatches,
        sha1SignatureMatches: signatureMatches.sha1SignatureMatches
      })
    };
  }

  const actualSha1 = parseMetaHubSignatureSha1(legacySignatureHeader);
  if (!actualSha1) {
    return {
      result: { ok: false, status: 401, error: WEBHOOK_SIGNATURE_UNAUTHORIZED },
      diagnostics: buildMetaWebhookSignatureDiagnostics({
        ...input,
        appSecret,
        failureReason: "unsupported_signature_format",
        selectedAlgorithm: "sha1",
        sha256SignatureMatches: signatureMatches.sha256SignatureMatches,
        sha1SignatureMatches: signatureMatches.sha1SignatureMatches
      })
    };
  }
  const expectedSha1 = computeMetaHubSignatureSha1(appSecret, input.rawBody);
  if (expectedSha1.length !== actualSha1.length || !timingSafeEqual(expectedSha1, actualSha1)) {
    return {
      result: { ok: false, status: 401, error: WEBHOOK_SIGNATURE_UNAUTHORIZED },
      diagnostics: buildMetaWebhookSignatureDiagnostics({
        ...input,
        appSecret,
        failureReason: "invalid_signature",
        selectedAlgorithm: "sha1",
        sha256SignatureMatches: signatureMatches.sha256SignatureMatches,
        sha1SignatureMatches: signatureMatches.sha1SignatureMatches
      })
    };
  }

  return {
    result: { ok: true },
    diagnostics: buildMetaWebhookSignatureDiagnostics({
      ...input,
      appSecret,
      selectedAlgorithm: "sha1",
      verifiedAlgorithm: "sha1",
      sha256SignatureMatches: signatureMatches.sha256SignatureMatches,
      sha1SignatureMatches: signatureMatches.sha1SignatureMatches
    })
  };
}

export function verifyMetaHubWebhookSignature(input: {
  appSecret: string | undefined;
  signature256Header: string | null;
  signatureHeader: string | null;
  rawBody: string;
}): WebhookSignatureVerifyResult {
  return evaluateMetaHubWebhookSignature({
    ...input,
    route: FACEBOOK_WEBHOOK_SIGNATURE_ROUTE
  }).result;
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
