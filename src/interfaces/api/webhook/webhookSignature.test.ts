import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  computeLineWebhookSignature,
  computeMetaHubSignature256,
  computeMetaHubSignatureSha1,
  evaluateMetaHubWebhookSignature,
  FACEBOOK_WEBHOOK_SIGNATURE_ROUTE,
  INSTAGRAM_WEBHOOK_SIGNATURE_ROUTE,
  isFacebookExternalUserAgent,
  parseMetaHubSignature256,
  parseMetaHubSignatureSha1,
  resolveMetaAppSecret,
  verifyLineWebhookSignature,
  verifyMetaHubSignature256,
  verifyMetaHubWebhookSignature,
  WEBHOOK_SIGNATURE_MISCONFIGURED,
  WEBHOOK_SIGNATURE_UNAUTHORIZED
} from "./webhookSignature.js";

test("computeLineWebhookSignature matches LINE HMAC-SHA256 base64", () => {
  const body = '{"events":[]}';
  const sig = computeLineWebhookSignature("channel-secret", body);
  const expected = createHmac("sha256", "channel-secret").update(body, "utf8").digest("base64");
  assert.equal(sig, expected);
});

test("verifyLineWebhookSignature accepts valid signature", () => {
  const rawBody = '{"events":[{"type":"message"}]}';
  const secret = "line-secret";
  const signature = computeLineWebhookSignature(secret, rawBody);
  const result = verifyLineWebhookSignature({
    channelSecret: secret,
    signatureHeader: signature,
    rawBody
  });
  assert.equal(result.ok, true);
});

test("verifyLineWebhookSignature rejects missing and invalid signatures", () => {
  const rawBody = "{}";
  const missing = verifyLineWebhookSignature({ channelSecret: "s", signatureHeader: null, rawBody });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error, WEBHOOK_SIGNATURE_UNAUTHORIZED);
  assert.equal(
    verifyLineWebhookSignature({ channelSecret: "s", signatureHeader: "bad", rawBody }).ok,
    false
  );
  const misconfigured = verifyLineWebhookSignature({
    channelSecret: undefined,
    signatureHeader: "x",
    rawBody
  });
  assert.equal(misconfigured.ok, false);
  if (!misconfigured.ok) assert.equal(misconfigured.error, WEBHOOK_SIGNATURE_MISCONFIGURED);
});

test("parseMetaHubSignature256 parses sha256 hex and rejects malformed values", () => {
  const digest = createHmac("sha256", "meta").update("body", "utf8").digest("hex");
  assert.deepEqual(parseMetaHubSignature256(`sha256=${digest}`), Buffer.from(digest, "hex"));
  assert.equal(parseMetaHubSignature256("sha256=not-hex"), null);
  assert.equal(parseMetaHubSignature256("sha256=abc"), null);
  assert.equal(parseMetaHubSignature256("invalid"), null);
});

test("verifyMetaHubSignature256 accepts valid signature", () => {
  const rawBody = '{"object":"page","entry":[]}';
  const secret = "meta-app-secret";
  const digest = computeMetaHubSignature256(secret, rawBody).toString("hex");
  const result = verifyMetaHubSignature256({
    appSecret: secret,
    signatureHeader: `sha256=${digest}`,
    rawBody
  });
  assert.equal(result.ok, true);
});

test("parseMetaHubSignatureSha1 parses sha1 hex and rejects malformed values", () => {
  const digest = createHmac("sha1", "meta").update("body", "utf8").digest("hex");
  assert.deepEqual(parseMetaHubSignatureSha1(`sha1=${digest}`), Buffer.from(digest, "hex"));
  assert.equal(parseMetaHubSignatureSha1("sha1=not-hex"), null);
  assert.equal(parseMetaHubSignatureSha1("invalid"), null);
});

test("verifyMetaHubWebhookSignature accepts legacy sha1 when sha256 header is absent", () => {
  const rawBody = '{"object":"instagram","entry":[]}';
  const secret = "meta-app-secret";
  const digest = computeMetaHubSignatureSha1(secret, rawBody).toString("hex");
  const result = verifyMetaHubWebhookSignature({
    appSecret: secret,
    signature256Header: null,
    signatureHeader: `sha1=${digest}`,
    rawBody
  });
  assert.equal(result.ok, true);
});

test("verifyMetaHubWebhookSignature prefers sha256 and rejects invalid sha256 even if sha1 present", () => {
  const rawBody = '{"object":"instagram","entry":[]}';
  const secret = "meta-app-secret";
  const sha1Digest = computeMetaHubSignatureSha1(secret, rawBody).toString("hex");
  const result = verifyMetaHubWebhookSignature({
    appSecret: secret,
    signature256Header: "sha256=00",
    signatureHeader: `sha1=${sha1Digest}`,
    rawBody
  });
  assert.equal(result.ok, false);
});

test("verifyMetaHubSignature256 rejects missing secret and invalid signature", () => {
  const rawBody = "{}";
  const misconfigured = verifyMetaHubSignature256({
    appSecret: undefined,
    signatureHeader: "sha256=aa",
    rawBody
  });
  assert.equal(misconfigured.ok, false);
  if (!misconfigured.ok) assert.equal(misconfigured.error, WEBHOOK_SIGNATURE_MISCONFIGURED);
  const missing = verifyMetaHubSignature256({ appSecret: "s", signatureHeader: null, rawBody });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error, WEBHOOK_SIGNATURE_UNAUTHORIZED);
  assert.equal(
    verifyMetaHubSignature256({ appSecret: "s", signatureHeader: "sha256=deadbeef", rawBody }).ok,
    false
  );
});

test("evaluateMetaHubWebhookSignature diagnostics omit secrets signatures and raw body", () => {
  const rawBody = '{"object":"instagram","entry":[]}';
  const secret = "super-secret-app-key";
  const digest = computeMetaHubSignature256(secret, rawBody).toString("hex");
  const signatureHeader = `sha256=${digest}`;
  const { diagnostics } = evaluateMetaHubWebhookSignature({
    route: INSTAGRAM_WEBHOOK_SIGNATURE_ROUTE,
    appSecret: secret,
    signature256Header: signatureHeader,
    signatureHeader: null,
    rawBody,
    userAgent: "facebookexternalua/1.1"
  });
  assert.equal(diagnostics.route, INSTAGRAM_WEBHOOK_SIGNATURE_ROUTE);
  assert.equal(diagnostics.isFacebookExternalUa, true);
  assert.equal(diagnostics.rawBodyByteLength, Buffer.byteLength(rawBody, "utf8"));
  assert.equal(diagnostics.failureReason, undefined);
  assert.equal(diagnostics.sha256SignatureMatches, true);
  assert.equal(diagnostics.sha1SignatureMatches, null);
  assert.equal(diagnostics.verifiedAlgorithm, "sha256");
  const serialized = JSON.stringify(diagnostics);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes(signatureHeader), false);
  assert.equal(serialized.includes(rawBody), false);
});

test("evaluateMetaHubWebhookSignature reports missing_secret and missing_signature failure reasons", () => {
  const rawBody = "{}";
  const missingSecret = evaluateMetaHubWebhookSignature({
    route: INSTAGRAM_WEBHOOK_SIGNATURE_ROUTE,
    appSecret: undefined,
    signature256Header: "sha256=aa",
    signatureHeader: null,
    rawBody
  });
  assert.equal(missingSecret.diagnostics.failureReason, "missing_secret");
  assert.equal(missingSecret.diagnostics.secretConfigured, false);
  assert.equal(missingSecret.diagnostics.sha256SignatureMatches, null);
  assert.equal(missingSecret.diagnostics.sha1SignatureMatches, null);

  const missingSignature = evaluateMetaHubWebhookSignature({
    route: INSTAGRAM_WEBHOOK_SIGNATURE_ROUTE,
    appSecret: "meta-app-secret",
    signature256Header: null,
    signatureHeader: null,
    rawBody
  });
  assert.equal(missingSignature.diagnostics.failureReason, "missing_signature");
  assert.equal(missingSignature.diagnostics.selectedAlgorithm, "none");
});

test("evaluateMetaHubWebhookSignature reports unsupported and invalid sha256 failures", () => {
  const rawBody = '{"object":"instagram"}';
  const secret = "meta-app-secret";
  const unsupported = evaluateMetaHubWebhookSignature({
    route: INSTAGRAM_WEBHOOK_SIGNATURE_ROUTE,
    appSecret: secret,
    signature256Header: "not-sha256-format",
    signatureHeader: null,
    rawBody
  });
  assert.equal(unsupported.diagnostics.failureReason, "unsupported_signature_format");
  assert.equal(unsupported.diagnostics.selectedAlgorithm, "sha256");
  assert.equal(unsupported.diagnostics.sha256SignatureMatches, null);

  const invalid = evaluateMetaHubWebhookSignature({
    route: INSTAGRAM_WEBHOOK_SIGNATURE_ROUTE,
    appSecret: secret,
    signature256Header: "sha256=00",
    signatureHeader: null,
    rawBody
  });
  assert.equal(invalid.diagnostics.failureReason, "invalid_signature");
  assert.equal(invalid.diagnostics.sha256SignatureMatches, false);
  assert.equal(invalid.diagnostics.sha1SignatureMatches, null);
});

test("evaluateMetaHubWebhookSignature rejects invalid sha256 when valid sha1 is also present", () => {
  const rawBody = '{"object":"instagram","entry":[]}';
  const secret = "meta-app-secret";
  const sha1Digest = computeMetaHubSignatureSha1(secret, rawBody).toString("hex");
  const evaluated = evaluateMetaHubWebhookSignature({
    route: INSTAGRAM_WEBHOOK_SIGNATURE_ROUTE,
    appSecret: secret,
    signature256Header: "sha256=00",
    signatureHeader: `sha1=${sha1Digest}`,
    rawBody
  });
  assert.equal(evaluated.result.ok, false);
  assert.equal(evaluated.diagnostics.failureReason, "invalid_signature");
  assert.equal(evaluated.diagnostics.selectedAlgorithm, "sha256");
  assert.equal(evaluated.diagnostics.hasSha1Signature, true);
  assert.equal(evaluated.diagnostics.sha256SignatureMatches, false);
  assert.equal(evaluated.diagnostics.sha1SignatureMatches, true);
});

test("evaluateMetaHubWebhookSignature reports both match booleans false when both signatures invalid", () => {
  const rawBody = '{"object":"instagram","entry":[]}';
  const secret = "meta-app-secret";
  const evaluated = evaluateMetaHubWebhookSignature({
    route: INSTAGRAM_WEBHOOK_SIGNATURE_ROUTE,
    appSecret: secret,
    signature256Header: "sha256=00",
    signatureHeader: "sha1=00",
    rawBody
  });
  assert.equal(evaluated.result.ok, false);
  assert.equal(evaluated.diagnostics.sha256SignatureMatches, false);
  assert.equal(evaluated.diagnostics.sha1SignatureMatches, false);
});

test("evaluateMetaHubWebhookSignature facebook route success includes verifiedAlgorithm sha256", () => {
  const rawBody = '{"object":"instagram","entry":[]}';
  const secret = "meta-app-secret";
  const digest = computeMetaHubSignature256(secret, rawBody).toString("hex");
  const evaluated = evaluateMetaHubWebhookSignature({
    route: FACEBOOK_WEBHOOK_SIGNATURE_ROUTE,
    appSecret: secret,
    signature256Header: `sha256=${digest}`,
    signatureHeader: null,
    rawBody
  });
  assert.equal(evaluated.result.ok, true);
  assert.equal(evaluated.diagnostics.route, FACEBOOK_WEBHOOK_SIGNATURE_ROUTE);
  assert.equal(evaluated.diagnostics.verifiedAlgorithm, "sha256");
  assert.equal(evaluated.diagnostics.sha256SignatureMatches, true);
});

test("isFacebookExternalUserAgent detects facebookexternalua safely", () => {
  assert.equal(isFacebookExternalUserAgent("facebookexternalua/1.1"), true);
  assert.equal(isFacebookExternalUserAgent("Mozilla/5.0"), false);
  assert.equal(isFacebookExternalUserAgent(null), false);
});

test("resolveMetaAppSecret prefers FACEBOOK_APP_SECRET then META_APP_SECRET then INSTAGRAM_APP_SECRET", () => {
  assert.equal(
    resolveMetaAppSecret({ FACEBOOK_APP_SECRET: " fb ", META_APP_SECRET: "meta", INSTAGRAM_APP_SECRET: "ig" }),
    "fb"
  );
  assert.equal(resolveMetaAppSecret({ META_APP_SECRET: "meta", INSTAGRAM_APP_SECRET: "ig" }), "meta");
  assert.equal(resolveMetaAppSecret({ INSTAGRAM_APP_SECRET: "ig" }), "ig");
});
