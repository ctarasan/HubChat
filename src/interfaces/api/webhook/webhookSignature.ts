import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_SIGNATURE_UNAUTHORIZED = "Unauthorized webhook request";
export const WEBHOOK_SIGNATURE_MISCONFIGURED = "Webhook signature verification is not configured";

export type WebhookSignatureVerifyResult =
  | { ok: true }
  | { ok: false; status: 401; error: string };

export function resolveMetaAppSecret(
  env: Record<string, string | undefined> = process.env
): string | undefined {
  const candidates = [
    env.META_APP_SECRET,
    env.FACEBOOK_APP_SECRET,
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

export function verifyMetaHubSignature256(input: {
  appSecret: string | undefined;
  signatureHeader: string | null;
  rawBody: string;
}): WebhookSignatureVerifyResult {
  const appSecret = input.appSecret?.trim();
  if (!appSecret) {
    return { ok: false, status: 401, error: WEBHOOK_SIGNATURE_MISCONFIGURED };
  }
  const signatureHeader = input.signatureHeader?.trim();
  if (!signatureHeader) {
    return { ok: false, status: 401, error: WEBHOOK_SIGNATURE_UNAUTHORIZED };
  }
  const actual = parseMetaHubSignature256(signatureHeader);
  if (!actual) {
    return { ok: false, status: 401, error: WEBHOOK_SIGNATURE_UNAUTHORIZED };
  }
  const expected = computeMetaHubSignature256(appSecret, input.rawBody);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, status: 401, error: WEBHOOK_SIGNATURE_UNAUTHORIZED };
  }
  return { ok: true };
}
