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

export type MetaAppSecretSourceName =
  | "INSTAGRAM_APP_SECRET"
  | "FACEBOOK_APP_SECRET"
  | "META_APP_SECRET";

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
  configuredSecretSources: MetaAppSecretSourceName[];
  matchedSecretSource?: MetaAppSecretSourceName;
  attemptedSecretSources?: MetaAppSecretSourceName[];
  sha256SignatureMatches: boolean | null;
  sha1SignatureMatches: boolean | null;
  verifiedAlgorithm?: "sha256" | "sha1";
  failureReason?: MetaWebhookSignatureFailureReason;
  isFacebookExternalUa: boolean;
};

/** @deprecated Use MetaWebhookSignatureDiagnostics */
export type InstagramWebhookSignatureDiagnostics = MetaWebhookSignatureDiagnostics;

const META_APP_SECRET_ENV_KEYS: Record<MetaAppSecretSourceName, string> = {
  INSTAGRAM_APP_SECRET: "INSTAGRAM_APP_SECRET",
  FACEBOOK_APP_SECRET: "FACEBOOK_APP_SECRET",
  META_APP_SECRET: "META_APP_SECRET"
};

const ROUTE_SECRET_SOURCE_ORDER: Record<MetaWebhookSignatureRoute, MetaAppSecretSourceName[]> = {
  [INSTAGRAM_WEBHOOK_SIGNATURE_ROUTE]: [
    "INSTAGRAM_APP_SECRET",
    "FACEBOOK_APP_SECRET",
    "META_APP_SECRET"
  ],
  [FACEBOOK_WEBHOOK_SIGNATURE_ROUTE]: ["FACEBOOK_APP_SECRET", "META_APP_SECRET"]
};

export function isFacebookExternalUserAgent(userAgent: string | null | undefined): boolean {
  const normalized = typeof userAgent === "string" ? userAgent.trim().toLowerCase() : "";
  return normalized.includes("facebookexternalua");
}

export function listConfiguredMetaAppSecretSourceNames(
  route: MetaWebhookSignatureRoute,
  env: Record<string, string | undefined> = process.env
): MetaAppSecretSourceName[] {
  return ROUTE_SECRET_SOURCE_ORDER[route].filter((source) =>
    Boolean(env[META_APP_SECRET_ENV_KEYS[source]]?.trim())
  );
}

export function getMetaAppSecretCandidatesForRoute(
  route: MetaWebhookSignatureRoute,
  env: Record<string, string | undefined> = process.env
): Array<{ source: MetaAppSecretSourceName; secret: string }> {
  return ROUTE_SECRET_SOURCE_ORDER[route]
    .map((source) => {
      const secret = env[META_APP_SECRET_ENV_KEYS[source]]?.trim() ?? "";
      return secret ? { source, secret } : null;
    })
    .filter((entry): entry is { source: MetaAppSecretSourceName; secret: string } => entry !== null);
}

/** Facebook route default: FACEBOOK_APP_SECRET, then META_APP_SECRET, then INSTAGRAM_APP_SECRET. */
export function resolveMetaAppSecret(
  env: Record<string, string | undefined> = process.env
): string | undefined {
  return getMetaAppSecretCandidatesForRoute(FACEBOOK_WEBHOOK_SIGNATURE_ROUTE, env)[0]?.secret;
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

function verifyMetaHubWebhookSignatureWithSecret(input: {
  appSecret: string;
  signature256Header: string | null;
  signatureHeader: string | null;
  rawBody: string;
}):
  | { ok: true; verifiedAlgorithm: "sha256" | "sha1"; selectedAlgorithm: MetaWebhookSignatureAlgorithm }
  | { ok: false; failureReason: MetaWebhookSignatureFailureReason; selectedAlgorithm: MetaWebhookSignatureAlgorithm } {
  const signature256Header = input.signature256Header?.trim() ?? "";
  const legacySignatureHeader = input.signatureHeader?.trim() ?? "";
  const hasSha256Signature = Boolean(signature256Header);
  const hasSha1Signature = Boolean(legacySignatureHeader);

  if (hasSha256Signature) {
    const actual = parseMetaHubSignature256(signature256Header);
    if (!actual) {
      return { ok: false, failureReason: "unsupported_signature_format", selectedAlgorithm: "sha256" };
    }
    const expected = computeMetaHubSignature256(input.appSecret, input.rawBody);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return { ok: false, failureReason: "invalid_signature", selectedAlgorithm: "sha256" };
    }
    return { ok: true, verifiedAlgorithm: "sha256", selectedAlgorithm: "sha256" };
  }

  if (!hasSha1Signature) {
    return { ok: false, failureReason: "missing_signature", selectedAlgorithm: "none" };
  }

  const actualSha1 = parseMetaHubSignatureSha1(legacySignatureHeader);
  if (!actualSha1) {
    return { ok: false, failureReason: "unsupported_signature_format", selectedAlgorithm: "sha1" };
  }
  const expectedSha1 = computeMetaHubSignatureSha1(input.appSecret, input.rawBody);
  if (expectedSha1.length !== actualSha1.length || !timingSafeEqual(expectedSha1, actualSha1)) {
    return { ok: false, failureReason: "invalid_signature", selectedAlgorithm: "sha1" };
  }
  return { ok: true, verifiedAlgorithm: "sha1", selectedAlgorithm: "sha1" };
}

export function buildMetaWebhookSignatureDiagnostics(input: {
  route: MetaWebhookSignatureRoute;
  signature256Header: string | null;
  signatureHeader: string | null;
  rawBody: string;
  userAgent?: string | null;
  configuredSecretSources: MetaAppSecretSourceName[];
  matchedSecretSource?: MetaAppSecretSourceName;
  attemptedSecretSources?: MetaAppSecretSourceName[];
  appSecretForMatchBooleans?: string;
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
      ? computeMetaHubSignatureMatches({
          appSecret: input.appSecretForMatchBooleans,
          signature256Header: input.signature256Header,
          signatureHeader: input.signatureHeader,
          rawBody: input.rawBody
        })
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
    secretConfigured: input.configuredSecretSources.length > 0,
    configuredSecretSources: input.configuredSecretSources,
    ...(input.matchedSecretSource ? { matchedSecretSource: input.matchedSecretSource } : {}),
    ...(input.attemptedSecretSources?.length
      ? { attemptedSecretSources: input.attemptedSecretSources }
      : {}),
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
    route: input.route ?? INSTAGRAM_WEBHOOK_SIGNATURE_ROUTE,
    configuredSecretSources:
      input.configuredSecretSources ??
      listConfiguredMetaAppSecretSourceNames(INSTAGRAM_WEBHOOK_SIGNATURE_ROUTE)
  });
}

/** Prefer X-Hub-Signature-256; fall back to legacy X-Hub-Signature (sha1) when 256 is absent. */
export function evaluateMetaHubWebhookSignature(input: {
  route: MetaWebhookSignatureRoute;
  signature256Header: string | null;
  signatureHeader: string | null;
  rawBody: string;
  userAgent?: string | null;
  env?: Record<string, string | undefined>;
}): { result: WebhookSignatureVerifyResult; diagnostics: MetaWebhookSignatureDiagnostics } {
  const env = input.env ?? process.env;
  const configuredSecretSources = listConfiguredMetaAppSecretSourceNames(input.route, env);
  const candidates = getMetaAppSecretCandidatesForRoute(input.route, env);
  const signature256Header = input.signature256Header?.trim() ?? "";
  const legacySignatureHeader = input.signatureHeader?.trim() ?? "";
  const hasSha256Signature = Boolean(signature256Header);
  const hasSha1Signature = Boolean(legacySignatureHeader);

  if (candidates.length === 0) {
    return {
      result: { ok: false, status: 401, error: WEBHOOK_SIGNATURE_MISCONFIGURED },
      diagnostics: buildMetaWebhookSignatureDiagnostics({
        route: input.route,
        signature256Header: input.signature256Header,
        signatureHeader: input.signatureHeader,
        rawBody: input.rawBody,
        userAgent: input.userAgent,
        configuredSecretSources,
        failureReason: "missing_secret",
        selectedAlgorithm: hasSha256Signature ? "sha256" : hasSha1Signature ? "sha1" : "none"
      })
    };
  }

  const attemptedSecretSources: MetaAppSecretSourceName[] = [];
  let lastFailure:
    | {
        failureReason: MetaWebhookSignatureFailureReason;
        selectedAlgorithm: MetaWebhookSignatureAlgorithm;
        secret: string;
        source: MetaAppSecretSourceName;
      }
    | undefined;

  for (const candidate of candidates) {
    attemptedSecretSources.push(candidate.source);
    const attempt = verifyMetaHubWebhookSignatureWithSecret({
      appSecret: candidate.secret,
      signature256Header: input.signature256Header,
      signatureHeader: input.signatureHeader,
      rawBody: input.rawBody
    });
    if (attempt.ok) {
      const signatureMatches = computeMetaHubSignatureMatches({
        appSecret: candidate.secret,
        signature256Header: input.signature256Header,
        signatureHeader: input.signatureHeader,
        rawBody: input.rawBody
      });
      return {
        result: { ok: true },
        diagnostics: buildMetaWebhookSignatureDiagnostics({
          route: input.route,
          signature256Header: input.signature256Header,
          signatureHeader: input.signatureHeader,
          rawBody: input.rawBody,
          userAgent: input.userAgent,
          configuredSecretSources,
          matchedSecretSource: candidate.source,
          selectedAlgorithm: attempt.selectedAlgorithm,
          verifiedAlgorithm: attempt.verifiedAlgorithm,
          sha256SignatureMatches: signatureMatches.sha256SignatureMatches,
          sha1SignatureMatches: signatureMatches.sha1SignatureMatches
        })
      };
    }
    lastFailure = {
      failureReason: attempt.failureReason,
      selectedAlgorithm: attempt.selectedAlgorithm,
      secret: candidate.secret,
      source: candidate.source
    };
    if (
      attempt.failureReason === "unsupported_signature_format" ||
      attempt.failureReason === "missing_signature"
    ) {
      break;
    }
  }

  const failureReason = lastFailure?.failureReason ?? "invalid_signature";
  const selectedAlgorithm = lastFailure?.selectedAlgorithm ?? (hasSha256Signature ? "sha256" : hasSha1Signature ? "sha1" : "none");
  const matchSecret = lastFailure?.secret ?? candidates[0]?.secret;
  const signatureMatches = computeMetaHubSignatureMatches({
    appSecret: matchSecret,
    signature256Header: input.signature256Header,
    signatureHeader: input.signatureHeader,
    rawBody: input.rawBody
  });

  return {
    result: { ok: false, status: 401, error: WEBHOOK_SIGNATURE_UNAUTHORIZED },
    diagnostics: buildMetaWebhookSignatureDiagnostics({
      route: input.route,
      signature256Header: input.signature256Header,
      signatureHeader: input.signatureHeader,
      rawBody: input.rawBody,
      userAgent: input.userAgent,
      configuredSecretSources,
      attemptedSecretSources,
      failureReason,
      selectedAlgorithm,
      appSecretForMatchBooleans: matchSecret,
      sha256SignatureMatches: signatureMatches.sha256SignatureMatches,
      sha1SignatureMatches: signatureMatches.sha1SignatureMatches
    })
  };
}

export function verifyMetaHubWebhookSignature(input: {
  route?: MetaWebhookSignatureRoute;
  signature256Header: string | null;
  signatureHeader: string | null;
  rawBody: string;
  env?: Record<string, string | undefined>;
}): WebhookSignatureVerifyResult {
  return evaluateMetaHubWebhookSignature({
    route: input.route ?? FACEBOOK_WEBHOOK_SIGNATURE_ROUTE,
    signature256Header: input.signature256Header,
    signatureHeader: input.signatureHeader,
    rawBody: input.rawBody,
    env: input.env
  }).result;
}

export function verifyMetaHubSignature256(input: {
  appSecret: string | undefined;
  signatureHeader: string | null;
  rawBody: string;
}): WebhookSignatureVerifyResult {
  if (!input.appSecret?.trim()) {
    return { ok: false, status: 401, error: WEBHOOK_SIGNATURE_MISCONFIGURED };
  }
  return verifyMetaHubWebhookSignatureWithSecret({
    appSecret: input.appSecret.trim(),
    signature256Header: input.signatureHeader,
    signatureHeader: null,
    rawBody: input.rawBody
  }).ok
    ? { ok: true }
    : { ok: false, status: 401, error: WEBHOOK_SIGNATURE_UNAUTHORIZED };
}
